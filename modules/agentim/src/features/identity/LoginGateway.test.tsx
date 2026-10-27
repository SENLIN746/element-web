/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Api } from "@element-hq/element-web-module-api";
import { LoginGateway } from "./LoginGateway";

const config = { homeserverUrl: "https://agents.example", serverName: "matrix.example" };
const api = { i18n: { translate: (key: string) => key } } as unknown as Api;

describe("Agent-native entry", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        vi.stubGlobal("fetch", vi.fn());
        container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(async () => {
        await act(async () => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    });

    async function render(hsUrl = config.homeserverUrl, done = vi.fn(), changeServer = vi.fn()): Promise<void> {
        await act(async () =>
            root.render(
                <LoginGateway
                    api={api}
                    config={config}
                    serverConfig={{ hsUrl, hsName: "Human-readable service label" }}
                    onLoggedIn={done}
                    onServerConfigChange={changeServer}
                    compatibility={
                        <form aria-label="standard-matrix">
                            <input name="username" />
                        </form>
                    }
                />,
            ),
        );
    }

    async function click(label: string): Promise<void> {
        const button = [...container.querySelectorAll("button")].find((item) => item.textContent === label);
        expect(button).toBeDefined();
        await act(async () => button!.click());
    }

    it("should default to connecting an Agent and mount standard login only on explicit selection", async () => {
        await render();
        expect(container.querySelector('input[name="username"]')).toBeNull();
        expect(container.querySelector('input[name="enrollmentToken"]')).toBeNull();
        expect(container.querySelector('input[name="loginToken"]')).not.toBeNull();
        await click("agentim_matrix_compatibility");
        expect(container.querySelector('input[name="username"]')).not.toBeNull();
        expect(container.querySelector('input[name="loginToken"]')).toBeNull();
        await click("agentim_back_native");
        expect(container.querySelector('input[name="username"]')).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("should discard secret fields when changing intent and never invent an identity from the transport host", async () => {
        await render();
        const old = container.querySelector<HTMLInputElement>('input[name="loginToken"]')!;
        old.value = "synthetic-private-code";
        await click("agentim_intent_enroll");
        expect(container.querySelector('input[name="loginToken"]')).toBeNull();
        expect(container.querySelector('input[name="localpart"]')).not.toBeNull();
        expect(container.querySelector("#agentim-address-preview")!.textContent).toContain(
            "@research-agent:matrix.example",
        );
        expect(container.querySelector("#agentim-address-preview")!.textContent).not.toContain("agents.example");
        await click("agentim_intent_connect");
        expect(container.querySelector<HTMLInputElement>('input[name="loginToken"]')!.value).toBe("");
        expect(container.textContent).not.toContain("synthetic-private-code");
    });

    it("should provide a program-first path without asking for a human or making authentication requests", async () => {
        await render();
        await click("agentim_intent_program");
        expect(container.querySelector("form")).toBeNull();
        expect(container.textContent).toContain(config.homeserverUrl);
        expect(container.textContent).toContain("agentim_program_store_hint");
        expect(fetch).not.toHaveBeenCalled();
    });

    it("should keep credentials unavailable for another service and offer an explicit origin correction", async () => {
        const changeServer = vi.fn();
        await render("https://other.example", vi.fn(), changeServer);
        expect(container.querySelector("input")).toBeNull();
        expect(container.querySelector('[role="alert"]')).not.toBeNull();
        await click("agentim_use_service");
        expect(changeServer).toHaveBeenCalledWith({ hsUrl: config.homeserverUrl, hsName: "agents.example" });
        expect(fetch).not.toHaveBeenCalled();
    });

    it("should register a new identity then connect its independent device and clear the permit", async () => {
        const done = vi.fn();
        vi.mocked(fetch)
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        user_id: "@research-agent:matrix.example",
                        login_token: "synthetic-login",
                        expires_in_ms: 60000,
                    }),
                    { headers: { "content-type": "application/json" } },
                ),
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        user_id: "@research-agent:matrix.example",
                        device_id: "INDEPENDENT",
                        access_token: "synthetic-device",
                    }),
                    { headers: { "content-type": "application/json" } },
                ),
            );
        await render(config.homeserverUrl, done);
        await click("agentim_intent_enroll");
        container.querySelector<HTMLInputElement>('input[name="localpart"]')!.value = "research-agent";
        const permit = container.querySelector<HTMLInputElement>('input[name="enrollmentToken"]')!;
        permit.value = "synthetic-admission";
        await act(async () =>
            container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
        );
        expect(done).toHaveBeenCalledWith(
            expect.objectContaining({ userId: "@research-agent:matrix.example", deviceId: "INDEPENDENT" }),
        );
        expect(permit.value).toBe("");
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});
