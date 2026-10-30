/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Api } from "@element-hq/element-web-module-api";
import { IdentityService } from "./IdentityService";
import { OnboardingService } from "./OnboardingService";
import { LoginGateway } from "./LoginGateway";
import type { ModuleConfig } from "../../configuration/ModuleConfig";

const config = { homeserverUrl: "https://agents.example", serverName: "matrix.example" };
const api = { i18n: { translate: (key: string) => key } } as unknown as Api;

describe("Agent-native entry", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        vi.stubGlobal("fetch", vi.fn());
        vi.spyOn(OnboardingService.prototype, "isOpen").mockResolvedValue(true);
        container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(async () => {
        await act(async () => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    async function render(
        hsUrl = config.homeserverUrl,
        done = vi.fn(),
        changeServer = vi.fn(),
        defaultLogin?: ModuleConfig["defaultLogin"],
    ): Promise<void> {
        await act(async () =>
            root.render(
                <LoginGateway
                    api={api}
                    config={{ ...config, defaultLogin }}
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

    it("should default Desktop to account login without creating an Agent or requesting authorization", async () => {
        const enroll = vi.spyOn(IdentityService.prototype, "enroll");
        await render(config.homeserverUrl, vi.fn(), vi.fn(), "account");
        const username = container.querySelector<HTMLInputElement>('input[name="username"]')!;
        expect(username).not.toBeNull();
        expect(container.querySelector('input[name="target"]')).toBeNull();
        username.value = "synthetic-account-input";
        expect(enroll).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
        await click("agentim_back_native");
        expect(container.querySelector('input[name="target"]')).not.toBeNull();
        expect(container.querySelector('input[name="username"]')).toBeNull();
        await click("agentim_matrix_compatibility");
        expect(container.querySelector<HTMLInputElement>('input[name="username"]')!.value).toBe("");
        expect(fetch).not.toHaveBeenCalled();
    });

    async function click(label: string): Promise<void> {
        const button = [...container.querySelectorAll("button")].find((item) => item.textContent === label);
        expect(button).toBeDefined();
        await act(async () => button!.click());
    }

    it("should default to connecting an Agent and mount standard login only on explicit selection", async () => {
        await render();
        expect(container.querySelector('input[name="username"]')).toBeNull();
        expect(container.querySelector('input[name="enrollmentToken"]')).toBeNull();
        expect(container.querySelector('input[name="target"]')).not.toBeNull();
        expect(container.querySelector<HTMLInputElement>('input[name="target"]')!.labels?.[0]?.textContent).toBe(
            "agentim_pair_target",
        );
        await click("agentim_matrix_compatibility");
        expect(container.querySelector('input[name="username"]')).not.toBeNull();
        expect(container.querySelector('input[name="loginToken"]')).toBeNull();
        await click("agentim_back_native");
        expect(container.querySelector('input[name="username"]')).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("should link downloads to the configured communication service without authentication", async () => {
        await render();
        const link = container.querySelector<HTMLAnchorElement>('a[href="https://agents.example/downloads/"]');
        expect(link?.textContent).toBe("agentim_download_clients");
        expect(link?.target).toBe("_blank");
        expect(fetch).not.toHaveBeenCalled();
    });

    it("should discard secret fields when changing intent and never invent an identity from the transport host", async () => {
        await render();
        const old = container.querySelector<HTMLInputElement>('input[name="target"]')!;
        old.value = "synthetic-private-code";
        await click("agentim_intent_enroll");
        expect(container.querySelector('input[name="loginToken"]')).toBeNull();
        expect(container.querySelector('input[name="localpart"]')).not.toBeNull();
        expect(container.querySelector("#agentim-address-preview")!.textContent).toContain(
            "@research-agent:matrix.example",
        );
        expect(container.querySelector("#agentim-address-preview")!.textContent).not.toContain("agents.example");
        await click("agentim_intent_connect");
        expect(container.querySelector<HTMLInputElement>('input[name="target"]')!.value).toBe("");
        expect(container.textContent).not.toContain("synthetic-private-code");
    });

    it("should provide a program-first path without asking for a human or making authentication requests", async () => {
        await render();
        await click("agentim_intent_program");
        expect(container.querySelector("form")).toBeNull();
        expect(container.textContent).toContain("AGENTIM_SITE_URL");
        expect(container.textContent).toContain("agentim-runtime-0.1.3.tgz");
        expect(container.textContent).toContain("agentim messages inbox");
        expect(container.textContent).not.toContain("agentim-runtime-0.1.2.tgz");
        expect(container.textContent).not.toContain("agentim-runtime-0.1.0.tgz");
        expect(container.textContent).toContain("agentim_program_skill");
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

    it("should submit only the Agent ID with no permit field", async () => {
        const done = vi.fn();
        const enroll = vi.spyOn(IdentityService.prototype, "enroll").mockResolvedValue({
            userId: "@research-agent:matrix.example",
            deviceId: "INDEPENDENT",
            accessToken: "synthetic-device",
            homeserverUrl: config.homeserverUrl,
        });
        await render(config.homeserverUrl, done);
        await click("agentim_intent_enroll");
        expect(container.querySelector('input[name="enrollmentToken"]')).toBeNull();
        container.querySelector<HTMLInputElement>('input[name="localpart"]')!.value = "research-agent";
        await act(async () =>
            container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
        );
        expect(enroll).toHaveBeenCalledWith("research-agent", expect.any(AbortSignal));
        expect(done).toHaveBeenCalledWith(expect.objectContaining({ userId: "@research-agent:matrix.example" }));
        expect(fetch).not.toHaveBeenCalled();
    });
});
