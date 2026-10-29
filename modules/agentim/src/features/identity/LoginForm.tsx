/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type JSX, type FormEvent } from "react";
import { Form } from "@vector-im/compound-web";
import { useWatchable, type Api } from "@element-hq/element-web-module-api";
import type { LoginViewModel } from "./LoginViewModel";

/** One intent per form; submitted secrets are cleared before authentication begins. */
export function LoginForm({ api, vm, server }: { api: Api; vm: LoginViewModel; server?: string }): JSX.Element {
    const state = useWatchable(vm.state);
    const enroll = state.intent === "enroll";
    const t = api.i18n.translate;
    const submit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const field = data.get("loginToken");
        const secret = typeof field === "string" ? field : "";
        const localpart = data.get("localpart");
        form.reset();
        if (enroll) void vm.enroll(typeof localpart === "string" ? localpart : "");
        else void vm.login(secret);
    };
    return (
        <>
            <Form.Root onSubmit={submit}>
                {enroll && (
                    <>
                        <Form.Field name="localpart">
                            <Form.Label>{t("agentim_localpart")}</Form.Label>
                            <Form.TextControl
                                required
                                minLength={3}
                                maxLength={64}
                                pattern="[a-z][a-z0-9._=\-]{2,63}"
                                autoComplete="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                disabled={state.busy}
                                placeholder="research-agent"
                                value={state.localpart}
                                onChange={(event) => vm.editLocalpart(event.currentTarget.value)}
                                aria-describedby="agentim-address-preview"
                            />
                        </Form.Field>
                        <p id="agentim-address-preview" className="mx_AgentIMAuth_address">
                            {t("agentim_identity_address")}
                            <code>
                                {server
                                    ? `@${state.localpart || "research-agent"}:${server}`
                                    : state.localpart || "research-agent"}
                            </code>
                        </p>
                    </>
                )}
                {!enroll && (
                    <Form.Field name="loginToken">
                        <Form.Label>{t("agentim_login_token")}</Form.Label>
                        <Form.TextControl
                            type="password"
                            autoComplete="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            required
                            maxLength={4096}
                            disabled={state.busy}
                            aria-describedby="agentim-credential-help"
                        />
                    </Form.Field>
                )}
                <p id="agentim-credential-help" className="mx_AgentIMAuth_fieldHelp">
                    {t(enroll ? "agentim_enrollment_help" : "agentim_authorization_help")}
                </p>
                {enroll && state.registration !== "open" && (
                    <p role="status">{t(`agentim_registration_${state.registration}`)}</p>
                )}
                <Form.Submit disabled={state.busy || (enroll && state.registration !== "open")}>
                    {t(enroll ? "agentim_register" : "agentim_login")}
                </Form.Submit>
            </Form.Root>
            {!enroll && (
                <details className="mx_AgentIMAuth_help">
                    <summary>{t("agentim_authorization_source")}</summary>
                    <p>{t("agentim_authorization_source_hint")}</p>
                </details>
            )}
            <p className="mx_AgentIMAuth_boundary">{t(enroll ? "agentim_enroll_boundary" : "agentim_token_hint")}</p>
            {state.busy && <p role="status">{t("agentim_busy")}</p>}
            {state.failed && <p role="alert">{t("agentim_auth_failed")}</p>}
            {enroll && state.registration === "unavailable" && (
                <button type="button" onClick={() => void vm.refreshPolicy()}>
                    {t("agentim_registration_retry")}
                </button>
            )}
        </>
    );
}
