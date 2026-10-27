/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import type { AccountAuthInfo } from "@element-hq/element-web-module-api";
import { LoginViewModel } from "./LoginViewModel";
import { IdentityService } from "./IdentityService";

const account: AccountAuthInfo = {
    userId: "@agent:example",
    deviceId: "NEW",
    accessToken: "test-token",
    homeserverUrl: "https://example",
};

describe("LoginViewModel", () => {
    it("should pass authentication directly to the host and retain no credential in state", async () => {
        const service = new IdentityService({ homeserverUrl: "https://example" });
        vi.spyOn(service, "login").mockResolvedValue(account);
        const done = vi.fn();
        const vm = new LoginViewModel(service, done);
        await vm.login("short-token");
        expect(done).toHaveBeenCalledWith(account);
        expect(vm.state.value).toEqual({ busy: false, failed: false });
    });

    it("should ignore late authentication after unmount and suppress diagnostics", async () => {
        const service = new IdentityService({ homeserverUrl: "https://example" });
        const pending = Promise.withResolvers<AccountAuthInfo>();
        vi.spyOn(service, "login").mockReturnValue(pending.promise);
        const done = vi.fn();
        const vm = new LoginViewModel(service, done);
        const operation = vm.login("short-token");
        vm.dispose();
        pending.resolve(account);
        await operation;
        expect(done).not.toHaveBeenCalled();
        expect(JSON.stringify(vm.state.value)).not.toContain("token");
    });
});
