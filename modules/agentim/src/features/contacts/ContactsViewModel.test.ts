/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import type { AgentIMApi, NavigationApi } from "@element-hq/element-web-module-api";
import { ContactService } from "./ContactService";
import { ContactsViewModel } from "./ContactsViewModel";

const userId = "@peer:example";
const contact = { user_id: userId, state: "incoming", blocked: false };
function setup() {
    const api: AgentIMApi = {
        request: vi.fn().mockResolvedValue({ contacts: [contact], next_cursor: null }),
        openDirect: vi.fn().mockResolvedValue("!encrypted:example"),
    };
    const navigation: NavigationApi = { openRoom: vi.fn(), registerLocationRenderer: vi.fn(), toMatrixToLink: vi.fn() };
    return { api, navigation, vm: new ContactsViewModel(new ContactService(api), api, navigation) };
}

describe("ContactsViewModel", () => {
    it("should keep contact consent separate from native encrypted conversation navigation", async () => {
        const { api, navigation, vm } = setup();
        await vm.load();
        await vm.open(userId);
        expect(api.openDirect).not.toHaveBeenCalled();
        vi.mocked(api.request).mockResolvedValue({ ...contact, state: "accepted" });
        await vm.act(userId, "accept");
        expect(api.request).toHaveBeenLastCalledWith("PUT", "/contacts/%40peer%3Aexample", {}, { action: "accept" });
        await vm.open(userId);
        expect(api.openDirect).toHaveBeenCalledWith(userId);
        expect(navigation.openRoom).toHaveBeenCalledWith("!encrypted:example");
        expect(api.request).toHaveBeenCalledTimes(2);
        vm.dispose();
    });

    it.each(["request", "accept", "reject", "remove", "block", "unblock"] as const)(
        "should send the explicit %s action",
        async (action) => {
            const { api, vm } = setup();
            vi.mocked(api.request).mockResolvedValue({ ...contact, state: "none" });
            await vm.act(userId, action);
            expect(api.request).toHaveBeenLastCalledWith("PUT", "/contacts/%40peer%3Aexample", {}, { action });
            vm.dispose();
        },
    );

    it("should expose and retry native ignore partial failures without claiming an atomic change", async () => {
        const { api, vm } = setup();
        const partial = new Error("Contact policy changed, but Matrix ignore synchronization failed");
        partial.name = "AgentIMIgnoreProjectionError";
        vi.mocked(api.request).mockRejectedValueOnce(partial);
        await vm.act(userId, "block");
        expect(vm.state.value.partial).toEqual({ userId, action: "block" });
        expect(vm.state.value.failed).toBe(true);
        vi.mocked(api.request).mockResolvedValueOnce({ ...contact, state: "none", blocked: true });
        await vm.retryProjection();
        expect(api.request).toHaveBeenLastCalledWith("PUT", "/contacts/%40peer%3Aexample", {}, { action: "block" });
        expect(vm.state.value.partial).toBeNull();
        expect(vm.state.value.contacts[0].blocked).toBe(true);
        vm.dispose();
    });

    it("should not navigate after the panel is disposed", async () => {
        const { api, navigation, vm } = setup();
        vi.mocked(api.request).mockResolvedValue({ contacts: [{ ...contact, state: "accepted" }], next_cursor: null });
        await vm.load();
        const pending = Promise.withResolvers<string>();
        vi.mocked(api.openDirect).mockReturnValue(pending.promise);
        const opening = vm.open(userId);
        vm.dispose();
        pending.resolve("!encrypted:example");
        await opening;
        expect(navigation.openRoom).not.toHaveBeenCalled();
    });
});
