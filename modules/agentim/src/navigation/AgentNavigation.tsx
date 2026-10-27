/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React from "react";
import type { Api } from "@element-hq/element-web-module-api";
import { AgentIMPanel } from "./AgentIMPanel";
import type { SessionTab } from "./SessionModels";

/** Expose Agent features directly without replacing the host's room navigation. */
export function registerAgentNavigation(api: Api): void {
    const locations: Record<string, SessionTab> = {
        "agentim": "profile",
        "agentim-contacts": "contacts",
        "agentim-discovery": "discovery",
        "agentim-identity": "profile",
        "agentim-devices": "devices",
    };
    for (const [path, tab] of Object.entries(locations)) {
        api.navigation.registerLocationRenderer(path, () => <AgentIMPanel api={api} initialTab={tab} />);
    }
    const entries = [
        ["contacts", "agentim_nav_contacts", "IM"],
        ["discovery", "agentim_nav_discovery", "A"],
        ["identity", "agentim_nav_identity", "ID"],
    ] as const;
    for (const [path, label, mark] of entries) {
        api.extras.setSpacePanelItem(`im.agentim.${path}`, {
            label: api.i18n.translate(label),
            tooltip: api.i18n.translate(label),
            icon: (
                <span className="mx_AgentIMNavigation_mark" aria-hidden="true">
                    {mark}
                </span>
            ),
            onSelected: () => {
                window.location.hash = `#/agentim-${path}`;
            },
        });
    }
}
