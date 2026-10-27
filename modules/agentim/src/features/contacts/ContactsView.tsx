/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { useEffect, type JSX, type FormEvent } from "react";
import { Button, Form } from "@vector-im/compound-web";
import { useWatchable, type Api } from "@element-hq/element-web-module-api";
import type { ContactsViewModel } from "./ContactsViewModel";
import { ContactActions } from "./ContactActions";

/** Contact state is refreshed explicitly and standard chats open through the host. */
export function ContactsView({ vm, api }: { vm: ContactsViewModel; api: Api }): JSX.Element {
    const state = useWatchable(vm.state);
    const t = api.i18n.translate;
    useEffect(() => {
        void vm.load();
    }, [vm]);
    const requestContact = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        const form = event.currentTarget;
        const field = new FormData(form).get("userId");
        const userId = typeof field === "string" ? field.trim() : "";
        form.reset();
        void vm.act(userId, "request");
    };
    return (
        <section aria-label={t("agentim_contacts")}>
            <Form.Root onSubmit={requestContact}>
                <Form.Field name="userId">
                    <Form.Label>{t("agentim_contact_mxid")}</Form.Label>
                    <Form.TextControl required maxLength={255} placeholder="@agent:example.com" disabled={state.busy} />
                </Form.Field>
                <Form.Submit disabled={state.busy}>{t("agentim_request")}</Form.Submit>
            </Form.Root>
            <Button kind="secondary" size="md" disabled={state.busy} onClick={() => void vm.load()}>
                {t("agentim_refresh")}
            </Button>
            <ul>
                {state.contacts.map((contact) => (
                    <li key={contact.user_id}>
                        <p>
                            {contact.user_id} — {t(`agentim_state_${contact.state}`)}{" "}
                            {contact.blocked ? t("agentim_blocked") : ""}
                        </p>
                        <ContactActions
                            contact={contact}
                            userId={contact.user_id}
                            vm={vm}
                            api={api}
                            disabled={state.busy || state.partial?.userId === contact.user_id}
                        />
                    </li>
                ))}
            </ul>
            {state.next && (
                <Button kind="secondary" size="md" disabled={state.busy} onClick={() => void vm.load(true)}>
                    {t("agentim_more")}
                </Button>
            )}
            {state.partial && (
                <div role="alert">
                    <p>{t("agentim_ignore_partial")}</p>
                    <Button kind="secondary" disabled={state.busy} onClick={() => void vm.retryProjection()}>
                        {t("agentim_retry_ignore")}
                    </Button>
                </div>
            )}
            {state.busy && <p role="status">{t("agentim_busy")}</p>}
            {state.failed && <p role="alert">{t("agentim_operation_failed")}</p>}
        </section>
    );
}
