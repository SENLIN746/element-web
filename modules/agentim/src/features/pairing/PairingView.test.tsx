/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Api } from "@element-hq/element-web-module-api";
import { PairingView } from "./PairingView";
import { PairingViewModel } from "./PairingViewModel";
import type { PairingService } from "./PairingService";

const api = { i18n: { translate: (key: string) => key } } as unknown as Api;

describe("Pairing waiting view", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("should summarize the target and leave cancellation usable without repeated disabled fields", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const vm = new PairingViewModel({} as PairingService, vi.fn());
        vm.state.value = {
            target: "@agent:example",
            device: "Desktop QA",
            phase: "waiting",
            seconds: 300,
            request: {
                pairing_id: "p".repeat(43),
                target_user_id: "@agent:example",
                user_code: "ABCD-EFGH",
                code_challenge: "c".repeat(43),
                client_origin: "vector://vector",
                device_name: "Desktop QA",
                state: "pending",
                created_at_ms: 0,
                expires_at_ms: 300000,
                server_time_ms: 0,
                poll_interval_ms: 2000,
            },
        };
        const container = document.createElement("div");
        document.body.append(container);
        const root = createRoot(container);
        try {
            await act(async () => root.render(<PairingView api={api} vm={vm} />));
            expect(container.querySelector("input")).toBeNull();
            expect(container.textContent).toContain("@agent:example");
            expect(container.textContent).toContain("Desktop QA");
            expect(container.textContent).toContain("ABCD-EFGH");
            const cancel = [...container.querySelectorAll("button")].find(
                (button) => button.textContent === "agentim_pair_cancel",
            );
            expect(cancel?.disabled).toBe(false);
            await act(async () => cancel!.click());
            expect(vm.state.value.phase).toBe("idle");
            expect(container.querySelector<HTMLInputElement>('input[name="target"]')!.value).toBe("@agent:example");
        } finally {
            await act(async () => root.unmount());
            vm.dispose();
            container.remove();
        }
    });
});
