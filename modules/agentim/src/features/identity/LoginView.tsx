/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { useEffect, useState, type JSX } from "react";
import type { Api, CustomLoginComponentProps } from "@element-hq/element-web-module-api";
import type { ModuleConfig } from "../../configuration/ModuleConfig";
import { IdentityService } from "./IdentityService";
import { LoginViewModel } from "./LoginViewModel";
import { LoginShell } from "./LoginShell";

/** Own authentication state for this mount, including React StrictMode effect replay. */
export function LoginView({
    api,
    config,
    onLoggedIn,
    serverConfig,
    onServerConfigChange,
    onCompatibility,
}: {
    api: Api;
    config: ModuleConfig;
    onCompatibility?: () => void;
} & CustomLoginComponentProps): JSX.Element | null {
    const [vm, setViewModel] = useState<LoginViewModel | null>(null);
    useEffect(() => {
        const model = new LoginViewModel(new IdentityService(config), onLoggedIn);
        setViewModel(model);
        return () => model.dispose();
    }, [config, onLoggedIn]);
    return vm ? (
        <LoginShell
            api={api}
            vm={vm}
            homeserverUrl={config.homeserverUrl}
            siteUrl={config.siteUrl}
            identityServerName={config.serverName}
            serverConfig={serverConfig}
            onServerConfigChange={onServerConfigChange}
            onCompatibility={onCompatibility}
        />
    ) : null;
}
