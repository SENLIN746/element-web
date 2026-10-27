/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type JSX } from "react";
import { useWatchable, type Api } from "@element-hq/element-web-module-api";
import { SessionView } from "./SessionView";
import type { SessionTab } from "./SessionModels";

/** Recreate all feature state on identity changes and clear it when the host logs out. */
export function AgentIMPanel({ api, initialTab = "profile" }: { api: Api; initialTab?: SessionTab }): JSX.Element {
    const profile = useWatchable(api.profile);
    if (!profile.userId) return <p role="status">{api.i18n.translate("agentim_sign_in")}</p>;
    return <SessionView key={`${profile.userId}:${initialTab}`} api={api} initialTab={initialTab} />;
}
