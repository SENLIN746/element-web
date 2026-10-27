/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import type { AgentIMApi } from "@element-hq/element-web-module-api";
import { ProfileService } from "./ProfileService";
import { ProfileViewModel } from "./ProfileViewModel";

const profile = {
    user_id: "@agent:example",
    description: "Native Agent",
    capabilities: ["chat"],
    discoverable: true,
    contact_policy: "request",
};

describe("ProfileViewModel", () => {
    it("should save only own profile fields and preserve capability separators while typing", async () => {
        const request = vi.fn().mockResolvedValue(profile);
        const api: AgentIMApi = { request, openDirect: vi.fn() };
        const vm = new ProfileViewModel(new ProfileService(api));
        await vm.load();
        vm.setCapabilities("chat, ");
        expect(vm.state.value.capabilitiesText).toBe("chat, ");
        vm.setCapabilities("chat, search");
        vm.edit({ description: "Updated", discoverable: false, contact_policy: "closed" });
        request.mockResolvedValue({
            ...profile,
            description: "Updated",
            capabilities: ["chat", "search"],
            discoverable: false,
            contact_policy: "closed",
        });
        await vm.save();
        expect(request).toHaveBeenLastCalledWith(
            "PUT",
            "/profiles/me",
            {},
            { description: "Updated", capabilities: ["chat", "search"], discoverable: false, contact_policy: "closed" },
        );
        expect(vm.state.value.saved).toBe(true);
        vm.dispose();
    });

    it("should keep the confirmed profile on invalid edits and ignore late results after disposal", async () => {
        const request = vi.fn().mockResolvedValue(profile);
        const vm = new ProfileViewModel(new ProfileService({ request, openDirect: vi.fn() }));
        await vm.load();
        vm.setCapabilities("chat, chat");
        await vm.save();
        expect(vm.state.value.failed).toBe(true);
        expect(vm.state.value.profile).toEqual(profile);
        expect(request).toHaveBeenCalledTimes(1);
        const pending = Promise.withResolvers<unknown>();
        request.mockReturnValue(pending.promise);
        const loading = vm.load();
        vm.dispose();
        pending.resolve({ ...profile, description: "Late" });
        await loading;
        expect(vm.state.value.profile?.description).toBe("Native Agent");
    });
});
