/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { useState, type JSX, type ReactNode } from "react";
import { Button } from "@vector-im/compound-web";
import type { Api, CustomLoginComponentProps } from "@element-hq/element-web-module-api";
import type { ModuleConfig } from "../../configuration/ModuleConfig";
import { LoginView } from "./LoginView";

/** Mount standard Matrix login only after the compatibility path is explicitly selected. */
export function LoginGateway({
    api,
    config,
    compatibility,
    ...props
}: CustomLoginComponentProps & { api: Api; config: ModuleConfig; compatibility: ReactNode }): JSX.Element {
    const [standard, setStandard] = useState(false);
    if (standard) {
        return (
            <div className="mx_AgentIMCompatibility">
                <Button className="mx_AgentIMCompatibility_back" kind="secondary" onClick={() => setStandard(false)}>
                    {api.i18n.translate("agentim_back_native")}
                </Button>
                {compatibility}
            </div>
        );
    }
    return <LoginView {...props} api={api} config={config} onCompatibility={() => setStandard(true)} />;
}
