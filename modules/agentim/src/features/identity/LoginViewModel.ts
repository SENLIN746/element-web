/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Watchable, type AccountAuthInfo } from "@element-hq/element-web-module-api";
import { PairingService } from "../pairing/PairingService";
import { PairingViewModel } from "../pairing/PairingViewModel";
import type { IdentityService } from "./IdentityService";

/** The three distinct reasons to open the AgentIM entry. */
export type LoginIntent = "connect" | "enroll" | "program";

interface LoginState {
    intent: LoginIntent;
    localpart: string;
    busy: boolean;
    failed: boolean;
    registration: "checking" | "open" | "closed" | "unavailable";
}

/** Authentication state deliberately excludes enrollment, login, and Matrix credentials. */
export class LoginViewModel {
    public readonly state = new Watchable<LoginState>({
        intent: "connect",
        localpart: "",
        busy: false,
        failed: false,
        registration: "checking",
    });
    public readonly pairing: PairingViewModel;
    private readonly controller = new AbortController();
    public constructor(
        private readonly service: IdentityService,
        private readonly onLoggedIn: (account: AccountAuthInfo) => void,
    ) {
        this.pairing = new PairingViewModel(new PairingService(service), (account) => {
            this.state.value = { ...this.state.value, busy: true };
            this.onLoggedIn(account);
        });
    }

    public readonly refreshPolicy = async (): Promise<void> => {
        try {
            const open = await this.service.onboarding.isOpen(this.controller.signal);
            if (!this.controller.signal.aborted)
                this.state.value = { ...this.state.value, registration: open ? "open" : "closed" };
        } catch {
            if (!this.controller.signal.aborted)
                this.state.value = { ...this.state.value, registration: "unavailable" };
        }
    };

    public readonly selectIntent = (intent: LoginIntent): void => {
        if (this.controller.signal.aborted || this.state.value.busy) return;
        this.pairing.cancel();
        this.state.value = { ...this.state.value, intent, localpart: "", busy: false, failed: false };
        if (intent === "enroll") void this.refreshPolicy();
    };

    public readonly editLocalpart = (localpart: string): void => {
        if (this.controller.signal.aborted || this.state.value.busy) return;
        this.state.value = { ...this.state.value, localpart, failed: false };
    };

    private async run(operation: () => Promise<AccountAuthInfo>): Promise<void> {
        if (this.controller.signal.aborted || this.state.value.busy) return;
        this.state.value = { ...this.state.value, busy: true, failed: false };
        let handedOff = false;
        try {
            const account = await operation();
            if (!this.controller.signal.aborted) {
                this.onLoggedIn(account);
                handedOff = true;
            }
        } catch {
            if (!this.controller.signal.aborted) this.state.value = { ...this.state.value, busy: false, failed: true };
        } finally {
            // The host now owns synchronization. Do not create another device during that handoff.
            if (!this.controller.signal.aborted) this.state.value = { ...this.state.value, busy: handedOff };
        }
    }

    public readonly login = (token: string): Promise<void> =>
        this.run(() => this.service.login(token, this.controller.signal));
    public readonly enroll = (localpart: string): Promise<void> =>
        this.state.value.registration === "open"
            ? this.run(() => this.service.enroll(localpart, this.controller.signal))
            : Promise.resolve();
    public dispose(): void {
        this.pairing.dispose();
        this.controller.abort();
    }
}
