/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { useState, type JSX } from "react";
import { Button, Heading } from "@vector-im/compound-web";
import { useWatchable, type Api } from "@element-hq/element-web-module-api";
import type { SessionModels, SessionTab } from "./SessionModels";
import { ProfileView } from "../features/profiles/ProfileView";
import { DiscoveryView } from "../features/discovery/DiscoveryView";
import { ContactsView } from "../features/contacts/ContactsView";
import { DevicesView } from "../features/devices/DevicesView";

/** Render standard Compound business forms with feature state supplied by the owner. */
export function SessionContent({
    api,
    models,
    initialTab,
}: {
    api: Api;
    models: SessionModels;
    initialTab: SessionTab;
}): JSX.Element {
    const [tab, setTab] = useState<SessionTab>(initialTab);
    const identity = useWatchable(api.profile);
    const t = api.i18n.translate;
    return (
        <main className="mx_AgentIMPanel">
            <header className="mx_AgentIMPanel_identity" role="group" aria-label={t("agentim_current_identity")}>
                <p>{t("agentim_current_identity")}</p>
                <Heading as="h1" size="lg">
                    {identity.displayName || identity.userId}
                </Heading>
                <code>{identity.userId}</code>
                <p>{t("agentim_identity_boundary")}</p>
            </header>
            <nav aria-label={t("agentim_navigation")}>
                {(["contacts", "discovery", "profile", "devices"] as const).map((name) => (
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
            {tab === "contacts" && (
                <ContactsView vm={models.contacts} api={api} onDiscover={() => setTab("discovery")} />
            )}
            {tab === "devices" && <DevicesView vm={models.devices} api={api} />}
        </main>
    );
}
