/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { useMemo, type JSX, type ReactNode } from "react";
import { useWatchable, type Api, type CustomLoginComponentProps } from "@element-hq/element-web-module-api";
import type { ModuleConfig } from "../../configuration/ModuleConfig";
import { LoginView } from "./LoginView";
import { AccountLoginView } from "./AccountLoginView";
import { LoginEntryViewModel } from "./LoginEntryViewModel";

/** Compose independent account and Agent screens using the configured default entry. */
export function LoginGateway({
    api,
    config,
    compatibility,
    ...props
}: CustomLoginComponentProps & { api: Api; config: ModuleConfig; compatibility: ReactNode }): JSX.Element {
    const vm = useMemo(() => new LoginEntryViewModel(config.defaultLogin), [config.defaultLogin]);
    const state = useWatchable(vm.state);
    if (state.entry === "account") {
        return <AccountLoginView api={api} accountLogin={compatibility} onAgentDevice={vm.showAgent} />;
    }
    return <LoginView {...props} api={api} config={config} onCompatibility={vm.showAccount} />;
}
