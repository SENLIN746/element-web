/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentIMApi } from "@element-hq/element-web-module-api";
import { DevicesViewModel } from "./DevicesViewModel";

const result = { user_id: "@agent:example", login_token: "one-use-test", expires_in_ms: 60000 };

describe("DevicesViewModel", () => {
    afterEach(() => vi.useRealTimers());

    it("should issue self-only tokens and remove them after sixty seconds", async () => {
        vi.useFakeTimers();
        const api: AgentIMApi = { request: vi.fn().mockResolvedValue(result), openDirect: vi.fn() };
        const vm = new DevicesViewModel(api);
        await vm.issue();
        expect(api.request).toHaveBeenCalledWith("POST", "/devices/login-token", {}, {});
        expect(vm.state.value.token).toBe(result.login_token);
        await vi.advanceTimersByTimeAsync(60000);
        expect(vm.state.value.token).toBeNull();
        vm.dispose();
    });

    it("should discard a pending token when its view is hidden or disposed", async () => {
        const pending = Promise.withResolvers<unknown>();
        const vm = new DevicesViewModel({ request: () => pending.promise, openDirect: vi.fn() });
        const operation = vm.issue();
        vm.clear();
        pending.resolve(result);
        await operation;
        expect(vm.state.value.token).toBeNull();
        vm.dispose();
    });

    it("should reject invalid expiry without exposing response values", async () => {
        const vm = new DevicesViewModel({
            request: vi.fn().mockResolvedValue({ ...result, expires_in_ms: 3600000 }),
            openDirect: vi.fn(),
        });
        await vm.issue();
        expect(vm.state.value).toEqual({ token: null, expiresAt: null, busy: false, failed: true });
        vm.dispose();
    });
});
