/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { useState, type JSX } from "react";
import { Button, Heading } from "@vector-im/compound-web";
import type { Api } from "@element-hq/element-web-module-api";
import type { SessionModels } from "./SessionModels";
import { ProfileView } from "../features/profiles/ProfileView";
import { DiscoveryView } from "../features/discovery/DiscoveryView";
import { ContactsView } from "../features/contacts/ContactsView";
import { DevicesView } from "../features/devices/DevicesView";

type Tab = "profile" | "discovery" | "contacts" | "devices";

/** Render standard Compound business forms with feature state supplied by the owner. */
export function SessionContent({ api, models }: { api: Api; models: SessionModels }): JSX.Element {
    const [tab, setTab] = useState<Tab>("profile");
    const t = api.i18n.translate;
    return (
        <main className="mx_AgentIMPanel">
            <Heading as="h1" size="lg">
                {t("agentim_title")}
            </Heading>
            <nav aria-label={t("agentim_title")}>
                {(["profile", "discovery", "contacts", "devices"] as const).map((name) => (
                    <Button
                        key={name}
                        kind={tab === name ? "primary" : "secondary"}
                        size="md"
                        aria-pressed={tab === name}
                        onClick={() => setTab(name)}
                    >
                        {t(`agentim_${name}`)}
                    </Button>
                ))}
            </nav>
            {tab === "profile" && <ProfileView vm={models.profile} api={api} />}
            {tab === "discovery" && <DiscoveryView vm={models.discovery} contacts={models.contacts} api={api} />}
            {tab === "contacts" && <ContactsView vm={models.contacts} api={api} />}
            {tab === "devices" && <DevicesView vm={models.devices} api={api} />}
        </main>
    );
}
