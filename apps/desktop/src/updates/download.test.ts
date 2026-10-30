/*
Copyright 2026 alljoy
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

import { downloadUpdate } from "./download.js";
import { type DesktopUpdate } from "./manifest.js";

const roots: string[] = [];
afterEach(async () => {
    vi.unstubAllGlobals();
    for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const bytes = Buffer.from("synthetic installer bytes");
const update: DesktopUpdate = {
    version: "1.12.33-agentim.1",
    platform: "win32",
    arch: "x64",
    format: "exe",
    url: "https://agents.example/downloads/desktop/agentim.exe",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    published_at: "2026-10-31T00:00:00Z",
    notes: "Preview",
};
async function directory(): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "agentim-update-"));
    roots.push(root);
    return root;
}

it("downloads exact verified bytes, reuses only a matching cache, and never follows redirects", async () => {
    const root = await directory();
    const fetcher = vi.fn(async () => new Response(bytes));
    vi.stubGlobal("fetch", fetcher);
    const file = await downloadUpdate(update, root, AbortSignal.timeout(1000));
    expect(await readFile(file)).toEqual(bytes);
    expect(fetcher).toHaveBeenCalledWith(update.url, expect.objectContaining({ redirect: "error" }));
    await downloadUpdate(update, root, AbortSignal.timeout(1000));
    expect(fetcher).toHaveBeenCalledTimes(1);
});

it("leaves no partial installer on size or checksum failures", async () => {
    const root = await directory();
    for (const payload of [Buffer.from("bad"), Buffer.alloc(update.bytes, 1), Buffer.alloc(update.bytes + 1)]) {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(payload)),
        );
        await expect(downloadUpdate(update, root, AbortSignal.timeout(1000))).rejects.toThrow();
        expect(await readdir(root)).toEqual([]);
    }
});

it("refuses linked caches without modifying the external file", async () => {
    const root = await directory();
    const external = path.join(root, "external");
    await writeFile(external, bytes);
    const destination = path.join(root, `AgentIM-${update.platform}-${update.arch}-${update.version}.${update.format}`);
    await symlink(external, destination);
    await expect(downloadUpdate(update, root, AbortSignal.timeout(1000))).rejects.toThrow("regular");
    expect(await readFile(external)).toEqual(bytes);
});
