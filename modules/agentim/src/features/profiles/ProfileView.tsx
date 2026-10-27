/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { useEffect, type JSX } from "react";
import { Form, Button } from "@vector-im/compound-web";
import { useWatchable, type Api } from "@element-hq/element-web-module-api";
import type { ProfileViewModel } from "./ProfileViewModel";

/** Existing Compound form controls edit the native Agent's own discovery profile. */
export function ProfileView({ vm, api }: { vm: ProfileViewModel; api: Api }): JSX.Element {
    const state = useWatchable(vm.state);
    const t = api.i18n.translate;
    useEffect(() => {
        if (!vm.state.value.profile) void vm.load();
    }, [vm]);
    const draft = state.draft;
    return (
        <section aria-label={t("agentim_profile")}>
            <Button kind="tertiary" size="md" disabled={state.busy} onClick={() => void vm.load()}>
                {t("agentim_refresh")}
            </Button>
            {draft && (
                <Form.Root
                    onSubmit={(event) => {
                        event.preventDefault();
                        void vm.save();
                    }}
                >
                    <p>{state.profile?.user_id}</p>
                    <Form.Field name="description">
                        <Form.Label>{t("agentim_description")}</Form.Label>
                        <Form.TextControl
                            value={draft.description}
                            maxLength={2000}
                            disabled={state.busy}
                            onChange={(event) => vm.edit({ description: event.currentTarget.value })}
                        />
                    </Form.Field>
                    <Form.Field name="capabilities">
                        <Form.Label>{t("agentim_capabilities")}</Form.Label>
                        <Form.TextControl
                            value={state.capabilitiesText}
                            disabled={state.busy}
                            onChange={(event) => vm.setCapabilities(event.currentTarget.value)}
                        />
                    </Form.Field>
                    <label>
                        <input
                            type="checkbox"
                            checked={draft.discoverable}
                            disabled={state.busy}
                            onChange={(event) => vm.edit({ discoverable: event.currentTarget.checked })}
                        />
                        {t("agentim_discoverable")}
                    </label>
                    <label>
                        {t("agentim_contact_policy")}
                        <select
                            value={draft.contact_policy}
                            disabled={state.busy}
                            onChange={(event) =>
                                vm.edit({
                                    contact_policy: event.currentTarget.value === "closed" ? "closed" : "request",
                                })
                            }
                        >
                            <option value="request">{t("agentim_policy_request")}</option>
                            <option value="closed">{t("agentim_policy_closed")}</option>
                        </select>
                    </label>
                    <Form.Submit disabled={state.busy}>{t("agentim_save")}</Form.Submit>
                </Form.Root>
            )}
            {state.busy && <p role="status">{t("agentim_busy")}</p>}
            {state.saved && <p role="status">{t("agentim_saved")}</p>}
            {state.failed && <p role="alert">{t("agentim_operation_failed")}</p>}
        </section>
    );
}
