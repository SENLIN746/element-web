/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Watchable } from "@element-hq/element-web-module-api";
import type { ModuleConfig } from "../../configuration/ModuleConfig";

/** Select a login screen without creating or changing the identity behind it. */
export class LoginEntryViewModel {
    public readonly state: Watchable<{ entry: "account" | "agent" }>;

    public constructor(defaultLogin: ModuleConfig["defaultLogin"]) {
        this.state = new Watchable({ entry: defaultLogin ?? "agent" });
    }

    public readonly showAccount = (): void => {
        this.state.value = { entry: "account" };
    };

    public readonly showAgent = (): void => {
        this.state.value = { entry: "agent" };
    };
}
