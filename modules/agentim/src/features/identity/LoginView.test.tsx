/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Api } from "@element-hq/element-web-module-api";
import { OnboardingService } from "./OnboardingService";
import { IdentityService } from "./IdentityService";
import { LoginView } from "./LoginView";

const config = { homeserverUrl: "https://agents.example" };

describe("LoginView lifecycle", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("should authenticate after StrictMode effect replay and clear submitted credentials", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        vi.spyOn(OnboardingService.prototype, "isOpen").mockResolvedValue(true);
        vi.spyOn(IdentityService.prototype, "enroll").mockResolvedValue({
            userId: "@agent:example",
            deviceId: "NEW",
            accessToken: "synthetic",
            homeserverUrl: config.homeserverUrl,
        });
        const container = document.createElement("div");
        document.body.append(container);
        const root = createRoot(container);
        const done = vi.fn();
        const api = { i18n: { translate: (key: string) => key } } as unknown as Api;
        try {
            await act(async () =>
                root.render(
                    <StrictMode>
                        <LoginView
                            api={api}
                            config={config}
                            onLoggedIn={done}
                            serverConfig={{ hsUrl: config.homeserverUrl, hsName: "AgentIM" }}
                            onServerConfigChange={vi.fn()}
                        />
                    </StrictMode>,
                ),
            );
            await act(async () =>
                [...container.querySelectorAll("button")]
                    .find((button) => button.textContent === "agentim_intent_enroll")!
                    .click(),
            );
            container.querySelector<HTMLInputElement>('input[name="localpart"]')!.value = "agent";
            expect(container.querySelector('input[name="enrollmentToken"]')).toBeNull();
            await act(async () => {
                container
                    .querySelector("form")!
                    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            });
            expect(done).toHaveBeenCalledWith(expect.objectContaining({ userId: "@agent:example", deviceId: "NEW" }));
        } finally {
            await act(async () => root.unmount());
            container.remove();
        }
    });
});
