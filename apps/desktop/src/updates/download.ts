/*
Copyright 2026 alljoy
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";

import { type DesktopUpdate } from "./manifest.js";

async function matches(file: string, update: DesktopUpdate): Promise<boolean> {
    const metadata = await lstat(file).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
    });
    if (!metadata) return false;
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Update cache must contain regular files");
    if (metadata.size !== update.bytes) return false;
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(file)) digest.update(chunk);
    return digest.digest("hex") === update.sha256;
}

export async function downloadUpdate(update: DesktopUpdate, directory: string, signal: AbortSignal): Promise<string> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const metadata = await lstat(directory);
    if (metadata.isSymbolicLink() || !metadata.isDirectory())
        throw new Error("Update directory must be private and regular");
    await chmod(directory, 0o700);
    const filename = `AgentIM-${update.platform}-${update.arch}-${update.version}.${update.format}`;
    const destination = path.join(directory, filename);
    if (await matches(destination, update)) return destination;
    const temporary = path.join(directory, ".download-" + randomUUID());
    const handle = await open(temporary, "wx", 0o600);
    try {
        const response = await fetch(update.url, { redirect: "error", signal });
        if (!response.ok || !response.body) throw new Error("Desktop update download failed");
        const length = response.headers.get("content-length");
        if (length !== null && Number(length) !== update.bytes) throw new Error("Update download size differs");
        const digest = createHash("sha256");
        let received = 0;
        for await (const chunk of response.body) {
            received += chunk.length;
            if (received > update.bytes) throw new Error("Update exceeds its declared size");
            digest.update(chunk);
            await handle.writeFile(chunk);
        }
        if (received !== update.bytes || digest.digest("hex") !== update.sha256)
            throw new Error("Update checksum differs");
        await handle.sync();
        await handle.close();
        await rename(temporary, destination);
        return destination;
    } finally {
        await handle.close();
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
        });
    }
}
