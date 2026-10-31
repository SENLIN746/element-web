/*
Copyright 2026 alljoy
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { app, dialog, shell } from "electron";
import path from "node:path";

import { downloadUpdate } from "./download.js";
import { type DesktopUpdate, parseUpdates, selectUpdate, updateFeed } from "./manifest.js";

/** Product updates use the same checked installer on every supported platform. */
export class ProductUpdater {
    private readonly feed: URL;
    private pending?: Promise<void>;
    private ready?: { file: string; update: DesktopUpdate };
    private readonly lifetime = new AbortController();

    public constructor(base: string) {
        this.feed = updateFeed(base);
        app.once("before-quit", () => {
            this.lifetime.abort();
        });
    }

    private status(value: boolean | string): void {
        global.mainWindow?.webContents.send("check_updates", value);
    }

    private announce(): void {
        if (!this.ready) return;
        const { update } = this.ready;
        global.mainWindow?.webContents.send("update-downloaded", {
            releaseName: update.version,
            releaseNotes: `${update.notes}\nThis update opens the system installer; finish installation there.`,
            releaseDate: new Date(update.published_at),
            updateURL: update.url,
        });
    }

    public async check(): Promise<void> {
        if (this.ready) {
            this.announce();
            return;
        }
        if (this.pending) return this.pending;
        this.pending = this.prepare()
            .catch(() => {
                this.status(
                    "AgentIM update check or download failed. Your current app and account were preserved; try again later.",
                );
            })
            .finally(() => {
                this.pending = undefined;
            });
        return this.pending;
    }

    private async prepare(): Promise<void> {
        const response = await fetch(this.feed, {
            redirect: "error",
            signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(30_000)]),
        });
        if (!response.ok || !response.body) throw new Error("Update manifest unavailable");
        let bytes = 0;
        const chunks: Uint8Array[] = [];
        for await (const chunk of response.body) {
            bytes += chunk.length;
            if (bytes > 128 * 1024) throw new Error("Update manifest is too large");
            chunks.push(chunk);
        }
        const entries = parseUpdates(JSON.parse(Buffer.concat(chunks).toString("utf8")), this.feed);
        const update = selectUpdate(entries, process.platform, process.arch, app.getVersion());
        if (!update) {
            this.status(false);
            return;
        }
        this.status(true);
        const file = await downloadUpdate(
            update,
            path.join(app.getPath("userData"), "updates"),
            AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(15 * 60_000)]),
        );
        this.ready = { file, update };
        this.announce();
    }

    public async install(): Promise<void> {
        if (!this.ready) {
            await this.check();
            return;
        }
        const { file, update } = this.ready;
        const instruction =
            update.platform === "darwin"
                ? "Open the downloaded ZIP and replace AgentIM in Applications. Your account and encrypted device data stay in the existing profile."
                : update.platform === "linux"
                  ? "Open the downloaded Debian package and install it with your system package installer. This upgrades the app and keeps your account and encrypted device data."
                  : "Open the downloaded setup program to upgrade AgentIM. Your account and encrypted device data stay in the existing profile.";
        const result = await dialog.showMessageBox({
            type: "info",
            title: "AgentIM update",
            message: `AgentIM ${update.version} is ready`,
            detail: instruction,
            buttons: ["Open update", "Later"],
            defaultId: 0,
            cancelId: 1,
        });
        if (result.response !== 0) return;
        // Check again immediately before handing the already-downloaded bytes to the OS.
        await downloadUpdate(
            update,
            path.dirname(file),
            AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(15 * 60_000)]),
        );
        const error = await shell.openPath(file);
        if (error) {
            shell.showItemInFolder(file);
            await dialog.showMessageBox({
                type: "info",
                title: "Install AgentIM update",
                message: "The verified update is ready in the opened folder.",
                detail:
                    update.platform === "linux"
                        ? `Install this .deb with your package manager, then reopen AgentIM:\n${path.basename(file)}`
                        : "Open the package to finish updating, then reopen AgentIM. Your current app and profile are intact.",
            });
            return;
        }
        // Opening a ZIP or package is not installation. Keep the current session running.
    }
}
