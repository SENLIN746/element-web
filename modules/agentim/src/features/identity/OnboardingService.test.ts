/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import type { Api } from "@element-hq/element-web-module-api";
import { IdentityService } from "./IdentityService";
import { OnboardingService } from "./OnboardingService";
import { OnboardingStore, type BrowserAttempt } from "./OnboardingStore";

const config = { homeserverUrl: "https://agents.example", serverName: "matrix.example" };
const signal = new AbortController().signal;

class MemoryStore extends OnboardingStore {
    public values: BrowserAttempt[] = [];
    public override async all(): Promise<BrowserAttempt[]> {
        return structuredClone(this.values);
    }
    public override async save(value: BrowserAttempt): Promise<void> {
        this.values = [...this.values.filter((v) => v.key !== value.key), structuredClone(value)];
    }
    public override async remove(key: string): Promise<void> {
        this.values = this.values.filter((v) => v.key !== key);
    }
}

function fixture() {
    const store = new MemoryStore();
    const identity = new IdentityService(config);
    const service = new OnboardingService(identity, config, store);
    vi.spyOn(identity, "get").mockResolvedValue({ mode: "open", protocol: 2, attempt_lifetime_ms: 86400000 });
    const post = vi.spyOn(identity, "post").mockImplementation(async (path, body) => {
        const attempt = store.values[0];
        // The private proof must already be durable before any create/consume request.
        expect(attempt).toBeDefined();
        const status = {
            attempt_id: attempt.attemptId,
            device_id: attempt.deviceId,
            state: "reserved",
            expires_at_ms: Date.now() + 86400000,
        };
        if (path.endsWith("/consume"))
            return {
                ...status,
                state: "provisioned",
                user_id: "@test-agent:matrix.example",
                login_token: "synthetic-one-use",
                expires_in_ms: 60000,
            };
        expect(body).toMatchObject({ attempt_id: attempt.attemptId, device_id: attempt.deviceId });
        expect(body).not.toHaveProperty("verifier");
        return status;
    });
    vi.spyOn(identity, "login").mockImplementation(async (_token, _signal, deviceId) => ({
        userId: "@test-agent:matrix.example",
        deviceId: deviceId!,
        accessToken: "synthetic-matrix-device",
        homeserverUrl: config.homeserverUrl,
    }));
    return { store, identity, service, post };
}

describe("public browser onboarding", () => {
    it("persists proof before registration, binds the device and restores the same pending account", async () => {
        const { service, store, identity, post } = fixture();
        const account = await service.enroll("test-agent", signal);
        expect(store.values[0].account).toEqual(account);
        expect(identity.login).toHaveBeenCalledWith("synthetic-one-use", signal, store.values[0].deviceId);
        expect(post.mock.calls[0][3]).toBeUndefined();
        expect(await service.enroll("test-agent", signal)).toEqual(account);
        expect(post).toHaveBeenCalledTimes(2);
    });

    it("retains the same proof/device after an uncertain network result", async () => {
        const { service, store, post } = fixture();
        post.mockRejectedValueOnce(new Error("synthetic connection lost"));
        await expect(service.enroll("test-agent", signal)).rejects.toThrow();
        const before = structuredClone(store.values[0]);
        await service.enroll("test-agent", signal);
        expect(store.values[0]).toMatchObject(before);
        expect(store.values).toHaveLength(1);
    });

    it("fails closed without creating a proof or requesting an operator permit", async () => {
        const { service, identity, post, store } = fixture();
        vi.mocked(identity.get).mockResolvedValue({ mode: "closed", protocol: 2, attempt_lifetime_ms: 86400000 });
        await expect(service.enroll("test-agent", signal)).rejects.toThrow("closed");
        expect(post).not.toHaveBeenCalled();
        expect(store.values).toHaveLength(0);
    });

    it("rejects a changed grant binding before exchanging a login token", async () => {
        const { service, post, identity, store } = fixture();
        post.mockImplementation(async () => ({
            attempt_id: "a".repeat(43),
            device_id: "b".repeat(43),
            state: "reserved",
            expires_at_ms: 10,
        }));
        await expect(service.enroll("test-agent", signal)).rejects.toThrow("binding changed");
        expect(identity.login).not.toHaveBeenCalled();
        expect(store.values).toHaveLength(1);
    });

    it("completes only after the host is ready and the bound device has uploaded encryption keys", async () => {
        const { service, post, store } = fixture();
        const account = await service.enroll("test-agent", signal);
        const ready = Promise.withResolvers<void>();
        const api = {
            stores: { roomListStore: { waitForReady: () => ready.promise } },
            client: {
                agentim: {
                    request: vi.fn().mockResolvedValue({
                        user_id: account.userId,
                        description: "",
                        capabilities: [],
                        discoverable: false,
                        contact_policy: "request",
                    }),
                },
            },
        } as unknown as Api;
        post.mockClear();
        post.mockResolvedValueOnce({
            device_keys: {
                [account.userId]: {
                    [account.deviceId]: {
                        keys: {
                            [`ed25519:${account.deviceId}`]: "synthetic-ed25519",
                            [`curve25519:${account.deviceId}`]: "synthetic-curve25519",
                        },
                    },
                },
            },
        }).mockResolvedValueOnce({ completed: true });
        const pending = service.completeWhenReady(api);
        await Promise.resolve();
        expect(post).not.toHaveBeenCalled();
        ready.resolve();
        await pending;
        expect(api.client.agentim.request).toHaveBeenCalledWith("GET", "/profiles/me");
        expect(post.mock.calls[1][0]).toMatch(/\/complete$/);
        expect(post.mock.calls[1][3]).toBe(account.accessToken);
        expect(store.values).toHaveLength(0);
    });
});
