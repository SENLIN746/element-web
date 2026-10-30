/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Watchable, type AccountAuthInfo, type AgentIMApi } from "@element-hq/element-web-module-api";
import type { AccountCredentialService } from "./AccountCredentialService";
import type { CredentialRecord } from "./AccountCredentialStore";

/** The observable snapshot never contains account credentials or native access tokens. */
export class CredentialBackupViewModel {
    public readonly state = new Watchable({ busy: false, pending: false, verified: false, failed: false });
    private record?: CredentialRecord;
    private sessionApi?: AgentIMApi;
    public get canRevoke(): boolean {
        return !!this.record && !!this.sessionApi;
    }
    private readonly controller = new AbortController();
    public constructor(
        private readonly service: AccountCredentialService,
        private readonly onSaved: () => void = () => {},
    ) {}
    public async prepareRegistration(account: AccountAuthInfo): Promise<void> {
        const record = await this.service.createForRegistration(account, this.controller.signal);
        if (this.controller.signal.aborted) return;
        this.record = record;
        this.state.value = { busy: false, pending: true, verified: this.record.verified, failed: false };
        if (this.record.verified) this.onSaved();
    }
    public readonly prepareSession = async (api: AgentIMApi, user: string): Promise<void> => {
        if (this.state.value.busy || this.controller.signal.aborted) return;
        this.state.value = { ...this.state.value, busy: true, failed: false };
        try {
            const record = await this.service.createForSession(api, user);
            if (this.controller.signal.aborted) return;
            this.record = record;
            this.sessionApi = api;
            this.state.value = { busy: false, pending: true, verified: this.record.verified, failed: false };
        } catch {
            this.state.value = { ...this.state.value, busy: false, failed: true };
        }
    };
    public readonly revoke = async (): Promise<void> => {
        if (!this.record || !this.sessionApi || this.state.value.busy || this.controller.signal.aborted) return;
        this.state.value = { ...this.state.value, busy: true, failed: false };
        try {
            await this.service.revoke(this.sessionApi, this.record);
            this.record = undefined;
            if (!this.controller.signal.aborted)
                this.state.value = { busy: false, pending: false, verified: false, failed: false };
        } catch {
            if (!this.controller.signal.aborted) this.state.value = { ...this.state.value, busy: false, failed: true };
        }
    };
    public readonly download = (): void => {
        if (this.record) this.service.download(this.record);
    };
    public readonly verifyFile = async (file: File): Promise<void> => {
        if (!this.record || this.controller.signal.aborted || this.state.value.busy) return;
        this.state.value = { ...this.state.value, busy: true, failed: false };
        try {
            if (file.size > 8192) throw new Error("Credential file is too large");
            await this.service.verifySaved(this.record, await file.text(), this.controller.signal);
            if (this.controller.signal.aborted) return;
            this.state.value = { busy: false, pending: true, verified: true, failed: false };
            this.onSaved();
        } catch {
            if (!this.controller.signal.aborted) this.state.value = { ...this.state.value, busy: false, failed: true };
        }
    };
    public dispose(): void {
        this.controller.abort();
        this.record = undefined;
        this.sessionApi = undefined;
    }
}
