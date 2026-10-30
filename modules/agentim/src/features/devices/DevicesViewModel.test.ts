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
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

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

    it("exports a typed short-lived file and refuses download after expiry", async () => {
        vi.useFakeTimers();
        const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic");
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
        const vm = new DevicesViewModel(
            { request: vi.fn().mockResolvedValue(result), openDirect: vi.fn() },
            "https://agents.example",
        );
        await vm.issue();
        vm.downloadAuthorization();
        const document = JSON.parse(await (create.mock.calls[0][0] as Blob).text());
        expect(document).toMatchObject({
            version: 1,
            kind: "agentim-device-authorization",
            homeserver: "https://agents.example",
            user_id: result.user_id,
            login_token: result.login_token,
        });
        expect(document.expires_at_ms).toBe(Date.now() + 60000);
        await vi.advanceTimersByTimeAsync(60000);
        vm.downloadAuthorization();
        expect(create).toHaveBeenCalledOnce();
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
