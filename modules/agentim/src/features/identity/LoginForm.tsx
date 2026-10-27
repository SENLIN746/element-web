/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type JSX, type FormEvent } from "react";
import { Form, Heading } from "@vector-im/compound-web";
import { useWatchable, type Api, type CustomLoginComponentProps } from "@element-hq/element-web-module-api";
import type { LoginViewModel } from "./LoginViewModel";

/** Render credential forms against an owned authentication view model. */
export function LoginForm({
    api,
    vm,
    homeserverUrl,
    serverConfig,
}: {
    api: Api;
    vm: LoginViewModel;
    homeserverUrl: string;
} & Pick<CustomLoginComponentProps, "serverConfig">): JSX.Element {
    const state = useWatchable(vm.state);
    const t = api.i18n.translate;
    let serverMatches = false;
    try {
        serverMatches = new URL(serverConfig.hsUrl).origin === homeserverUrl;
    } catch {
        /* Disabled below. */
    }
    if (!serverMatches) return <p role="alert">{t("agentim_server_mismatch")}</p>;
    const submit =
        (kind: "login" | "enroll") =>
        (event: FormEvent<HTMLFormElement>): void => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            const tokenField = data.get(kind === "login" ? "loginToken" : "enrollmentToken");
            const token = typeof tokenField === "string" ? tokenField : "";
            const nameField = data.get("localpart");
            const localpart = typeof nameField === "string" ? nameField : "";
            form.reset();
            if (kind === "login") void vm.login(token);
            else void vm.enroll(localpart, token);
        };
    return (
        <section aria-label={t("agentim_auth_title")}>
            <Heading as="h2" size="sm">
                {t("agentim_auth_title")}
            </Heading>
            <Form.Root onSubmit={submit("login")}>
                <Form.Field name="loginToken">
                    <Form.Label>{t("agentim_login_token")}</Form.Label>
                    <Form.TextControl type="password" autoComplete="off" required disabled={state.busy} />
                </Form.Field>
                <Form.Submit disabled={state.busy}>{t("agentim_login")}</Form.Submit>
            </Form.Root>
            <Form.Root onSubmit={submit("enroll")}>
                <Form.Field name="localpart">
                    <Form.Label>{t("agentim_localpart")}</Form.Label>
                    <Form.TextControl
                        required
                        minLength={3}
                        maxLength={64}
                        pattern="[a-z][a-z0-9._=\-]{2,63}"
                        autoComplete="off"
                        disabled={state.busy}
                    />
                </Form.Field>
                <Form.Field name="enrollmentToken">
                    <Form.Label>{t("agentim_enrollment_token")}</Form.Label>
                    <Form.TextControl type="password" autoComplete="off" required disabled={state.busy} />
                </Form.Field>
                <Form.Submit disabled={state.busy}>{t("agentim_register")}</Form.Submit>
            </Form.Root>
            <p>{t("agentim_token_hint")}</p>
            {state.busy && <p role="status">{t("agentim_busy")}</p>}
            {state.failed && <p role="alert">{t("agentim_auth_failed")}</p>}
        </section>
    );
}
