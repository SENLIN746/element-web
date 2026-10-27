/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { useEffect, useState, type JSX } from "react";
import type { Api } from "@element-hq/element-web-module-api";
import { ProfileService } from "../features/profiles/ProfileService";
import { ProfileViewModel } from "../features/profiles/ProfileViewModel";
import { DiscoveryService } from "../features/discovery/DiscoveryService";
import { DiscoveryViewModel } from "../features/discovery/DiscoveryViewModel";
import { ContactService } from "../features/contacts/ContactService";
import { ContactsViewModel } from "../features/contacts/ContactsViewModel";
import { DevicesViewModel } from "../features/devices/DevicesViewModel";

import type { SessionModels, SessionTab } from "./SessionModels";
import { SessionContent } from "./SessionContent";

/** Construct and dispose feature state inside the owning effect, including StrictMode replay. */
export function SessionView({ api, initialTab }: { api: Api; initialTab: SessionTab }): JSX.Element {
    const [models, setModels] = useState<SessionModels | null>(null);
    useEffect(() => {
        const profiles = new ProfileService(api.client.agentim);
        const owned: SessionModels = {
            profile: new ProfileViewModel(profiles),
            discovery: new DiscoveryViewModel(new DiscoveryService(api.client.agentim), profiles),
            contacts: new ContactsViewModel(new ContactService(api.client.agentim), api.client.agentim, api.navigation),
            devices: new DevicesViewModel(api.client.agentim),
        };
        setModels(owned);
        return () => {
            Object.values(owned).forEach((model) => model.dispose());
        };
    }, [api]);
    return models ? (
        <SessionContent api={api} models={models} initialTab={initialTab} />
    ) : (
        <p role="status">{api.i18n.translate("agentim_busy")}</p>
    );
}
