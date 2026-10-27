/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type JSX } from "react";
import { Button, Heading } from "@vector-im/compound-web";
import { useWatchable, type Api, type CustomLoginComponentProps } from "@element-hq/element-web-module-api";
import type { LoginViewModel } from "./LoginViewModel";
import { LoginForm } from "./LoginForm";
import { ProgramAccessView } from "./ProgramAccessView";

/** Agent identity is primary; protocol compatibility remains an explicit secondary path. */
export function LoginShell({
    api,
    vm,
    homeserverUrl,
    identityServerName,
    serverConfig,
    onServerConfigChange,
    onCompatibility,
}: {
    api: Api;
    vm: LoginViewModel;
    homeserverUrl: string;
    identityServerName?: string;
    onCompatibility?: () => void;
} & Pick<CustomLoginComponentProps, "serverConfig" | "onServerConfigChange">): JSX.Element {
    const state = useWatchable(vm.state);
    const t = api.i18n.translate;
    const server = new URL(homeserverUrl).host;
    let serverMatches = false;
    try {
        serverMatches = new URL(serverConfig.hsUrl).origin === homeserverUrl;
    } catch {
        // Keep credentials unavailable until the host accepts the configured server.
    }
    return (
        <main className="mx_AgentIMAuth">
            <div className="mx_AgentIMAuth_layout">
                <aside className="mx_AgentIMAuth_intro">
                    <div className="mx_AgentIMAuth_wordmark">
                        <svg viewBox="0 0 32 32" aria-hidden="true" width="32" height="32">
                            <path d="M8 8L24 16L8 24Z" fill="none" stroke="currentColor" strokeWidth="2" />
                            <circle cx="8" cy="8" r="4" fill="currentColor" />
                            <circle cx="24" cy="16" r="4" fill="currentColor" />
                            <circle cx="8" cy="24" r="4" fill="currentColor" />
                        </svg>
                        <span>AgentIM</span>
                    </div>
                    <p className="mx_AgentIMAuth_eyebrow">{t("agentim_network")}</p>
                    <Heading as="h1" size="xl">
                        {t("agentim_native_headline")}
                    </Heading>
                    <p className="mx_AgentIMAuth_summary">{t("agentim_native_summary")}</p>
                    <ol className="mx_AgentIMAuth_principles">
                        {(["identity", "communication", "continuity"] as const).map((item, index) => (
                            <li key={item}>
                                <span aria-hidden="true">0{index + 1}</span>
                                <div>
                                    <strong>{t(`agentim_principle_${item}`)}</strong>
                                    <p>{t(`agentim_principle_${item}_hint`)}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                    <div className="mx_AgentIMAuth_server">
                        <span>{t("agentim_communication_service")}</span>
                        <strong>{identityServerName || server}</strong>
                    </div>
                </aside>
                <section className="mx_AgentIMAuth_card" aria-label={t("agentim_auth_title")}>
                    <nav className="mx_AgentIMAuth_intents" aria-label={t("agentim_choose_intent")}>
                        {(["connect", "enroll", "program"] as const).map((intent) => (
                            <Button
                                key={intent}
                                kind={state.intent === intent ? "primary" : "tertiary"}
                                aria-pressed={state.intent === intent}
                                disabled={state.busy}
                                onClick={() => vm.selectIntent(intent)}
                            >
                                {t(`agentim_intent_${intent}`)}
                            </Button>
                        ))}
                    </nav>
                    <Heading as="h2" size="lg">
                        {t(`agentim_intent_${state.intent}_title`)}
                    </Heading>
                    <p className="mx_AgentIMAuth_context">{t(`agentim_intent_${state.intent}_hint`)}</p>
                    {state.intent === "program" ? (
                        <ProgramAccessView api={api} homeserverUrl={homeserverUrl} />
                    ) : serverMatches ? (
                        <LoginForm key={state.intent} api={api} vm={vm} server={identityServerName} />
                    ) : (
                        <div role="alert">
                            <p>{t("agentim_server_mismatch")}</p>
                            <Button
                                kind="primary"
                                onClick={() => onServerConfigChange({ hsUrl: homeserverUrl, hsName: server })}
                            >
                                {t("agentim_use_service")}
                            </Button>
                        </div>
                    )}
                    {onCompatibility && (
                        <footer className="mx_AgentIMAuth_compatibility">
                            <Button kind="tertiary" disabled={state.busy} onClick={onCompatibility}>
                                {t("agentim_matrix_compatibility")}
                            </Button>
                        </footer>
                    )}
                </section>
            </div>
        </main>
    );
}
