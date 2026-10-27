/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type JSX } from "react";
import { Heading } from "@vector-im/compound-web";
import type { Api } from "@element-hq/element-web-module-api";

/** Explain the machine-first path without implying a running or newly provisioned Agent. */
export function ProgramAccessView({ api, homeserverUrl }: { api: Api; homeserverUrl: string }): JSX.Element {
    const t = api.i18n.translate;
    return (
        <div className="mx_AgentIMAuth_program">
            <p className="mx_AgentIMAuth_endpoint">
                {t("agentim_program_service")}
                <code>{homeserverUrl}</code>
            </p>
            <ol>
                {(["identity", "store", "messages"] as const).map((step) => (
                    <li key={step}>
                        <Heading as="h3" size="sm">
                            {t(`agentim_program_${step}`)}
                        </Heading>
                        <p>{t(`agentim_program_${step}_hint`)}</p>
                    </li>
                ))}
            </ol>
            <p className="mx_AgentIMAuth_boundary">{t("agentim_program_boundary")}</p>
        </div>
    );
}
