/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { AccountAuthInfo, Api } from "@element-hq/element-web-module-api";
import { decode } from "../../protocol/validation";
import type { ModuleConfig } from "../../configuration/ModuleConfig";
import { OnboardingStore, type BrowserAttempt } from "./OnboardingStore";
import type { IdentityService } from "./IdentityService";

const PATH = "/_synapse/client/agentim/v2/registration";
const base64url = (bytes: Uint8Array): string =>
    btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
const random = (): string => base64url(crypto.getRandomValues(new Uint8Array(32)));

/** Proof-owned registration; the native Element host retains the actual communication device. */
export class OnboardingService {
    public constructor(
        private readonly identity: IdentityService,
        private readonly config: ModuleConfig,
        private readonly store = new OnboardingStore(),
    ) {}

    public async isOpen(signal: AbortSignal): Promise<boolean> {
        return decode("OnboardingCapabilities", await this.identity.get(PATH, signal)).mode === "open";
    }

    private async attempt(localpart: string): Promise<BrowserAttempt> {
        const key = `${this.config.homeserverUrl}|${localpart}`;
        const existing = (await this.store.all()).find((value) => value.key === key);
        if (existing) return existing;
        const value = {
            key,
            homeserver: this.config.homeserverUrl,
            localpart,
            attemptId: random(),
            verifier: random(),
            deviceId: random(),
        };
        // add(), rather than put(), protects concurrent tabs from replacing an existing proof.
        await this.store.save(value, true);
        return value;
    }

    public async enroll(localpart: string, signal: AbortSignal): Promise<AccountAuthInfo> {
        if (!/^[a-z][a-z0-9._=-]{2,63}$/.test(localpart)) throw new Error("Invalid Agent ID");
        if (!(await this.isOpen(signal))) throw new Error("Registration is closed");
        const attempt = await this.attempt(localpart);
        if (attempt.account) return attempt.account;
        const challenge = base64url(
            new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(attempt.verifier))),
        );
        const status = decode(
            "OnboardingStatus",
            await this.identity.post(
                PATH,
                decode("OnboardingCreate", {
                    localpart,
                    attempt_id: attempt.attemptId,
                    device_id: attempt.deviceId,
                    code_challenge: challenge,
                }),
                signal,
            ),
        );
        if (status.attempt_id !== attempt.attemptId || status.device_id !== attempt.deviceId)
            throw new Error("Registration attempt binding changed");
        const grant = decode(
            "OnboardingGrant",
            await this.identity.post(
                `${PATH}/${attempt.attemptId}/consume`,
                {
                    verifier: attempt.verifier,
                },
                signal,
            ),
        );
        if (
            grant.attempt_id !== attempt.attemptId ||
            grant.device_id !== attempt.deviceId ||
            !grant.user_id.startsWith(`@${localpart}:`) ||
            (this.config.serverName && grant.user_id !== `@${localpart}:${this.config.serverName}`)
        )
            throw new Error("Registration identity binding changed");
        const account = await this.identity.login(grant.login_token, signal, attempt.deviceId);
        if (account.userId !== grant.user_id || account.deviceId !== attempt.deviceId)
            throw new Error("Registration device binding changed");
        await this.store.save({ ...attempt, account });
        return account;
    }

    /** Runs outside the login view lifetime, including after a browser refresh. */
    public async completeWhenReady(api: Api): Promise<void> {
        const attempts = (await this.store.all()).filter(
            (value) => value.homeserver === this.config.homeserverUrl && value.account,
        );
        if (!attempts.length) return;
        await api.stores.roomListStore.waitForReady();
        const profile = decode("AgentProfile", await api.client.agentim.request("GET", "/profiles/me"));
        for (const attempt of attempts) {
            const account = attempt.account;
            if (attempt.homeserver !== this.config.homeserverUrl || !account || profile.user_id !== account.userId)
                continue;
            const signal = AbortSignal.timeout(30000);
            const response = (await this.identity.post(
                "/_matrix/client/v3/keys/query",
                {
                    device_keys: { [account.userId]: [account.deviceId] },
                },
                signal,
                account.accessToken,
            )) as { device_keys?: Record<string, Record<string, { keys?: Record<string, string> }>> };
            const keys = response.device_keys?.[account.userId]?.[account.deviceId]?.keys;
            if (!keys?.[`ed25519:${account.deviceId}`] || !keys[`curve25519:${account.deviceId}`])
                throw new Error("Registration device encryption is not ready");
            const result = await this.identity.post(
                `${PATH}/${attempt.attemptId}/complete`,
                {},
                signal,
                account.accessToken,
            );
            if (!result || (result as { completed?: boolean }).completed !== true)
                throw new Error("Registration completion was not confirmed");
            await this.store.remove(attempt.key);
        }
    }
}
