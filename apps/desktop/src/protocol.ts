/*
Copyright 2024 New Vector Ltd.
Copyright 2020 The Matrix.org Foundation C.I.C.
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { app, ipcMain } from "electron";
import { URL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

import { type Args, getArgsForProtocolRegistration } from "./args.js";

const LEGACY_PROTOCOL = "element";
const SEARCH_PARAM = "element-desktop-ssoid";
const STORE_FILE_NAME = "sso-sessions.json";

export default class ProtocolHandler {
    private store: Record<string, string> = {};
    private readonly sessionId: string;

    public constructor(private readonly protocol: string) {
        if (process.platform === "darwin") {
            // Protocol handler for macos
            app.on("open-url", (ev, url) => {
                ev.preventDefault();
                this.handleDeeplink(url);
            });
        } else {
            // Protocol handler for win32/Linux
            app.on("second-instance", (ev, commandLine) => {
                const url = commandLine.at(-1);
                if (url && this.checkArgIsUrl(url)) {
                    this.handleDeeplink(url);
                }
            });
        }

        this.sessionId = randomUUID();

        ipcMain.handle("getProtocol", this.onGetProtocol);
    }

    private checkArgIsUrl = (arg: string): boolean => {
        return arg.startsWith(`${this.protocol}:/`) || arg.startsWith(`${LEGACY_PROTOCOL}://`);
    };

    private setAsDefaultProtocolClient(parsedArgs: Args): void {
        const args = getArgsForProtocolRegistration(parsedArgs);
        const protocols = [this.protocol];
        // The compatibility scheme belongs to upstream Element, not independently branded applications.
        if (this.protocol === "io.element.desktop" || this.protocol === "io.element.nightly") {
            protocols.push(LEGACY_PROTOCOL);
        }
        for (const protocol of protocols) {
            if (app.isPackaged) {
                app.setAsDefaultProtocolClient(protocol, process.execPath, args);
            } else if (process.platform === "win32") {
                // On Mac/Linux this would open the Electron binary rather than this application.
                app.setAsDefaultProtocolClient(protocol, process.execPath, [app.getAppPath(), ...args]);
            }
        }
    }

    private readonly onGetProtocol = (): { protocol: string; sessionId: string } => {
        return {
            protocol: this.protocol,
            sessionId: this.sessionId,
        };
    };

    private handleDeeplink(url: string): boolean {
        if (!global.mainWindow) return false;

        const parsed = new URL(url);
        // sanity check: we only register for the one protocol, so we shouldn't
        // be getting anything else unless the user is forcing a URL to open
        // with the Element app.
        if (parsed.protocol !== `${this.protocol}:` && parsed.protocol !== `${LEGACY_PROTOCOL}:`) {
            console.log("Ignoring unexpected protocol: ", parsed.protocol);
            return false;
        }

        const urlToLoad = new URL("vector://vector/webapp/");
        // ignore anything other than the search (used for SSO login redirect)
        // and the hash (for general element deep links)
        // There's no reason to allow anything else, particularly other paths,
        // since this would allow things like the internal jitsi wrapper to
        // be loaded, which would get the app stuck on that page and generally
        // be a bit strange and confusing.
        urlToLoad.search = parsed.search;
        urlToLoad.hash = parsed.hash;

        console.log("Opening URL: ", urlToLoad.href);
        void global.mainWindow.loadURL(urlToLoad.href);
        return true;
    }

    private readStore(userDataPath = app.getPath("userData")): Record<string, string> {
        try {
            const storePath = path.join(userDataPath, STORE_FILE_NAME);
            const s = fs.readFileSync(storePath, { encoding: "utf8" });
            const o = JSON.parse(s);
            return typeof o === "object" ? o : {};
        } catch (e) {
            console.warn("Unable to read protocol store, starting with empty store: ", e);
            return {};
        }
    }

    private writeStore(userDataPath: string): void {
        fs.mkdirSync(userDataPath, { recursive: true, mode: 0o700 });
        const storePath = path.join(userDataPath, STORE_FILE_NAME);
        fs.writeFileSync(storePath, JSON.stringify(this.store), { mode: 0o600 });
        fs.chmodSync(storePath, 0o600);
    }

    /**
     * Initialises the ProtocolHandler
     * Registers the app as the default protocol client for deeplink handling.
     * Handles any deeplink passed in via args on app start.
     * Must be called after mainWindow is set up and any initial navigation is fired.
     * @returns whether a deeplink was present in args and navigated to.
     */
    public initialise(args: Args): boolean {
        if (args.protocolRegistration !== false) {
            this.setAsDefaultProtocolClient(args);
        }
        // Main applies the final profile after constructing this handler. Read and write only that profile.
        this.store = this.readStore(args.userDataPath);

        const url = args.positional.find(this.checkArgIsUrl);
        const hasDeeplink = url ? this.handleDeeplink(url) : false;

        for (const key in this.store) {
            // ensure each instance only has one (the latest) session ID to prevent the file growing unbounded
            if (this.store[key] === args.userDataPath) {
                delete this.store[key];
                break;
            }
        }
        this.store[this.sessionId] = args.userDataPath;
        this.writeStore(args.userDataPath);

        return hasDeeplink;
    }

    public getProfileFromDeeplink(args: string[]): string | undefined {
        // check if we are passed a profile in the SSO callback url
        const deeplinkUrl = args.find(
            (arg) => arg.startsWith(`${this.protocol}:/`) || arg.startsWith(`${LEGACY_PROTOCOL}://`),
        );
        if (deeplinkUrl?.includes(SEARCH_PARAM)) {
            const parsedUrl = new URL(deeplinkUrl);
            if (parsedUrl.protocol === `${this.protocol}:` || parsedUrl.protocol === `${LEGACY_PROTOCOL}:`) {
                const store = this.readStore();
                let sessionId = parsedUrl.searchParams.get(SEARCH_PARAM);
                if (!sessionId) {
                    // In OIDC, we must shuttle the value in the `state` param rather than `element-desktop-ssoid`
                    // We encode it as a suffix like `:element-desktop-ssoid:XXYYZZ`.
                    // The OIDC flow may have used response_mode=fragment or query, so we need to handle both cases.
                    let searchParams = parsedUrl.searchParams;
                    if (parsedUrl.hash.includes("=")) {
                        const [params] = parsedUrl.hash.substring(1).split("?", 2);
                        searchParams = new URLSearchParams(params);
                    }

                    const state = searchParams.get("state");
                    if (state) {
                        sessionId = state.split(`:${SEARCH_PARAM}:`)[1];
                    }
                }

                if (!sessionId) {
                    console.warn("Unable to read session ID in deeplink url:", deeplinkUrl);
                    return undefined;
                }

                console.log("Forwarding to profile:", store[sessionId]);
                return store[sessionId];
            }
        }
    }
}
