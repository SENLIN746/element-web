/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import type { AgentIMApi } from "@element-hq/element-web-module-api";
import { DiscoveryService } from "./DiscoveryService";
import { ProfileService } from "../profiles/ProfileService";
import { DiscoveryViewModel } from "./DiscoveryViewModel";

const profile = {
    user_id: "@peer:example",
    description: "Search Agent",
    capabilities: ["search"],
    discoverable: true,
    contact_policy: "request",
};

describe("DiscoveryViewModel", () => {
    it("should search and read profiles without sending contact requests or opening conversations", async () => {
        const request = vi.fn().mockResolvedValue({ profiles: [profile], next_cursor: "@peer:example" });
        const api: AgentIMApi = { request, openDirect: vi.fn() };
        const vm = new DiscoveryViewModel(new DiscoveryService(api), new ProfileService(api));
        vm.edit({ query: "Search", capability: "search" });
        await vm.search();
        expect(request).toHaveBeenLastCalledWith("GET", "/discovery", {
            query: "Search",
            capability: "search",
            limit: "50",
        });
        request.mockResolvedValue({ profiles: [], next_cursor: null });
        await vm.search(true);
        expect(request).toHaveBeenLastCalledWith("GET", "/discovery", {
            query: "Search",
            capability: "search",
            after: "@peer:example",
            limit: "50",
        });
        request.mockResolvedValue(profile);
        await vm.read(profile.user_id);
        expect(vm.state.value.selected).toEqual(profile);
        expect(api.openDirect).not.toHaveBeenCalled();
        vm.edit({ query: "Changed" });
        expect(vm.state.value.next).toBeNull();
        expect(vm.state.value.profiles).toEqual([]);
        vm.dispose();
    });

    it("should discard late pages after identity teardown", async () => {
        const pending = Promise.withResolvers<unknown>();
        const api: AgentIMApi = { request: () => pending.promise, openDirect: vi.fn() };
        const vm = new DiscoveryViewModel(new DiscoveryService(api), new ProfileService(api));
        const searching = vm.search();
        vm.dispose();
        pending.resolve({ profiles: [profile], next_cursor: null });
        await searching;
        expect(vm.state.value.profiles).toEqual([]);
    });
});
