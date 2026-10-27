/*
Copyright 2026 Element Creations Ltd.
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { expect, describe, it, beforeEach, vi } from "vitest";
import { fs as memfs, vol } from "memfs";
import EventEmitter from "node:events";
import { app } from "electron";

import ProtocolHandler from "./protocol.js";

const TEST_PROTOCOL = "test.proto";
const TEST_SESSION_ID = "test_session_id";
const USER_DATA_DIR = "/Users/name/Library/Application Support/Element";

vi.mock("node:fs", () => ({ default: memfs }));
vi.mock("electron", () => {
    const emitter = new EventEmitter();

    return {
        app: {
            isPackaged: true,
            getPath: vi.fn().mockReturnValue("/Users/name/Library/Application Support/Element"),
            getAppPath: vi.fn().mockReturnValue("/bin/element-desktop"),
            setAsDefaultProtocolClient: vi.fn(),
            on: emitter.on.bind(emitter),
            emit: emitter.emit.bind(emitter),
            removeAllListeners: emitter.removeAllListeners.bind(emitter),
        },
        ipcMain: {
            handle: vi.fn(),
        },
    };
});

beforeEach(() => {
    // Reset the state of the in-memory fs
    vol.reset();
    // Clear the event emitter
    app.removeAllListeners();
    vi.clearAllMocks();
});

describe("ProtocolHandler", () => {
    beforeEach(() => {
        vol.fromJSON(
            {
                "./sso-sessions.json": JSON.stringify({ [TEST_SESSION_ID]: USER_DATA_DIR }),
            },
            USER_DATA_DIR,
        );
    });

    describe("getProfileFromDeeplink", () => {
        const handler = new ProtocolHandler(TEST_PROTOCOL);

        it("should handle legacy SSO URIs", () => {
            expect(
                handler.getProfileFromDeeplink([
                    "Element.app",
                    `element://vector/webapp/?element-desktop-ssoid=${TEST_SESSION_ID}`,
                ]),
            ).toBe(USER_DATA_DIR);
        });

        it("should handle OIDC URIs with response_mode=query", () => {
            expect(
                handler.getProfileFromDeeplink([
                    "Element.app",
                    `${TEST_PROTOCOL}:/vector/webapp/?no_universal_links=true&code=DEADBEEF&state=foobar:element-desktop-ssoid:${TEST_SESSION_ID}`,
                ]),
            ).toBe(USER_DATA_DIR);
        });

        it("should handle OIDC URIs with response_mode=fragment", () => {
            expect(
                handler.getProfileFromDeeplink([
                    "Element.app",
                    `${TEST_PROTOCOL}:/vector/webapp/?no_universal_links=true#code=DEADBEEF&state=foobar:element-desktop-ssoid:${TEST_SESSION_ID}`,
                ]),
            ).toBe(USER_DATA_DIR);
        });

        it("should handle malformed OIDC URIs gracefully", () => {
            expect(
                handler.getProfileFromDeeplink([
                    "Element.app",
                    `${TEST_PROTOCOL}:/vector/webapp/?no_universal_links=true#code=DEADBEEF:element-desktop-ssoid:${TEST_SESSION_ID}`,
                ]),
            ).toBeUndefined();
        });

        it("should handle unrelated URIs gracefully", () => {
            expect(handler.getProfileFromDeeplink(["Element.app", `${TEST_PROTOCOL}:/vector/webapp/`])).toBeUndefined();
            expect(handler.getProfileFromDeeplink(["Element.app", `test.unrelated:/vector/webapp/`])).toBeUndefined();
        });
    });

    it.each(["darwin", "linux", "win32"] as const)("should handle deeplink on %s", (platform) => {
        vi.spyOn(process, "platform", "get").mockReturnValue(platform);
        vi.stubGlobal("mainWindow", {
            loadURL: vi.fn(),
        });

        const handler = new ProtocolHandler(TEST_PROTOCOL);
        expect(handler).toBeTruthy();

        const incomingUri = "test.proto:/#/room/#matrix:matrix.org";
        const expectedUri = "vector://vector/webapp/#/room/#matrix:matrix.org";

        if (platform === "darwin") {
            app.emit("open-url", new Event("test"), incomingUri);
        } else {
            app.emit("second-instance", new Event("test"), ["/path/to/app", incomingUri]);
        }

        expect(global.mainWindow!.loadURL).toHaveBeenCalledWith(expectedUri);
    });

    it("should safely deal with wrong protocol deeplinks", () => {
        vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
        vi.stubGlobal("mainWindow", {
            loadURL: vi.fn(),
        });

        const handler = new ProtocolHandler(TEST_PROTOCOL);
        expect(handler).toBeTruthy();

        app.emit("open-url", new Event("test"), "random.proto:/#/room/#matrix:matrix.org");

        expect(global.mainWindow!.loadURL).not.toHaveBeenCalled();
    });

    describe("initialise", () => {
        beforeEach(() => {
            vi.spyOn(process, "execPath", "get").mockReturnValue("/bin/element-desktop");
        });

        it.each(["io.element.desktop", "io.element.nightly"])(
            "should retain Element registration for %s",
            (protocol) => {
                const handler = new ProtocolHandler(protocol);
                handler.initialise({
                    userDataPath: USER_DATA_DIR,
                    devtools: false,
                    update: false,
                    hidden: false,
                    positional: ["/bin/element-desktop"],
                });

                const args = ["--no-update"];
                expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith(protocol, "/bin/element-desktop", args);
                expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith("element", "/bin/element-desktop", args);
            },
        );

        it("should register only the independent AgentIM scheme during a normal launch", () => {
            const handler = new ProtocolHandler("agentim");
            handler.initialise({
                userDataPath: "/private/agentim-profile",
                devtools: false,
                update: false,
                hidden: false,
                positional: ["/bin/element-desktop"],
            });

            expect(app.setAsDefaultProtocolClient).toHaveBeenCalledExactlyOnceWith("agentim", "/bin/element-desktop", [
                "--no-update",
                "--profile-dir",
                "/private/agentim-profile",
            ]);
        });

        it("should handle deeplink", () => {
            vi.stubGlobal("mainWindow", {
                loadURL: vi.fn(),
            });

            const handler = new ProtocolHandler(TEST_PROTOCOL);
            handler.initialise({
                userDataPath: "/data",
                devtools: false,
                update: false,
                hidden: false,
                positional: ["/bin/element-desktop", "test.proto:/#/room/#matrix:matrix.org"],
            });

            expect(global.mainWindow!.loadURL).toHaveBeenCalledWith("vector://vector/webapp/#/room/#matrix:matrix.org");
        });

        it("should not register OS handlers when explicitly disabled", () => {
            const handler = new ProtocolHandler(TEST_PROTOCOL);
            expect(app.getPath).not.toHaveBeenCalled();
            handler.initialise({
                userDataPath: "/private/agentim-profile",
                devtools: false,
                update: false,
                protocolRegistration: false,
                hidden: false,
                positional: ["/bin/element-desktop"],
            });

            expect(app.setAsDefaultProtocolClient).not.toHaveBeenCalled();
            expect(app.getPath).not.toHaveBeenCalled();
        });

        it("should keep SSO session writes in the final profile without importing default sessions", () => {
            const defaultStorePath = USER_DATA_DIR + "/sso-sessions.json";
            const original = memfs.readFileSync(defaultStorePath, "utf8");
            const privateDir = "/private/agentim-profile";
            vol.fromJSON({ "./sso-sessions.json": JSON.stringify({ privateSession: privateDir }) }, privateDir);
            const handler = new ProtocolHandler(TEST_PROTOCOL);
            handler.initialise({
                userDataPath: privateDir,
                devtools: false,
                update: false,
                protocolRegistration: false,
                hidden: false,
                positional: ["/bin/element-desktop"],
            });

            expect(memfs.readFileSync(defaultStorePath, "utf8")).toBe(original);
            const isolated = JSON.parse(memfs.readFileSync(privateDir + "/sso-sessions.json", "utf8") as string);
            expect(Object.values(isolated)).toEqual([privateDir]);
            expect(isolated).not.toHaveProperty(TEST_SESSION_ID);
            expect(isolated).not.toHaveProperty("privateSession");
            expect(memfs.statSync(privateDir + "/sso-sessions.json").mode & 0o777).toBe(0o600);
        });
    });
});
