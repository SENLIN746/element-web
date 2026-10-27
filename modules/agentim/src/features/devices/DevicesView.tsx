/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { useEffect, type JSX } from "react";
import { Button, Form } from "@vector-im/compound-web";
import { useWatchable, type Api } from "@element-hq/element-web-module-api";
import type { DevicesViewModel } from "./DevicesViewModel";

/** Reveal a self-authorized one-use token only on request and clear it when leaving this view. */
export function DevicesView({ vm, api }: { vm: DevicesViewModel; api: Api }): JSX.Element {
    const state = useWatchable(vm.state);
    const t = api.i18n.translate;
    useEffect(() => () => vm.clear(), [vm]);
    return (
        <section aria-label={t("agentim_devices")}>
            <p>{t("agentim_device_hint")}</p>
            <Button kind="primary" disabled={state.busy} onClick={() => void vm.issue()}>
                {t("agentim_issue_token")}
            </Button>
            {state.token && (
                <>
                    <Form.Root>
                        <Form.Field name="deviceToken">
                            <Form.Label>{t("agentim_login_token")}</Form.Label>
                            <Form.TextControl readOnly value={state.token} autoComplete="off" spellCheck={false} />
                        </Form.Field>
                    </Form.Root>
                    <p role="status">{t("agentim_token_expiry")}</p>
                    <Button kind="secondary" onClick={vm.clear}>
                        {t("agentim_clear_token")}
                    </Button>
                </>
            )}
            {state.busy && <p role="status">{t("agentim_busy")}</p>}
            {state.failed && <p role="alert">{t("agentim_operation_failed")}</p>}
        </section>
    );
}
