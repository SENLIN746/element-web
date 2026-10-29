/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React from "react";
import type { Api, Module } from "@element-hq/element-web-module-api";
import { CONFIG_KEY, parseConfig } from "./configuration/ModuleConfig";
import { LoginGateway } from "./features/identity/LoginGateway";
import { IdentityService } from "./features/identity/IdentityService";
import { startOnboardingCompletion } from "./features/identity/OnboardingCompletion";
import { registerAgentNavigation } from "./navigation/AgentNavigation";
import translations from "./translations.json";
import pairingTranslations from "./features/pairing/translations.json";
import identityTranslations from "./features/identity/translations.json";
import style from "./style.css?inline";
import loginStyle from "./features/identity/login.css?inline";

/** Register the native entry and Agent navigation; standard rooms and encryption remain host-owned. */
export class AgentIMModule implements Module {
    public static readonly moduleApiVersion = "^2.2.0";
    public constructor(private readonly api: Api) {}

    public async load(): Promise<void> {
        const config = parseConfig(this.api.config.get(CONFIG_KEY));
        if (!config) return;
        startOnboardingCompletion(this.api, new IdentityService(config).onboarding);
        this.api.i18n.register({ ...translations, ...identityTranslations, ...pairingTranslations });
        const stylesheet = document.createElement("style");
        stylesheet.textContent = style + loginStyle;
        document.head.append(stylesheet);
        this.api.customComponents.registerLoginComponent((props, OriginalComponent) => (
            <LoginGateway {...props} api={this.api} config={config} compatibility={<OriginalComponent {...props} />} />
        ));
        registerAgentNavigation(this.api);
    }
}
