/*
Copyright 2026 alljoy
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    check: vi.fn(),
    install: vi.fn(),
    construct: vi.fn(),
    once: vi.fn(),
    ipc: vi.fn(),
    nativeCheck: vi.fn(),
    setFeed: vi.fn(),
    native: false,
}));
vi.mock("electron", () => {
    const updater = { on: vi.fn(), setFeedURL: mocks.setFeed, checkForUpdates: mocks.nativeCheck };
    updater.on.mockReturnValue(updater);
    return {
        app: { once: mocks.once, getVersion: () => "1.0.0" },
        autoUpdater: updater,
        ipcMain: { on: mocks.ipc, emit: vi.fn() },
    };
});
vi.mock("./ipc.js", () => ({ initialisePromise: Promise.resolve() }));
vi.mock("./config.js", () => ({ getConfig: () => ({ brand: "AgentIM" }) }));
vi.mock("./language-helper.js", () => ({ _t: () => "Synthetic translation" }));
vi.mock("./squirrelhooks.js", () => ({ getSquirrelExecutable: () => "/synthetic/squirrel" }));
vi.mock("./build-config.js", () => ({
    getBuildConfig: () => ({ appId: "im.agentim.desktop", nativeUpdates: mocks.native }),
}));
vi.mock("./updates/controller.js", () => ({
    ProductUpdater: class {
        public constructor() {
            mocks.construct();
        }
        public check = mocks.check;
        public install = mocks.install;
    },
}));
afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.resetModules();
    mocks.native = false;
});

it("has one scheduler for manual and periodic checks and clears both timers on quit", async () => {
    vi.useFakeTimers();
    const { start } = await import("./updater.js");
    await start("https://agents.example/downloads/desktop/");
    await start("https://agents.example/downloads/desktop/");
    expect(mocks.construct).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.check).toHaveBeenCalledOnce();
    const manualCheck = mocks.ipc.mock.calls.find(([event]) => event === "check_updates")![1];
    await manualCheck();
    expect(mocks.check).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(mocks.check).toHaveBeenCalledTimes(3);
    mocks.once.mock.calls.find(([event]) => event === "before-quit")![1]();
    expect(vi.getTimerCount()).toBe(0);
    expect(mocks.nativeCheck).not.toHaveBeenCalled();
});
