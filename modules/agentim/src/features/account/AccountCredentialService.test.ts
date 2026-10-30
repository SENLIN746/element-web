/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import { AccountCredentialService } from "./AccountCredentialService";
import { AccountCredentialStore } from "./AccountCredentialStore";
import { CredentialBackupViewModel } from "./CredentialBackupViewModel";
import { IdentityService } from "../identity/IdentityService";

const credential = {
    version: 1 as const,
    kind: "agentim-account-credential" as const,
    homeserver: "https://example",
    user_id: "@agent:example",
    credential_id: "a".repeat(43),
    credential_secret: "b".repeat(43),
};
const record = { key: "synthetic", verified: false, credential };
const account = {
    userId: credential.user_id,
    deviceId: "FIRST",
    accessToken: "synthetic-native",
    homeserverUrl: credential.homeserver,
};
const proofStatus = {
    credential_id: credential.credential_id,
    user_id: credential.user_id,
    created_at_ms: 1,
    revoked: false,
};

function fixture() {
    const identity = new IdentityService({ homeserverUrl: credential.homeserver });
    const data = new Map<string, unknown>();
    const store = {
        get: vi.fn(async (_store: string, key: string) => data.get(key)),
        removeCredential: vi.fn(async (key: string) => {
            data.delete(key);
        }),
        save: vi.fn(async (_store: string, value: { key: string }) => {
            data.set(value.key, value);
        }),
    } as unknown as AccountCredentialStore;
    return { identity, store, service: new AccountCredentialService(identity, credential.homeserver, store) };
}

describe("Portable account access", () => {
    it("checks the downloaded bytes and service proof before opening the account", async () => {
        const { identity, service } = fixture();
        vi.spyOn(service, "createForRegistration").mockResolvedValue(record);
        const post = vi.spyOn(identity, "post").mockResolvedValue(proofStatus);
        const done = vi.fn();
        const vm = new CredentialBackupViewModel(service, done);
        await vm.prepareRegistration(account);
        expect(done).not.toHaveBeenCalled();
        expect(JSON.stringify(vm.state.value)).not.toContain(credential.credential_secret);
        await vm.verifyFile(
            new File([JSON.stringify({ ...credential, credential_secret: "c".repeat(43) })], "wrong.json"),
        );
        expect(post).not.toHaveBeenCalled();
        expect(done).not.toHaveBeenCalled();
        await vm.verifyFile(new File([JSON.stringify(credential)], "saved.json"));
        expect(done).toHaveBeenCalledOnce();
        expect(vm.state.value.verified).toBe(true);
        expect(post).toHaveBeenCalledWith(
            expect.stringContaining("/verify"),
            { credential_id: credential.credential_id, credential_secret: credential.credential_secret },
            expect.any(AbortSignal),
        );
        vm.dispose();
    });

    it("rejects another origin, a registration proof and a revoked account file", async () => {
        const { identity, service } = fixture();
        expect(() => service.parse(JSON.stringify({ ...credential, homeserver: "https://other.example" }))).toThrow();
        expect(() => service.parse(JSON.stringify({ version: 1, verifier: "private-registration-proof" }))).toThrow();
        vi.spyOn(identity, "post").mockResolvedValue({ ...proofStatus, revoked: true });
        await expect(
            service.verifySaved(record, JSON.stringify(credential), new AbortController().signal),
        ).rejects.toThrow();
    });

    it("saves fixed device intent before submitting and reuses it after a lost result", async () => {
        const { identity, service, store } = fixture();
        const post = vi.spyOn(identity, "post").mockRejectedValueOnce(new Error("synthetic response loss"));
        const text = JSON.stringify(credential),
            signal = new AbortController().signal;
        await expect(service.recover(text, signal)).rejects.toThrow();
        const first = post.mock.calls[0][1] as { attempt_id: string; device_id: string };
        expect(store.save).toHaveBeenCalledBefore(post);
        post.mockResolvedValueOnce({
            attempt_id: first.attempt_id,
            device_id: first.device_id,
            user_id: credential.user_id,
            access_token: "new-native",
            expires_at_ms: null,
            refresh_token: null,
        });
        const recovered = await service.recover(text, signal);
        expect(post.mock.calls[1][1]).toEqual(post.mock.calls[0][1]);
        expect(recovered.userId).toBe(credential.user_id);
        expect(recovered.deviceId).toBe(first.device_id);
        expect(await service.recover(text, signal)).toEqual(recovered);
        expect(post).toHaveBeenCalledTimes(2);
    });

    it("replaces a revoked cached backup using the currently authenticated device", async () => {
        const { service, store } = fixture();
        const cached = { ...record, key: `${credential.homeserver}|${credential.user_id}`, verified: true };
        await store.save("credentials", cached);
        const request = vi.fn(
            async (method: string, _path: string, _query?: Readonly<Record<string, string>>, body?: unknown) =>
                method === "GET"
                    ? { credentials: [] }
                    : {
                          ...proofStatus,
                          credential_id: (body as Pick<typeof credential, "credential_id">).credential_id,
                      },
        );
        const next = await service.createForSession({ request, openDirect: vi.fn() }, credential.user_id);
        expect(store.removeCredential).toHaveBeenCalledWith(cached.key);
        expect(next.credential.credential_id).not.toBe(credential.credential_id);
        expect(next.verified).toBe(false);
        expect(request.mock.calls[1][3]).not.toHaveProperty("credential_secret");
    });

    it("ignores an in-flight backup after its view was disposed", async () => {
        const { service } = fixture();
        const pending = Promise.withResolvers<typeof record>();
        vi.spyOn(service, "createForRegistration").mockReturnValue(pending.promise);
        const done = vi.fn(),
            vm = new CredentialBackupViewModel(service, done);
        const operation = vm.prepareRegistration(account);
        vm.dispose();
        pending.resolve({ ...record, verified: true });
        await operation;
        expect(done).not.toHaveBeenCalled();
        expect(vm.state.value.pending).toBe(false);
    });
});
