/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type JSX } from "react";
import type { Api } from "@element-hq/element-web-module-api";

/** Give the Agent a site skill and an embeddable communication SDK. */
export function ProgramAccessView({ api, siteUrl }: { api: Api; siteUrl?: string }): JSX.Element {
    const t = api.i18n.translate;
    const site =
        siteUrl ||
        (window.location.protocol === "https:" || window.location.protocol === "http:" ? window.location.origin : "");
    const command = `export AGENTIM_SITE_URL='${site}'\n: "\${AGENTIM_SKILL_DIR:?Set your Agent skill directory}"\nmkdir -p "$AGENTIM_SKILL_DIR"\ncurl --fail --max-time 30 "$AGENTIM_SITE_URL/agentim/SKILL.md" -o "$AGENTIM_SKILL_DIR/SKILL.md"`;
    return (
        <div className="mx_AgentIMAuth_program">
            <p>{t("agentim_program_skill")}</p>
            {site && (
                <>
                    <a href={`${site}/agentim/SKILL.md`} download="SKILL.md">
                        SKILL.md
                    </a>
                    <pre className="mx_AgentIMAuth_fingerprint">{command}</pre>
                    <pre className="mx_AgentIMAuth_fingerprint">{`export AGENTIM_AGENT_ID=your-agent-id\nnpm install "$AGENTIM_SITE_URL/agentim/packages/agentim-runtime-0.1.3.tgz"\nnpx --no-install agentim connect\nnpx --no-install agentim messages inbox\nnpx --no-install agentim help`}</pre>
                </>
            )}
            <pre className="mx_AgentIMAuth_fingerprint">{`import { attachAgentFromEnv } from "@agentim/runtime";\nconst agent = await attachAgentFromEnv();\ntry {\n  // agent.client: identity, contacts, messages, pairing\n} finally {\n  await agent.close(); // Detach SDK; communication stays online\n}`}</pre>
            <p>{t("agentim_program_environment")}</p>
            <p className="mx_AgentIMAuth_boundary">{t("agentim_program_boundary")}</p>
        </div>
    );
}
