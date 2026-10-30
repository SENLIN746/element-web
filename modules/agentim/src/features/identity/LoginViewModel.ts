/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Watchable, type AccountAuthInfo } from "@element-hq/element-web-module-api";
import { CredentialBackupViewModel } from "../account/CredentialBackupViewModel";
import { PairingService } from "../pairing/PairingService";
import { PairingViewModel } from "../pairing/PairingViewModel";
import type { IdentityService } from "./IdentityService";

/** The three distinct reasons to open the AgentIM entry. */
export type LoginIntent = "connect" | "enroll" | "program" | "recover";

interface LoginState {
    intent: LoginIntent;
    localpart: string;
    busy: boolean;
    failed: boolean;
    backupPending: boolean;
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
        backupPending: false,
    });
    public readonly pairing: PairingViewModel;
    public readonly backup: CredentialBackupViewModel;
    private pendingAccount?: AccountAuthInfo;
    private readonly controller = new AbortController();
    public constructor(
        private readonly service: IdentityService,
        private readonly onLoggedIn: (account: AccountAuthInfo) => void,
    ) {
        this.backup = new CredentialBackupViewModel(service.credentials, () => {
            const account = this.pendingAccount;
            if (account && !this.controller.signal.aborted) {
                this.state.value = { ...this.state.value, busy: true, backupPending: false };
                this.pendingAccount = undefined;
                this.onLoggedIn(account);
            }
        });
        this.pairing = new PairingViewModel(new PairingService(service), (account) => {
            this.state.value = { ...this.state.value, busy: true };
            this.onLoggedIn(account);
        });
    }

    public readonly refreshPolicy = async (): Promise<void> => {
        try {
            const open = await this.service.onboarding.isOpen(this.controller.signal);
            if (open) await this.service.credentials.supported(this.controller.signal);
            if (!this.controller.signal.aborted)
                this.state.value = { ...this.state.value, registration: open ? "open" : "closed" };
        } catch {
            if (!this.controller.signal.aborted)
                this.state.value = { ...this.state.value, registration: "unavailable" };
        }
    };

    public readonly selectIntent = (intent: LoginIntent): void => {
        if (this.controller.signal.aborted || this.state.value.busy || this.state.value.backupPending) return;
        this.pairing.cancel();
        this.state.value = { ...this.state.value, intent, localpart: "", busy: false, failed: false };
        if (intent === "enroll") void this.refreshPolicy();
    };

    public readonly editLocalpart = (localpart: string): void => {
        if (this.controller.signal.aborted || this.state.value.busy || this.state.value.backupPending) return;
        this.state.value = { ...this.state.value, localpart, failed: false };
    };

    private async run(operation: () => Promise<AccountAuthInfo>, saveCredential = false): Promise<void> {
        if (this.controller.signal.aborted || this.state.value.busy || this.state.value.backupPending) return;
        this.state.value = { ...this.state.value, busy: true, failed: false };
        let handedOff = false;
        try {
            const account = await operation();
            if (!this.controller.signal.aborted) {
                if (saveCredential) {
                    this.pendingAccount = account;
                    await this.backup.prepareRegistration(account);
                    this.state.value = { ...this.state.value, backupPending: !this.backup.state.value.verified };
                    handedOff = this.backup.state.value.verified;
                } else {
                    this.onLoggedIn(account);
                    handedOff = true;
                }
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
            ? this.run(() => this.service.enroll(localpart, this.controller.signal), true)
            : Promise.resolve();
    public readonly recoverFile = async (file: File): Promise<void> => {
        await this.run(async () => {
            if (file.size > 8192) throw new Error("Account credential is too large");
            return this.service.credentials.recover(await file.text(), this.controller.signal);
        });
    };
    public dispose(): void {
        this.backup.dispose();
        this.pendingAccount = undefined;
        this.pairing.dispose();
        this.controller.abort();
    }
}
