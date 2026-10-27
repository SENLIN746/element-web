/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Watchable, type AccountAuthInfo } from "@element-hq/element-web-module-api";
import type { IdentityService } from "./IdentityService";

/** Authentication state deliberately excludes enrollment, login, and Matrix credentials. */
export class LoginViewModel {
    public readonly state = new Watchable({ busy: false, failed: false });
    private readonly controller = new AbortController();
    public constructor(
        private readonly service: IdentityService,
        private readonly onLoggedIn: (account: AccountAuthInfo) => void,
    ) {}

    private async run(operation: () => Promise<AccountAuthInfo>): Promise<void> {
        if (this.controller.signal.aborted || this.state.value.busy) return;
        this.state.value = { busy: true, failed: false };
        try {
            const account = await operation();
            if (!this.controller.signal.aborted) this.onLoggedIn(account);
        } catch {
            if (!this.controller.signal.aborted) this.state.value = { busy: false, failed: true };
        } finally {
            if (!this.controller.signal.aborted) this.state.value = { ...this.state.value, busy: false };
        }
    }

    public readonly login = (token: string): Promise<void> =>
        this.run(() => this.service.login(token, this.controller.signal));
    public readonly enroll = (localpart: string, token: string): Promise<void> =>
        this.run(() => this.service.enroll(localpart, token, this.controller.signal));
    public dispose(): void {
        this.controller.abort();
    }
}
