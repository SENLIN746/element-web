/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Watchable, type AgentIMApi, type NavigationApi } from "@element-hq/element-web-module-api";
import type { Contact, ContactActionRequest } from "../../protocol/models";
import type { ContactService } from "./ContactService";

interface State {
    partial: { userId: string; action: "block" | "unblock" } | null;
    contacts: readonly Contact[];
    next: string | null;
    busy: boolean;
    failed: boolean;
}

/** Contact policy actions and native conversation navigation are explicit user decisions. */
export class ContactsViewModel {
    public readonly state = new Watchable<State>({
        partial: null,
        contacts: [],
        next: null,
        busy: false,
        failed: false,
    });
    private disposed = false;
    public constructor(
        private readonly service: ContactService,
        private readonly api: AgentIMApi,
        private readonly navigation: NavigationApi,
    ) {}
    public readonly load = async (more = false): Promise<void> => {
        const state = this.state.value;
        if (this.disposed || state.busy || (more && !state.next)) return;
        this.state.value = { ...state, busy: true, failed: false };
        try {
            const page = await this.service.list(more ? state.next! : undefined);
            if (!this.disposed)
                this.state.value = {
                    partial: this.state.value.partial,
                    contacts: more ? [...state.contacts, ...page.contacts] : page.contacts,
                    next: page.next_cursor,
                    busy: false,
                    failed: false,
                };
        } catch {
            if (!this.disposed) this.state.value = { ...this.state.value, busy: false, failed: true };
        }
    };
    public readonly act = async (userId: string, action: ContactActionRequest["action"]): Promise<void> => {
        if (this.disposed || this.state.value.busy) return;
        this.state.value = { ...this.state.value, busy: true, failed: false };
        try {
            const changed = await this.service.act(userId, action);
            if (!this.disposed)
                this.state.value = {
                    ...this.state.value,
                    contacts: [...this.state.value.contacts.filter((x) => x.user_id !== userId), changed],
                    partial:
                        this.state.value.partial?.userId === userId && (action === "block" || action === "unblock")
                            ? null
                            : this.state.value.partial,
                    busy: false,
                };
        } catch (error) {
            if (!this.disposed) {
                const partial =
                    error instanceof Error &&
                    error.name === "AgentIMIgnoreProjectionError" &&
                    (action === "block" || action === "unblock")
                        ? { userId, action }
                        : this.state.value.partial;
                this.state.value = { ...this.state.value, busy: false, failed: true, partial };
            }
        }
    };
    public readonly retryProjection = (): Promise<void> => {
        const partial = this.state.value.partial;
        return partial ? this.act(partial.userId, partial.action) : Promise.resolve();
    };
    public readonly open = async (userId: string): Promise<void> => {
        if (this.disposed || this.state.value.busy) return;
        const contact = this.state.value.contacts.find((item) => item.user_id === userId);
        if (!contact || contact.blocked || contact.state !== "accepted" || this.state.value.partial?.userId === userId)
            return;
        this.state.value = { ...this.state.value, busy: true, failed: false };
        try {
            const roomId = await this.api.openDirect(userId);
            if (!this.disposed) {
                this.state.value = { ...this.state.value, busy: false };
                this.navigation.openRoom(roomId);
            }
        } catch {
            if (!this.disposed) this.state.value = { ...this.state.value, busy: false, failed: true };
        }
    };
    public dispose(): void {
        this.disposed = true;
    }
}
