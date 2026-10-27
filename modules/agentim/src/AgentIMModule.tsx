/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React from "react";
import type { Api, Module } from "@element-hq/element-web-module-api";
import { CONFIG_KEY, parseConfig } from "./configuration/ModuleConfig";
import { LoginView } from "./features/identity/LoginView";
import { AgentIMPanel } from "./navigation/AgentIMPanel";
import translations from "./translations.json";
import style from "./style.css?inline";

/** Register AgentIM forms and navigation while retaining the host's standard login and chat views. */
export class AgentIMModule implements Module {
    public static readonly moduleApiVersion = "^2.2.0";
    public constructor(private readonly api: Api) {}

    public async load(): Promise<void> {
        const config = parseConfig(this.api.config.get(CONFIG_KEY));
        if (!config) return;
        this.api.i18n.register(translations);
        const stylesheet = document.createElement("style");
        stylesheet.textContent = style;
        document.head.append(stylesheet);
        this.api.customComponents.registerLoginComponent((props, OriginalComponent) => (
            <OriginalComponent {...props}>
                {props.children}
                <LoginView {...props} api={this.api} config={config} />
            </OriginalComponent>
        ));
        this.api.navigation.registerLocationRenderer("agentim", () => <AgentIMPanel api={this.api} />);
        this.api.extras.setSpacePanelItem("im.agentim", {
            label: this.api.i18n.translate("agentim_title"),
            tooltip: this.api.i18n.translate("agentim_title"),
            onSelected: () => {
                window.location.hash = "#/agentim";
            },
        });
    }
}
