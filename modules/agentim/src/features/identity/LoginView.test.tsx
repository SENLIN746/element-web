/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Api } from "@element-hq/element-web-module-api";
import { LoginView } from "./LoginView";

const config = { homeserverUrl: "https://agents.example" };

describe("LoginView lifecycle", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("should authenticate after StrictMode effect replay and clear submitted credentials", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        user_id: "@agent:example",
                        device_id: "NEW",
                        access_token: "test-device-token",
                    }),
                    { headers: { "content-type": "application/json" } },
                ),
            ),
        );
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
            const input = container.querySelector<HTMLInputElement>('input[name="loginToken"]');
            expect(input).not.toBeNull();
            input!.value = "short-one-use";
            await act(async () => {
                container
                    .querySelector("form")!
                    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            });
            expect(done).toHaveBeenCalledWith(expect.objectContaining({ userId: "@agent:example", deviceId: "NEW" }));
            expect(input!.value).toBe("");
        } finally {
            await act(async () => root.unmount());
            container.remove();
        }
    });
});
