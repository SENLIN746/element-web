/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import { requireUserId, validateAgentIMPath } from "./paths";
import { requireAgentIMHomeserver } from "./homeserver";

const config = { "im.agentim": { homeserver_url: "https://agents.example" } };

describe("AgentIM bridge boundary", () => {
    it("should allow only known methods, query keys and canonical escaped identities", () => {
        expect(() => validateAgentIMPath("GET", "/profiles/me", {})).not.toThrow();
        expect(() => validateAgentIMPath("PUT", "/contacts/%40agent%3Aexample", {})).not.toThrow();
        expect(() => validateAgentIMPath("POST", "/devices/login-token", {})).not.toThrow();
        expect(() => validateAgentIMPath("GET", "/discovery", { capability: "chat", limit: "50" })).not.toThrow();
    });
    it("should constrain credential management to the account routes", () => {
        expect(() => validateAgentIMPath("GET", "/account/credentials", {})).not.toThrow();
        expect(() => validateAgentIMPath("POST", `/account/credentials/${"a".repeat(43)}/revoke`, {})).not.toThrow();
        expect(() => validateAgentIMPath("POST", "/account/login", {})).toThrow();
        expect(() => validateAgentIMPath("GET", "/account/credentials", { token: "forbidden" })).toThrow();
        expect(() => validateAgentIMPath("POST", "/account/credentials/../revoke", {})).toThrow();
    });
    it.each([
        "https://evil.test/profiles/me",
        "//evil.test/profiles/me",
        "/profiles/../me",
        "/profiles/me?x",
        "/profiles/%2540agent%253Aexample",
        "/_matrix/client/v3/account/whoami",
        "/devices/login-token/other",
    ])("should reject path escape %s", (path) => {
        expect(() => validateAgentIMPath("GET", path, {})).toThrow();
    });
    it("should reject method, query, identity and homeserver mismatches", () => {
        expect(() => validateAgentIMPath("POST", "/profiles/me", {})).toThrow();
        expect(() => validateAgentIMPath("GET", "/contacts", { access_token: "no" })).toThrow();
        expect(() => requireUserId("@agent:example\n")).toThrow();
        expect(() => requireAgentIMHomeserver(config, "https://agents.example/")).not.toThrow();
        expect(() => requireAgentIMHomeserver(config, "https://other.example")).toThrow();
        expect(() => requireAgentIMHomeserver({}, "https://agents.example")).toThrow();
    });
});
