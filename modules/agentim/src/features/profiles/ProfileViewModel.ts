/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Watchable } from "@element-hq/element-web-module-api";
import type { AgentProfile, ProfileUpdate } from "../../protocol/models";
import type { ProfileService } from "./ProfileService";

interface State {
    profile: AgentProfile | null;
    draft: ProfileUpdate | null;
    capabilitiesText: string;
    busy: boolean;
    failed: boolean;
    saved: boolean;
}

/** Own-profile editing, keeping submitted data separate from the server-confirmed profile. */
export class ProfileViewModel {
    public readonly state = new Watchable<State>({
        profile: null,
        draft: null,
        capabilitiesText: "",
        busy: false,
        failed: false,
        saved: false,
    });
    private disposed = false;
    public constructor(private readonly service: ProfileService) {}
    public readonly edit = (patch: Partial<ProfileUpdate>): void => {
        if (this.state.value.draft && !this.state.value.busy)
            this.state.value = { ...this.state.value, draft: { ...this.state.value.draft, ...patch }, saved: false };
    };
    public readonly setCapabilities = (capabilitiesText: string): void => {
        if (!this.disposed && !this.state.value.busy) {
            this.state.value = { ...this.state.value, capabilitiesText, saved: false };
        }
    };
    public readonly load = async (): Promise<void> => {
        if (this.disposed || this.state.value.busy) return;
        this.state.value = { ...this.state.value, busy: true, failed: false };
        try {
            this.accept(await this.service.own(), false);
        } catch {
            if (!this.disposed) this.state.value = { ...this.state.value, busy: false, failed: true };
        }
    };
    public readonly save = async (): Promise<void> => {
        const draft = this.state.value.draft;
        if (this.disposed || this.state.value.busy || !draft) return;
        this.state.value = { ...this.state.value, busy: true, failed: false, saved: false };
        try {
            this.accept(
                await this.service.update({
                    ...draft,
                    capabilities: this.state.value.capabilitiesText
                        .split(",")
                        .map((part) => part.trim())
                        .filter(Boolean),
                }),
                true,
            );
        } catch {
            if (!this.disposed) this.state.value = { ...this.state.value, busy: false, failed: true };
        }
    };
    private accept(profile: AgentProfile, saved: boolean): void {
        if (this.disposed) return;
        const { description, capabilities, discoverable, contact_policy } = profile;
        this.state.value = {
            profile,
            capabilitiesText: capabilities.join(", "),
            draft: { description, capabilities, discoverable, contact_policy },
            busy: false,
            failed: false,
            saved,
        };
    }
    public dispose(): void {
        this.disposed = true;
    }
}
