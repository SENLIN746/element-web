/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { AccountAuthInfo, AgentIMApi, Api } from "@element-hq/element-web-module-api";
import { decode } from "../../protocol/validation";
import type { AccountCredentialFile } from "../../protocol/models";
import type { IdentityService } from "../identity/IdentityService";
import { AccountCredentialStore, type AccountLoginAttempt, type CredentialRecord } from "./AccountCredentialStore";

const base64url = (bytes: Uint8Array): string =>
    btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
const random = (): string => base64url(crypto.getRandomValues(new Uint8Array(32)));
const BASE = "/_synapse/client/agentim/v2/account";

/** Portable account authority is distinct from bootstrap proofs and encrypted history keys. */
export class AccountCredentialService {
    public constructor(
        private readonly identity: IdentityService,
        private readonly home: string,
        private readonly store = new AccountCredentialStore(),
    ) {}
    private key(user: string): string {
        return `${this.home}|${user}`;
    }
    public async supported(signal: AbortSignal): Promise<void> {
        const value = await this.identity.get(BASE, signal);
        if (!value || typeof value !== "object" || !("credential_login" in value) || value.credential_login !== true)
            throw new Error("Account credentials require a matching service");
    }
    private async create(user: string, submit: (body: unknown) => Promise<unknown>): Promise<CredentialRecord> {
        const key = this.key(user);
        let record = await this.store.get<CredentialRecord>("credentials", key);
        if (!record) {
            record = {
                key,
                verified: false,
                credential: {
                    version: 1,
                    kind: "agentim-account-credential",
                    homeserver: this.home,
                    user_id: user,
                    credential_id: random(),
                    credential_secret: random(),
                },
            };
            await this.store.save("credentials", record, true);
        }
        const challenge = base64url(
            new Uint8Array(
                await crypto.subtle.digest("SHA-256", new TextEncoder().encode(record.credential.credential_secret)),
            ),
        );
        const status = decode(
            "AccountCredentialStatus",
            await submit({ credential_id: record.credential.credential_id, code_challenge: challenge }),
        );
        if (status.user_id !== user || status.credential_id !== record.credential.credential_id || status.revoked)
            throw new Error("Account credential binding changed");
        return record;
    }
    public createForRegistration(account: AccountAuthInfo, signal: AbortSignal): Promise<CredentialRecord> {
        return this.create(account.userId, (body) =>
            this.identity.post(`${BASE}/credentials`, body, signal, account.accessToken),
        );
    }
    public async createForSession(api: AgentIMApi, user: string): Promise<CredentialRecord> {
        const cached = await this.store.get<CredentialRecord>("credentials", this.key(user));
        if (cached) {
            const status = decode("AccountCredentialList", await api.request("GET", "/account/credentials"));
            if (!status.credentials.some((value) => value.credential_id === cached.credential.credential_id)) {
                await this.store.removeCredential(cached.key);
            }
        }
        return this.create(user, (body) => api.request("POST", "/account/credentials", {}, body));
    }
    public async revoke(api: AgentIMApi, record: CredentialRecord): Promise<void> {
        await api.request("POST", `/account/credentials/${record.credential.credential_id}/revoke`, {}, {});
        await this.store.removeCredential(record.key);
    }
    public parse(text: string): AccountCredentialFile {
        if (new TextEncoder().encode(text).byteLength > 8192)
            throw new Error("Account credential exceeds its byte budget");
        let value: unknown;
        try {
            value = JSON.parse(text) as unknown;
        } catch {
            throw new Error("Invalid account credential file");
        }
        const credential = decode("AccountCredentialFile", value);
        if (credential.homeserver !== this.home) throw new Error("Credential belongs to another service");
        return credential;
    }
    public async verifySaved(record: CredentialRecord, text: string, signal: AbortSignal): Promise<void> {
        const candidate = this.parse(text);
        if (
            candidate.user_id !== record.credential.user_id ||
            candidate.credential_id !== record.credential.credential_id ||
            candidate.credential_secret !== record.credential.credential_secret
        )
            throw new Error("Saved credential does not match this account");
        const status = decode(
            "AccountCredentialStatus",
            await this.identity.post(
                `${BASE}/credentials/verify`,
                { credential_id: candidate.credential_id, credential_secret: candidate.credential_secret },
                signal,
            ),
        );
        if (status.user_id !== candidate.user_id || status.credential_id !== candidate.credential_id || status.revoked)
            throw new Error("Saved credential is unavailable");
        await this.store.save("credentials", { ...record, verified: true });
    }
    public download(record: CredentialRecord): void {
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(record.credential, null, 2) + "\n"], { type: "application/json" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "AgentIM-account-credential.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    public async recover(text: string, signal: AbortSignal): Promise<AccountAuthInfo> {
        const credential = this.parse(text);
        const key = `login|${this.key(credential.user_id)}|${credential.credential_id}`;
        let attempt = await this.store.get<AccountLoginAttempt>("logins", key);
        if (!attempt) {
            attempt = { key, attemptId: random(), deviceId: random() };
            await this.store.save("logins", attempt, true);
        }
        if (attempt.account) return attempt.account;
        const grant = decode(
            "AccountDeviceGrant",
            await this.identity.post(
                `${BASE}/login`,
                {
                    credential_id: credential.credential_id,
                    credential_secret: credential.credential_secret,
                    expected_user_id: credential.user_id,
                    attempt_id: attempt.attemptId,
                    device_id: attempt.deviceId,
                },
                signal,
            ),
        );
        if (
            grant.user_id !== credential.user_id ||
            grant.device_id !== attempt.deviceId ||
            grant.attempt_id !== attempt.attemptId
        )
            throw new Error("Recovered device binding changed");
        const account: AccountAuthInfo = {
            homeserverUrl: this.home,
            userId: grant.user_id,
            deviceId: grant.device_id,
            accessToken: grant.access_token,
            ...(grant.refresh_token ? { refreshToken: grant.refresh_token } : {}),
        };
        await this.store.save("logins", { ...attempt, account });
        await this.store.save("credentials", { key: this.key(credential.user_id), credential, verified: true });
        window.dispatchEvent(new Event("agentim-onboarding-changed"));
        return account;
    }
    public async completeWhenReady(api: Api): Promise<void> {
        const attempts = (await this.store.allLogins()).filter((value) => value.account?.homeserverUrl === this.home);
        if (!attempts.length) return;
        await api.stores.roomListStore.waitForReady();
        const actor = decode("AgentProfile", await api.client.agentim.request("GET", "/profiles/me"));
        for (const attempt of attempts) {
            const account = attempt.account;
            if (!account || actor.user_id !== account.userId) continue;
            const signal = AbortSignal.timeout(30000);
            const response = (await this.identity.post(
                "/_matrix/client/v3/keys/query",
                { device_keys: { [account.userId]: [account.deviceId] } },
                signal,
                account.accessToken,
            )) as { device_keys?: Record<string, Record<string, { keys?: Record<string, string> }>> };
            const keys = response.device_keys?.[account.userId]?.[account.deviceId]?.keys;
            if (!keys?.[`ed25519:${account.deviceId}`] || !keys[`curve25519:${account.deviceId}`])
                throw new Error("Recovered crypto device is still starting");
            await this.identity.post(`${BASE}/logins/${attempt.attemptId}/complete`, {}, signal, account.accessToken);
            await this.store.removeLogin(attempt.key);
        }
    }
}
