/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PairingRequest } from "../../protocol/models";
import { PairingViewModel } from "./PairingViewModel";
import type { PairingService } from "./PairingService";

function fixture() {
    vi.stubGlobal("crypto", webcrypto);
    let request: PairingRequest;
    const service = {
        create: vi.fn(async (target: string, device: string, challenge: string) => {
            request = {
                pairing_id: "p".repeat(43),
                target_user_id: target,
                device_name: device,
                code_challenge: challenge,
                user_code: "ABCD-EFGH",
                client_origin: "https://agents.example",
                state: "pending",
                created_at_ms: 1000,
                expires_at_ms: 301000,
                server_time_ms: 1000,
                poll_interval_ms: 2000,
            };
            return request;
        }),
        status: vi.fn(async () => ({ ...request, state: "approved" as const })),
        connect: vi.fn(async () => ({
            userId: "@a:example",
            deviceId: "NEW",
            accessToken: "synthetic-token",
            homeserverUrl: "https://agents.example",
        })),
        cancel: vi.fn(async () => {}),
    };
    const done = vi.fn();
    const vm = new PairingViewModel(service as unknown as PairingService, done);
    vm.edit("@a:example", "My browser");
    return { service, done, vm };
}

async function waiting(vm: PairingViewModel): Promise<void> {
    await vi.waitFor(() => expect(vm.state.value.phase).toBe("waiting"));
}

describe("Agent-approved pairing lifecycle", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("should keep the proof private and consume once after approval", async () => {
        vi.useFakeTimers();
        const { vm, service, done } = fixture();
        const run = vm.start();
        await waiting(vm);
        expect(JSON.stringify(vm.state.value)).not.toContain("verifier");
        expect(service.connect).not.toHaveBeenCalled();
        await vm.start();
        await vi.advanceTimersByTimeAsync(2000);
        await run;
        expect(service.create).toHaveBeenCalledTimes(1);
        expect(service.connect).toHaveBeenCalledTimes(1);
        const proof = service.connect.mock.calls[0];
        expect(proof).toBeDefined();
        expect(done).toHaveBeenCalledWith(expect.objectContaining({ deviceId: "NEW" }));
        vm.dispose();
    });

    it("should cancel its proof and prevent handoff after unmount", async () => {
        vi.useFakeTimers();
        const { vm, service, done } = fixture();
        const run = vm.start();
        await waiting(vm);
        vm.dispose();
        await run;
        expect(service.cancel).toHaveBeenCalledTimes(1);
        expect(service.connect).not.toHaveBeenCalled();
        expect(done).not.toHaveBeenCalled();
    });

    it("should respect rejection without consuming a token", async () => {
        vi.useFakeTimers();
        const { vm, service } = fixture();
        service.status.mockImplementationOnce(async () => ({
            ...(await service.create.mock.results[0]!.value),
            state: "rejected" as "approved",
        }));
        const run = vm.start();
        await waiting(vm);
        await vi.advanceTimersByTimeAsync(2000);
        await run;
        expect(vm.state.value.phase).toBe("rejected");
        expect(service.connect).not.toHaveBeenCalled();
        vm.dispose();
    });

    it("should fail closed on a changed fingerprint", async () => {
        vi.useFakeTimers();
        const { vm, service } = fixture();
        service.status.mockImplementationOnce(async () => ({
            ...(await service.create.mock.results[0]!.value),
            code_challenge: "x".repeat(43),
            state: "approved",
        }));
        const run = vm.start();
        await waiting(vm);
        await vi.advanceTimersByTimeAsync(2000);
        await run;
        expect(vm.state.value.phase).toBe("failed");
        expect(service.connect).not.toHaveBeenCalled();
        vm.dispose();
    });

    it("should never retry an uncertain token exchange", async () => {
        vi.useFakeTimers();
        const { vm, service, done } = fixture();
        service.connect.mockRejectedValueOnce(new Error("lost response"));
        const run = vm.start();
        await waiting(vm);
        await vi.advanceTimersByTimeAsync(2000);
        await run;
        expect(service.connect).toHaveBeenCalledTimes(1);
        expect(vm.state.value.phase).toBe("failed");
        expect(done).not.toHaveBeenCalled();
        vm.dispose();
    });
});
