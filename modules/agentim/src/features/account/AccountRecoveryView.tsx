/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type JSX } from "react";
import type { Api } from "@element-hq/element-web-module-api";
import type { LoginViewModel } from "../identity/LoginViewModel";

/** Recover an existing identity from its saved account credential, without registration. */
export function AccountRecoveryView({ api, vm }: { api: Api; vm: LoginViewModel }): JSX.Element {
    const t = api.i18n.translate;
    return (
        <section>
            <p>{t("agentim_account_restore_hint")}</p>
            <label>
                {t("agentim_account_restore_file")}
                <input
                    type="file"
                    accept="application/json,.json"
                    onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) void vm.recoverFile(file);
                    }}
                />
            </label>
            <p>{t("agentim_credential_purposes")}</p>
        </section>
    );
}
