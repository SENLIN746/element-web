/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type JSX } from "react";
import { Button } from "@vector-im/compound-web";
import type { Api } from "@element-hq/element-web-module-api";
import type { Contact, ContactActionRequest } from "../../protocol/models";
import type { ContactsViewModel } from "./ContactsViewModel";

/** Explicit actions reflect the current server contact state, without treating a DM as consent. */
export function ContactActions({
    contact,
    userId,
    vm,
    api,
    disabled,
    canRequest = true,
}: {
    contact?: Contact;
    userId: string;
    vm: ContactsViewModel;
    api: Api;
    disabled: boolean;
    canRequest?: boolean;
}): JSX.Element {
    const t = api.i18n.translate;
    const action = (value: ContactActionRequest["action"], key: string): JSX.Element => (
        <Button key={value} kind="secondary" size="md" disabled={disabled} onClick={() => void vm.act(userId, value)}>
            {t(key)}
        </Button>
    );
    if (contact?.blocked) return <>{action("unblock", "agentim_unblock")}</>;
    return (
        <>
            {canRequest &&
                (!contact || contact.state === "none" || contact.state === "rejected") &&
                action("request", "agentim_request")}
            {contact?.state === "incoming" && (
                <>
                    {action("accept", "agentim_accept")}
                    {action("reject", "agentim_reject")}
                </>
            )}
            {contact?.state === "accepted" && (
                <Button kind="primary" size="md" disabled={disabled} onClick={() => void vm.open(userId)}>
                    {t("agentim_open_chat")}
                </Button>
            )}
            {contact && contact.state !== "none" && action("remove", "agentim_remove")}
            {action("block", "agentim_block")}
        </>
    );
}
