/*
Copyright 2026 alljoy
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/
import { describe, expect, it } from "vitest";

import { compareVersions, parseUpdates, selectUpdate, updateFeed } from "./manifest.js";

const feed = updateFeed("https://agents.example/downloads/desktop/");
const entry = {
    version: "1.12.33-agentim.1",
    platform: "darwin",
    arch: "arm64",
    format: "zip",
    url: "/downloads/desktop/agentim-arm64.zip",
    sha256: "a".repeat(64),
    bytes: 100,
    published_at: "2026-10-31T00:00:00Z",
    notes: "Preview update",
};
const manifest = (entries: unknown[]) => ({ version: 1, product: "AgentIM", entries });

describe("AgentIM Desktop updates", () => {
    it("selects the actual platform and architecture without downgrading", () => {
        const entries = parseUpdates(manifest([entry]), feed);
        expect(selectUpdate(entries, "darwin", "arm64", "1.12.32")?.version).toBe(entry.version);
        expect(selectUpdate(entries, "darwin", "x64", "1.12.32")).toBeUndefined();
        expect(selectUpdate(entries, "linux", "arm64", "1.12.32")).toBeUndefined();
        expect(selectUpdate(entries, "darwin", "arm64", entry.version)).toBeUndefined();
        expect(compareVersions("1.12.33-agentim.10", "1.12.33-agentim.2")).toBe(1);
        expect(compareVersions("1.12.33", "1.12.33-agentim.2")).toBe(1);
        expect(compareVersions("1.12.33-agentim.2", "1.12.34")).toBe(-1);
    });
    it("refuses cross-origin URLs, credentials, redirects through query strings and wrong package formats", () => {
        for (const url of [
            "https://evil.example/app.zip",
            "https://user@agents.example/downloads/desktop/a.zip",
            "/downloads/desktop/../a.zip",
            "/downloads/desktop/a.zip?next=evil",
            "/downloads/desktop/a.exe",
        ]) {
            expect(() => parseUpdates(manifest([{ ...entry, url }]), feed)).toThrow();
        }
        expect(() => updateFeed("http://agents.example/downloads/desktop/")).toThrow();
    });
    it("rejects incomplete or duplicate releases and unbounded metadata", () => {
        expect(() => parseUpdates(manifest([entry, entry]), feed)).toThrow();
        for (const change of [
            { sha256: "wrong" },
            { bytes: -1 },
            { notes: "x".repeat(2001) },
            { version: "../1" },
            { platform: "other" },
            { credential: "private" },
        ]) {
            expect(() => parseUpdates(manifest([{ ...entry, ...change }]), feed)).toThrow();
        }
        expect(() => parseUpdates({ ...manifest([]), internal: true }, feed)).toThrow();
    });
});
