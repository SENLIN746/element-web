/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import { parseConfig } from "./ModuleConfig";

describe("AgentIM configuration", () => {
    it("should be opt-in and accept HTTPS or explicit loopback development", () => {
        expect(parseConfig(undefined)).toBeNull();
        expect(parseConfig({ homeserver_url: "https://agents.example/" })).toEqual({
            homeserverUrl: "https://agents.example",
        });
        expect(parseConfig({ homeserver_url: "http://127.0.0.1:8008" })).toEqual({
            homeserverUrl: "http://127.0.0.1:8008",
        });
    });
    it.each([
        "http://agents.example",
        "https://user:secret@agents.example",
        "https://agents.example/path",
        "https://agents.example/?token=x",
        "https://agents.example/#x",
    ])("should reject unsafe homeserver URL %s", (url) => {
        expect(() => parseConfig({ homeserver_url: url })).toThrow();
    });
});
