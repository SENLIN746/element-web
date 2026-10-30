/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type JSX } from "react";
import { Button } from "@vector-im/compound-web";
import { useWatchable, type Api } from "@element-hq/element-web-module-api";
import type { CredentialBackupViewModel } from "./CredentialBackupViewModel";

/** Save and re-read the account credential before completing first-time onboarding. */
export function CredentialBackupView({ api, vm }: { api: Api; vm: CredentialBackupViewModel }): JSX.Element {
    const state = useWatchable(vm.state);
    const t = api.i18n.translate;
    return (
        <section aria-label={t("agentim_account_credential")}>
            <h3>{t("agentim_account_credential")}</h3>
            <p>{t("agentim_account_credential_hint")}</p>
            <Button onClick={vm.download} disabled={state.busy || !state.pending}>
                {t("agentim_account_credential_download")}
            </Button>
            <label>
                {t("agentim_account_credential_verify")}
                <input
                    type="file"
                    accept="application/json,.json"
                    disabled={state.busy || !state.pending}
                    onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) void vm.verifyFile(file);
                    }}
                />
            </label>
            {state.verified && <p role="status">{t("agentim_account_credential_verified")}</p>}
            {state.failed && <p role="alert">{t("agentim_account_credential_failed")}</p>}
            {vm.canRevoke && (
                <Button disabled={state.busy} onClick={vm.revoke}>
                    {t("agentim_account_credential_revoke")}
                </Button>
            )}
            {vm.canRevoke && <p>{t("agentim_account_credential_revoke_hint")}</p>}
            <p>{t("agentim_account_credential_cli")}</p>
            <p>{t("agentim_credential_purposes")}</p>
        </section>
    );
}
