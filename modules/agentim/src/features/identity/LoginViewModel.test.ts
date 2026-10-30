/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountAuthInfo } from "@element-hq/element-web-module-api";
import { LoginViewModel } from "./LoginViewModel";
import { IdentityService } from "./IdentityService";
import { AccountCredentialService } from "../account/AccountCredentialService";

const account: AccountAuthInfo = {
    userId: "@agent:example",
    deviceId: "NEW",
    accessToken: "test-token",
    homeserverUrl: "https://example",
};

describe("LoginViewModel", () => {
    beforeEach(() => vi.spyOn(AccountCredentialService.prototype, "supported").mockResolvedValue());
    afterEach(() => vi.restoreAllMocks());
    it("should pass authentication directly to the host and retain no credential in state", async () => {
        const service = new IdentityService({ homeserverUrl: "https://example" });
        vi.spyOn(service, "login").mockResolvedValue(account);
        const done = vi.fn();
        vi.spyOn(service.onboarding, "isOpen").mockResolvedValue(true);
        const vm = new LoginViewModel(service, done);
        await vm.login("short-token");
        expect(done).toHaveBeenCalledWith(account);
        expect(vm.state.value).toEqual({
            intent: "connect",
            localpart: "",
            busy: true,
            failed: false,
            registration: "checking",
            backupPending: false,
        });
    });

    it("should ignore late authentication after unmount and suppress diagnostics", async () => {
        const service = new IdentityService({ homeserverUrl: "https://example" });
        const pending = Promise.withResolvers<AccountAuthInfo>();
        vi.spyOn(service, "login").mockReturnValue(pending.promise);
        const done = vi.fn();
        vi.spyOn(service.onboarding, "isOpen").mockResolvedValue(true);
        const vm = new LoginViewModel(service, done);
        const operation = vm.login("short-token");
        vm.dispose();
        pending.resolve(account);
        await operation;
        expect(done).not.toHaveBeenCalled();
        expect(JSON.stringify(vm.state.value)).not.toContain("token");
    });

    it("should freeze the selected intent through authentication and host synchronization", async () => {
        const service = new IdentityService({ homeserverUrl: "https://example" });
        const pending = Promise.withResolvers<AccountAuthInfo>();
        const login = vi.spyOn(service, "login").mockReturnValue(pending.promise);
        vi.spyOn(service.onboarding, "isOpen").mockResolvedValue(true);
        const vm = new LoginViewModel(service, vi.fn());
        const operation = vm.login("synthetic-one-use");
        vm.selectIntent("enroll");
        vm.editLocalpart("different-agent");
        await vm.login("another-one-use");
        expect(vm.state.value.intent).toBe("connect");
        expect(vm.state.value.localpart).toBe("");
        expect(login).toHaveBeenCalledTimes(1);
        pending.resolve(account);
        await operation;
        vm.selectIntent("program");
        expect(vm.state.value.busy).toBe(true);
        expect(vm.state.value.intent).toBe("connect");
    });

    it("should clear the prior draft and failure when choosing another intent", async () => {
        const service = new IdentityService({ homeserverUrl: "https://example" });
        vi.spyOn(service, "enroll").mockRejectedValue(new Error("synthetic refusal"));
        vi.spyOn(service.onboarding, "isOpen").mockResolvedValue(true);
        const vm = new LoginViewModel(service, vi.fn());
        vm.selectIntent("enroll");
        vm.editLocalpart("research-agent");
        await vm.refreshPolicy();
        await vm.enroll("research-agent");
        expect(vm.state.value.failed).toBe(true);
        expect(vm.state.value.localpart).toBe("research-agent");
        vm.selectIntent("connect");
        expect(vm.state.value).toEqual({
            intent: "connect",
            localpart: "",
            busy: false,
            failed: false,
            registration: "open",
            backupPending: false,
        });
        vm.dispose();
        vm.selectIntent("program");
        expect(vm.state.value.intent).toBe("connect");
    });
});
