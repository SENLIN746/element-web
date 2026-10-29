/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { AccountAuthInfo } from "@element-hq/element-web-module-api";
import type { ModuleConfig } from "../../configuration/ModuleConfig";
import { OnboardingService } from "./OnboardingService";

/** Enroll a native identity or exchange a one-use login token for a new independent device. */
export class IdentityService {
    public readonly onboarding: OnboardingService;
    public constructor(private readonly config: ModuleConfig) {
        this.onboarding = new OnboardingService(this, config);
    }

    public async enroll(localpart: string, signal: AbortSignal): Promise<AccountAuthInfo> {
        return this.onboarding.enroll(localpart, signal);
    }

    public async post(path: string, body: unknown, signal: AbortSignal, bearer?: string): Promise<unknown> {
        return this.request("POST", path, body, signal, bearer);
    }

    public async get(path: string, signal: AbortSignal): Promise<unknown> {
        return this.request("GET", path, undefined, signal);
    }

    private async request(
        method: string,
        path: string,
        body: unknown,
        signal: AbortSignal,
        bearer?: string,
    ): Promise<unknown> {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (bearer !== undefined) {
            if (!bearer || bearer.length > 8192 || !/^[\x21-\x7e]+$/.test(bearer))
                throw new Error("Invalid device credential");
            headers.Authorization = `Bearer ${bearer}`;
        }
        const serialized = body === undefined ? undefined : JSON.stringify(body);
        if (new TextEncoder().encode(serialized).byteLength > 8192)
            throw new Error("Identity request exceeds its byte budget");
        const endpoint = new URL(path, this.config.homeserverUrl);
        if (endpoint.origin !== this.config.homeserverUrl) throw new Error("Identity origin changed");
        const response = await fetch(endpoint, {
            method,
            headers,
            body: serialized,
            redirect: "error",
            cache: "no-store",
            signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
            credentials: "omit",
        });
        if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
            await response.body?.cancel();
            throw new Error("Agent identity request was rejected");
        }
        if (Number(response.headers.get("content-length") ?? 0) > 32768) {
            await response.body?.cancel();
            throw new Error("Identity response exceeds its byte budget");
        }
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Missing identity response");
        let size = 0;
        const chunks: Uint8Array[] = [];
        try {
            while (true) {
                const part = await reader.read();
                if (part.done) break;
                size += part.value.byteLength;
                if (size > 32768) {
                    await reader.cancel();
                    throw new Error("Identity response exceeds its byte budget");
                }
                chunks.push(part.value);
            }
        } finally {
            reader.releaseLock();
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        try {
            return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
        } catch {
            throw new Error("Invalid identity response");
        }
    }

    public async login(token: string, signal: AbortSignal, deviceId?: string): Promise<AccountAuthInfo> {
        if (!token || token.length > 4096) throw new Error("Invalid one-use login token");
        const result = await this.post(
            "/_matrix/client/v3/login",
            {
                type: "m.login.token",
                token,
                initial_device_display_name: "AgentIM visual client",
                ...(deviceId ? { device_id: deviceId } : {}),
            },
            signal,
        );
        if (!result || typeof result !== "object") throw new Error("Invalid Matrix login response");
        const fields = result as Record<string, unknown>;
        if (
            typeof fields.user_id !== "string" ||
            !/^@[^:]+:.+$/.test(fields.user_id) ||
            typeof fields.device_id !== "string" ||
            !fields.device_id ||
            typeof fields.access_token !== "string" ||
            !fields.access_token ||
            (fields.refresh_token !== undefined && typeof fields.refresh_token !== "string")
        )
            throw new Error("Invalid Matrix login response");
        return {
            userId: fields.user_id,
            deviceId: fields.device_id,
            accessToken: fields.access_token,
            ...(typeof fields.refresh_token === "string" ? { refreshToken: fields.refresh_token } : {}),
            homeserverUrl: this.config.homeserverUrl,
        };
    }
}
