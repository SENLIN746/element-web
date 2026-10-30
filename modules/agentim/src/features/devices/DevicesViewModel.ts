/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Watchable, type AgentIMApi } from "@element-hq/element-web-module-api";
import { decode } from "../../protocol/validation";

interface State {
    token: string | null;
    expiresAt: number | null;
    busy: boolean;
    failed: boolean;
}

/** Self-authorized, short-lived device enrollment; no long-term credential is exposed. */
export class DevicesViewModel {
    public readonly state = new Watchable<State>({ token: null, expiresAt: null, busy: false, failed: false });
    private timer?: ReturnType<typeof setTimeout>;
    private disposed = false;
    private generation = 0;
    private userId?: string;
    public constructor(
        private readonly api: AgentIMApi,
        private readonly homeserver?: string,
    ) {}
    public readonly clear = (): void => {
        this.generation++;
        this.userId = undefined;
        clearTimeout(this.timer);
        this.state.value = { token: null, expiresAt: null, busy: false, failed: false };
    };
    public readonly issue = async (): Promise<void> => {
        if (this.disposed || this.state.value.busy) return;
        this.clear();
        const generation = this.generation;
        this.state.value = { ...this.state.value, busy: true };
        try {
            const result = decode(
                "DeviceLoginTokenResponse",
                await this.api.request("POST", "/devices/login-token", {}, {}),
            );
            if (!this.disposed && generation === this.generation) {
                this.userId = result.user_id;
                this.state.value = {
                    token: result.login_token,
                    expiresAt: Date.now() + Number(result.expires_in_ms),
                    busy: false,
                    failed: false,
                };
                this.timer = setTimeout(this.clear, Number(result.expires_in_ms));
            }
        } catch {
            if (!this.disposed && generation === this.generation)
                this.state.value = { ...this.state.value, busy: false, failed: true };
        }
    };
    public readonly downloadAuthorization = (): void => {
        const state = this.state.value;
        if (!state.token || !state.expiresAt || state.expiresAt <= Date.now() || !this.homeserver || !this.userId)
            return;
        const document = decode("DeviceAuthorizationFile", {
            version: 1,
            kind: "agentim-device-authorization",
            homeserver: this.homeserver,
            user_id: this.userId,
            login_token: state.token,
            expires_at_ms: state.expiresAt,
        });
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(document, null, 2) + "\n"], { type: "application/json" }),
        );
        const link = window.document.createElement("a");
        link.href = url;
        link.download = "AgentIM-device-authorization.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    public dispose(): void {
        this.disposed = true;
        this.clear();
    }
}
