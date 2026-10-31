/*
Copyright 2026 alljoy
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ProductUpdater } from "./controller.js";

const mocks = vi.hoisted(() => ({
    once: vi.fn(),
    quit: vi.fn(),
    send: vi.fn(),
    openPath: vi.fn(),
    showItemInFolder: vi.fn(),
    message: vi.fn(),
    download: vi.fn(),
}));
vi.mock("electron", () => ({
    app: { once: mocks.once, quit: mocks.quit, getVersion: () => "1.0.0", getPath: () => "/synthetic-profile" },
    shell: { openPath: mocks.openPath, showItemInFolder: mocks.showItemInFolder },
    dialog: { showMessageBox: mocks.message },
}));
vi.mock("./download.js", () => ({ downloadUpdate: mocks.download }));

beforeEach(() => {
    vi.clearAllMocks();
    global.mainWindow = { webContents: { send: mocks.send } } as unknown as Electron.BrowserWindow;
    mocks.message.mockResolvedValue({ response: 0 });
    mocks.openPath.mockResolvedValue("");
    mocks.download.mockResolvedValue("/synthetic-profile/updates/AgentIM.zip");
    vi.stubGlobal(
        "fetch",
        vi.fn(
            async () =>
                new Response(
                    JSON.stringify({
                        version: 1,
                        product: "AgentIM",
                        entries: [
                            {
                                version: "2.0.0",
                                platform: process.platform,
                                arch: process.arch,
                                format: ({ darwin: "zip", win32: "exe", linux: "deb" } as Record<string, string>)[
                                    process.platform
                                ],
                                url: `https://agents.example/downloads/desktop/AgentIM.${process.platform === "linux" ? "deb" : process.platform === "win32" ? "exe" : "zip"}`,
                                sha256: "a".repeat(64),
                                bytes: 100,
                                published_at: "2026-10-31T00:00:00Z",
                                notes: "Synthetic update",
                            },
                        ],
                    }),
                ),
        ),
    );
});
afterEach(() => vi.unstubAllGlobals());

it("coalesces checks and verifies again before opening without quitting the running session", async () => {
    const updater = new ProductUpdater("https://agents.example/downloads/desktop/");
    await Promise.all([updater.check(), updater.check()]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.send).toHaveBeenCalledWith(
        "update-downloaded",
        expect.objectContaining({
            releaseNotes: expect.stringContaining("system installer"),
        }),
    );
    await updater.install();
    expect(mocks.download).toHaveBeenCalledTimes(2);
    expect(mocks.openPath).toHaveBeenCalledOnce();
    expect(mocks.quit).not.toHaveBeenCalled();
});

it("keeps the current app when install is cancelled or the verified file cannot open", async () => {
    const updater = new ProductUpdater("https://agents.example/downloads/desktop/");
    await updater.check();
    mocks.message.mockResolvedValueOnce({ response: 1 });
    await updater.install();
    expect(mocks.openPath).not.toHaveBeenCalled();
    mocks.openPath.mockResolvedValue("No package installer");
    await updater.install();
    expect(mocks.showItemInFolder).toHaveBeenCalled();
    expect(mocks.quit).not.toHaveBeenCalled();
});

it("does not hand unverified bytes to the OS and permits a later retry", async () => {
    const updater = new ProductUpdater("https://agents.example/downloads/desktop/");
    mocks.download.mockRejectedValueOnce(new Error("Checksum differs"));
    await updater.check();
    expect(mocks.send).toHaveBeenCalledWith("check_updates", expect.stringContaining("preserved"));
    expect(mocks.send).not.toHaveBeenCalledWith("update-downloaded", expect.anything());
    await updater.check();
    mocks.download.mockRejectedValueOnce(new Error("Cache changed"));
    await expect(updater.install()).rejects.toThrow("Cache changed");
    expect(mocks.openPath).not.toHaveBeenCalled();
});
