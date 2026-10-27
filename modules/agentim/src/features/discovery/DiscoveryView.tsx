/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { useEffect, type JSX } from "react";
import { Button, Form, Heading } from "@vector-im/compound-web";
import { useWatchable, type Api } from "@element-hq/element-web-module-api";
import type { DiscoveryViewModel } from "./DiscoveryViewModel";
import type { ContactsViewModel } from "../contacts/ContactsViewModel";
import { ContactActions } from "../contacts/ContactActions";

/** Search explicitly, inspect the server profile, and choose a separate contact action. */
export function DiscoveryView({
    vm,
    contacts,
    api,
}: {
    vm: DiscoveryViewModel;
    contacts: ContactsViewModel;
    api: Api;
}): JSX.Element {
    const state = useWatchable(vm.state);
    const contactState = useWatchable(contacts.state);
    const t = api.i18n.translate;
    useEffect(() => {
        void contacts.load();
    }, [contacts]);
    const selected = state.selected;
    return (
        <section aria-label={t("agentim_discovery")}>
            <p>{t("agentim_discovery_hint")}</p>
            <Form.Root
                onSubmit={(event) => {
                    event.preventDefault();
                    void vm.search();
                }}
            >
                <Form.Field name="query">
                    <Form.Label>{t("agentim_search_query")}</Form.Label>
                    <Form.TextControl
                        value={state.query}
                        maxLength={255}
                        disabled={state.busy}
                        onChange={(event) => vm.edit({ query: event.currentTarget.value })}
                    />
                </Form.Field>
                <Form.Field name="capability">
                    <Form.Label>{t("agentim_capability")}</Form.Label>
                    <Form.TextControl
                        value={state.capability}
                        maxLength={64}
                        disabled={state.busy}
                        onChange={(event) => vm.edit({ capability: event.currentTarget.value })}
                    />
                </Form.Field>
                <Form.Submit disabled={state.busy}>{t("agentim_search")}</Form.Submit>
            </Form.Root>
            <ul>
                {state.profiles.map((profile) => (
                    <li key={profile.user_id}>
                        <Button
                            kind="tertiary"
                            size="md"
                            disabled={state.busy}
                            onClick={() => void vm.read(profile.user_id)}
                        >
                            {profile.user_id}
                        </Button>
                        <p>{profile.description}</p>
                    </li>
                ))}
            </ul>
            {state.next && (
                <Button kind="secondary" size="md" disabled={state.busy} onClick={() => void vm.search(true)}>
                    {t("agentim_more")}
                </Button>
            )}
            {selected && (
                <article aria-label={t("agentim_selected_profile")}>
                    <Heading as="h2" size="sm">
                        {selected.user_id}
                    </Heading>
                    <p>{selected.description}</p>
                    <p>{selected.capabilities.join(", ")}</p>
                    <p>{t(`agentim_policy_${selected.contact_policy}`)}</p>
                    {selected.user_id !== api.profile.value.userId && (
                        <ContactActions
                            contact={contactState.contacts.find((contact) => contact.user_id === selected.user_id)}
                            userId={selected.user_id}
                            vm={contacts}
                            api={api}
                            canRequest={selected.contact_policy === "request"}
                            disabled={
                                contactState.busy ||
                                contactState.partial?.userId === selected.user_id ||
                                contactState.failed ||
                                (!!contactState.next &&
                                    !contactState.contacts.some((contact) => contact.user_id === selected.user_id))
                            }
                        />
                    )}
                    {contactState.next && (
                        <Button kind="secondary" disabled={contactState.busy} onClick={() => void contacts.load(true)}>
                            {t("agentim_load_contacts")}
                        </Button>
                    )}
                </article>
            )}
            {contactState.partial && (
                <div role="alert">
                    <p>{t("agentim_ignore_partial")}</p>
                    <Button
                        kind="secondary"
                        disabled={contactState.busy}
                        onClick={() => void contacts.retryProjection()}
                    >
                        {t("agentim_retry_ignore")}
                    </Button>
                </div>
            )}
            {state.busy && <p role="status">{t("agentim_busy")}</p>}
            {(state.failed || contactState.failed) && <p role="alert">{t("agentim_operation_failed")}</p>}
        </section>
    );
}
