/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/
// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach, afterEach, type MockedObject } from "vitest";
import { MatrixEvent, Room } from "matrix-js-sdk/src/matrix";
import { waitFor } from "test-utils-rtl";
import "vitest-canvas-mock";
import ElectronPlatform from "./ElectronPlatform";

vi.mock("../../rageshake/rageshake", () => ({ flush: vi.fn() }));

describe("Electron native capabilities", () => {
    const initialiseValues = vi.fn();
    const mockElectron = {
        on: vi.fn(),
        send: vi.fn(),
        initialise: initialiseValues,
    } as unknown as MockedObject<Electron>;
    const userId = "@alice:server.org";
    const requestPermission = vi.fn();
    beforeEach(() => {
        vi.clearAllMocks();
        window.electron = mockElectron;
        initialiseValues.mockReturnValue({
            protocol: "im.agentim.desktop",
            sessionId: "session",
            config: {},
            supportsBadgeOverlay: false,
        });
        const notification = Object.assign(vi.fn(), { permission: "granted", requestPermission });
        vi.stubGlobal("Notification", notification);
        requestPermission.mockResolvedValue("granted");
    });
    afterEach(() => vi.unstubAllGlobals());
    describe("notifications", () => {
        it("indicates support for notifications", () => {
            const platform = new ElectronPlatform();
            expect(platform.supportsNotifications()).toBe(true);
        });

        it("may send notifications", () => {
            const platform = new ElectronPlatform();
            expect(platform.maySendNotifications()).toBe(true);
        });

        it("requests notification permission through Chromium", async () => {
            const platform = new ElectronPlatform();
            const result = await platform.requestNotificationPermission();
            expect(result).toEqual("granted");
            expect(requestPermission).toHaveBeenCalledOnce();
        });

        it("creates a loud notification", async () => {
            const platform = new ElectronPlatform();
            platform.loudNotification(new MatrixEvent(), new Room("!room:server", {} as any, userId));
            expect(mockElectron.send).toHaveBeenCalledWith("loudNotification");
        });

        it("sets notification count when count is changing", async () => {
            const platform = new ElectronPlatform();
            platform.setNotificationCount(0);
            // not called because matches internal notificaiton count
            expect(mockElectron.send).not.toHaveBeenCalledWith("setBadgeCount", 0);
            platform.setNotificationCount(1);
            expect(mockElectron.send).toHaveBeenCalledWith("setBadgeCount", 1);
        });
    });

    describe("spellcheck", () => {
        it("indicates support for spellcheck settings", () => {
            const platform = new ElectronPlatform();
            expect(platform.supportsSpellCheckSettings()).toBe(true);
        });

        it("gets available spellcheck languages", () => {
            const platform = new ElectronPlatform();
            mockElectron.send.mockClear();
            platform.getAvailableSpellCheckLanguages();

            const [channel, { name }] = mockElectron.send.mock.calls[0];
            expect(channel).toEqual("ipcCall");
            expect(name).toEqual("getAvailableSpellCheckLanguages");
        });
    });

    describe("Notification overlay badges", () => {
        beforeEach(() => {
            initialiseValues.mockReturnValue({
                protocol: "io.element.desktop",
                sessionId: "session-id",
                config: { _config: true },
                supportsBadgeOverlay: true,
            });
        });

        afterEach(() => {
            vi.clearAllMocks();
        });

        it("should send a badge with a notification count", async () => {
            const platform = new ElectronPlatform();
            await platform.initialised;
            platform.setNotificationCount(1);
            // Badges are sent asynchronously
            await waitFor(() => {
                const ipcMessage = mockElectron.send.mock.lastCall;
                expect(ipcMessage?.[1]).toEqual(1);
                expect(ipcMessage?.[2].constructor.name).toEqual("ArrayBuffer");
            });
        });

        it("should update badge and skip duplicates", async () => {
            const platform = new ElectronPlatform();
            await platform.initialised;
            platform.setNotificationCount(1);
            platform.setNotificationCount(1); // Test that duplicates do not fire.
            platform.setNotificationCount(2);
            // Badges are sent asynchronously
            await waitFor(() => {
                const [ipcMessageA, ipcMessageB] = mockElectron.send.mock.calls.filter(
                    (call) => call[0] === "setBadgeCount",
                );

                expect(ipcMessageA?.[1]).toEqual(1);
                expect(ipcMessageA?.[2].constructor.name).toEqual("ArrayBuffer");

                expect(ipcMessageB?.[1]).toEqual(2);
                expect(ipcMessageB?.[2].constructor.name).toEqual("ArrayBuffer");
            });
        });
        it("should remove badge when notification count zeros", async () => {
            const platform = new ElectronPlatform();
            await platform.initialised;
            platform.setNotificationCount(1);
            platform.setNotificationCount(0); // Test that duplicates do not fire.
            // Badges are sent asynchronously
            await waitFor(() => {
                const [ipcMessageB, ipcMessageA] = mockElectron.send.mock.calls.filter(
                    (call) => call[0] === "setBadgeCount",
                );

                expect(ipcMessageA?.[1]).toEqual(1);
                expect(ipcMessageA?.[2].constructor.name).toEqual("ArrayBuffer");

                expect(ipcMessageB?.[1]).toEqual(0);
                expect(ipcMessageB?.[2]).toBeNull();
            });
        });
        it("should show an error badge when the application errors", async () => {
            const platform = new ElectronPlatform();
            await platform.initialised;
            platform.setErrorStatus(true);
            // Badges are sent asynchronously
            await waitFor(() => {
                const ipcMessage = mockElectron.send.mock.calls.find((call) => call[0] === "setBadgeCount");

                expect(ipcMessage?.[1]).toEqual(0);
                expect(ipcMessage?.[2].constructor.name).toEqual("ArrayBuffer");
                expect(ipcMessage?.[3]).toEqual(true);
            });
        });
        it("should restore after error is resolved", async () => {
            const platform = new ElectronPlatform();
            await platform.initialised;
            platform.setErrorStatus(true);
            platform.setErrorStatus(false);
            // Badges are sent asynchronously
            await waitFor(() => {
                const [ipcMessageB, ipcMessageA] = mockElectron.send.mock.calls.filter(
                    (call) => call[0] === "setBadgeCount",
                );

                expect(ipcMessageA?.[1]).toEqual(0);
                expect(ipcMessageA?.[2].constructor.name).toEqual("ArrayBuffer");
                expect(ipcMessageA?.[3]).toEqual(true);

                expect(ipcMessageB?.[1]).toEqual(0);
                expect(ipcMessageB?.[2]).toBeNull();
            });
        });
    });
    it("does not report permission while Chromium denies it", async () => {
        Object.defineProperty(window.Notification, "permission", { value: "denied", configurable: true });
        requestPermission.mockResolvedValue("denied");
        const platform = new ElectronPlatform();
        expect(platform.maySendNotifications()).toBe(false);
        expect(await platform.requestNotificationPermission()).toBe("denied");
    });
    it("honors native unsupported status and does not request permission", async () => {
        initialiseValues.mockReturnValue({
            protocol: "im.agentim.desktop",
            config: {},
            supportsNativeNotifications: false,
        });
        const platform = new ElectronPlatform();
        await platform.initialised;
        expect(platform.supportsNotifications()).toBe(false);
        expect(platform.maySendNotifications()).toBe(false);
        expect(await platform.requestNotificationPermission()).toBe("denied");
        expect(requestPermission).not.toHaveBeenCalled();
    });
    it("does not claim support if the Notification API is unavailable", async () => {
        vi.stubGlobal("Notification", undefined);
        const platform = new ElectronPlatform();
        expect(platform.supportsNotifications()).toBe(false);
        expect(await platform.requestNotificationPermission()).toBe("denied");
    });
});
