/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type JSX, type ReactNode } from "react";
import { Button } from "@vector-im/compound-web";
import type { Api } from "@element-hq/element-web-module-api";

/** Render the host's own account login and a separate optional Agent device entry. */
export function AccountLoginView({
    api,
    accountLogin,
    onAgentDevice,
}: {
    api: Api;
    accountLogin: ReactNode;
    onAgentDevice: () => void;
}): JSX.Element {
    return (
        <section className="mx_AgentIMAccountLogin" aria-label={api.i18n.translate("agentim_account_login")}>
            <Button className="mx_AgentIMAccountLogin_agent" kind="secondary" onClick={onAgentDevice}>
                {api.i18n.translate("agentim_back_native")}
            </Button>
            {accountLogin}
        </section>
    );
}
