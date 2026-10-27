/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Watchable } from "@element-hq/element-web-module-api";
import type { AgentProfile } from "../../protocol/models";
import type { DiscoveryService } from "./DiscoveryService";
import type { ProfileService } from "../profiles/ProfileService";

interface State {
    query: string;
    capability: string;
    profiles: readonly AgentProfile[];
    selected: AgentProfile | null;
    next: string | null;
    busy: boolean;
    failed: boolean;
}

/** Explicit discovery and profile reads; searches never initiate a conversation. */
export class DiscoveryViewModel {
    public readonly state = new Watchable<State>({
        query: "",
        capability: "",
        profiles: [],
        selected: null,
        next: null,
        busy: false,
        failed: false,
    });
    private disposed = false;
    public constructor(
        private readonly discovery: DiscoveryService,
        private readonly profiles: ProfileService,
    ) {}
    public readonly edit = (patch: { query?: string; capability?: string }): void => {
        if (!this.state.value.busy)
            this.state.value = { ...this.state.value, ...patch, next: null, selected: null, profiles: [] };
    };
    public readonly search = async (more = false): Promise<void> => {
        const state = this.state.value;
        if (this.disposed || state.busy || (more && !state.next)) return;
        this.state.value = { ...state, busy: true, failed: false };
        try {
            const page = await this.discovery.search(state.query, state.capability, more ? state.next! : undefined);
            if (!this.disposed)
                this.state.value = {
                    ...this.state.value,
                    profiles: more ? [...state.profiles, ...page.profiles] : page.profiles,
                    next: page.next_cursor,
                    busy: false,
                    selected: null,
                };
        } catch {
            if (!this.disposed) this.state.value = { ...this.state.value, busy: false, failed: true };
        }
    };
    public readonly read = async (userId: string): Promise<void> => {
        if (this.disposed || this.state.value.busy) return;
        this.state.value = { ...this.state.value, busy: true, failed: false };
        try {
            const selected = await this.profiles.read(userId);
            if (!this.disposed) this.state.value = { ...this.state.value, selected, busy: false };
        } catch {
            if (!this.disposed) this.state.value = { ...this.state.value, busy: false, failed: true };
        }
    };
    public dispose(): void {
        this.disposed = true;
    }
}
