/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { AccountAuthInfo } from "@element-hq/element-web-module-api";
import type { ModuleConfig } from "../../configuration/ModuleConfig";
import { decode } from "../../protocol/validation";

/** Enroll a native identity or exchange a one-use login token for a new independent device. */
export class IdentityService {
    public constructor(private readonly config: ModuleConfig) {}

    private async post(path: string, body: unknown, signal: AbortSignal, bearer?: string): Promise<unknown> {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (bearer !== undefined) {
            if (!bearer || bearer.length > 8192 || !/^[\x21-\x7e]+$/.test(bearer))
                throw new Error("Invalid enrollment credential");
            headers.Authorization = `Bearer ${bearer}`;
        }
        const serialized = JSON.stringify(body);
        if (new TextEncoder().encode(serialized).byteLength > 8192)
            throw new Error("Identity request exceeds its byte budget");
        const response = await fetch(new URL(path, this.config.homeserverUrl), {
            method: "POST",
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

    public async enroll(localpart: string, enrollmentToken: string, signal: AbortSignal): Promise<AccountAuthInfo> {
        const body = decode("RegistrationRequest", { localpart });
        const registered = decode(
            "RegistrationResponse",
            await this.post("/_synapse/client/agentim/v1/registration", body, signal, enrollmentToken),
        );
        const result = await this.login(registered.login_token, signal);
        if (result.userId !== registered.user_id) throw new Error("Agent registration identity changed");
        return result;
    }

    public async login(token: string, signal: AbortSignal): Promise<AccountAuthInfo> {
        if (!token || token.length > 4096) throw new Error("Invalid one-use login token");
        const result = await this.post(
            "/_matrix/client/v3/login",
            {
                type: "m.login.token",
                token,
                initial_device_display_name: "AgentIM visual client",
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
