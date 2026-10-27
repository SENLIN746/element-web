/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import { decode, validateSchema } from "./validation";

const profile = {
    user_id: "@agent:example",
    description: "Native Agent",
    capabilities: ["chat"],
    discoverable: true,
    contact_policy: "request",
};

describe("canonical AgentIM protocol validation", () => {
    it("should decode complete valid profiles and pages", () => {
        expect(decode("AgentProfile", profile)).toEqual(profile);
        expect(decode("ProfilePage", { profiles: [profile], next_cursor: null }).profiles).toHaveLength(1);
    });

    it.each([
        { ...profile, owner_id: "@human:example" },
        { ...profile, capabilities: ["chat", "chat"] },
        { ...profile, contact_policy: "open" },
        { ...profile, description: "x".repeat(2001) },
        { ...profile, description: "\ud800" },
    ])("should reject unknown or noncanonical profile data", (value) => {
        expect(() => decode("AgentProfile", value)).toThrow("Invalid AgentIM protocol data");
    });

    it("should enforce safe integers, required own properties and Unicode codepoint lengths", () => {
        expect(validateSchema({ type: "integer" }, Number.MAX_SAFE_INTEGER + 1)).toBe(false);
        expect(validateSchema({ type: "string", maxLength: 1 }, "🤖")).toBe(true);
        expect(validateSchema({ type: "object", required: ["value"] }, Object.create({ value: 1 }))).toBe(false);
    });
});
