/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type Room, type MatrixEvent } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import BasePlatform from "../../BasePlatform";
import { IPCManager } from "./IPCManager";

/** Adapts Element's platform APIs to Electron without replacing its notification renderer. */
export abstract class ElectronNativePlatform extends BasePlatform {
    protected readonly ipc = new IPCManager("ipcCall", "ipcReply");
    protected readonly electron: Electron;
    private nativeNotificationsSupported?: boolean;

    public constructor() {
        super();
        if (!window.electron) throw new Error("Cannot instantiate ElectronPlatform, window.electron is not set");
        this.electron = window.electron;
    }

    protected setNativeNotificationSupport(supported?: boolean): void {
        this.nativeNotificationsSupported = supported;
    }

    public supportsSpellCheckSettings(): boolean {
        return true;
    }

    public allowOverridingNativeContextMenus(): boolean {
        return true;
    }

    public supportsNotifications(): boolean {
        return this.nativeNotificationsSupported !== false && typeof window.Notification === "function";
    }

    public maySendNotifications(): boolean {
        return this.supportsNotifications() && window.Notification.permission === "granted";
    }

    public displayNotification(
        title: string,
        msg: string,
        avatarUrl: string,
        room: Room,
        ev?: MatrixEvent,
    ): Notification {
        // GNOME notification spec parses HTML tags for styling...
        // Electron Docs state all supported linux notification systems follow this markup spec
        // https://github.com/electron/electron/blob/master/docs/tutorial/desktop-environment-integration.md#linux
        // maybe we should pass basic styling (italics, bold, underline) through from MD
        // we only have to strip out < and > as the spec doesn't include anything about things like &amp;
        // so we shouldn't assume that all implementations will treat those properly. Very basic tag parsing is done.
        if (navigator.userAgent.includes("Linux")) {
            msg = msg.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }

        const notification = super.displayNotification(title, msg, avatarUrl, room, ev);

        const handler = notification.onclick as () => void;
        notification.onclick = (): void => {
            handler?.();
            void this.ipc.call("focusWindow");
        };

        return notification;
    }

    public loudNotification(ev: MatrixEvent, room: Room): void {
        this.electron.send("loudNotification");
    }

    public needsUrlTooltips(): boolean {
        return true;
    }

    public requestNotificationPermission(): Promise<string> {
        if (!this.supportsNotifications()) return Promise.resolve("denied");
        return window.Notification.requestPermission();
    }

    public reload(): void {
        window.location.reload();
    }

    public async setLanguage(preferredLangs: string[]): Promise<void> {
        await this.ipc.call("setLanguage", preferredLangs);
    }

    public setSpellCheckEnabled(enabled: boolean): void {
        this.ipc.call("setSpellCheckEnabled", enabled).catch((error) => {
            logger.log("Failed to send setSpellCheckEnabled IPC to Electron");
            logger.error(error);
        });
    }

    public async getSpellCheckEnabled(): Promise<boolean> {
        return this.ipc.call("getSpellCheckEnabled");
    }

    public setSpellCheckLanguages(preferredLangs: string[]): void {
        this.ipc.call("setSpellCheckLanguages", preferredLangs).catch((error) => {
            logger.log("Failed to send setSpellCheckLanguages IPC to Electron");
            logger.error(error);
        });
    }

    public async getSpellCheckLanguages(): Promise<string[]> {
        return this.ipc.call("getSpellCheckLanguages");
    }

    public async getDesktopCapturerSources(options: GetSourcesOptions): Promise<Array<DesktopCapturerSource>> {
        return this.ipc.call("getDesktopCapturerSources", options);
    }

    public supportsDesktopCapturer(): boolean {
        return true;
    }

    public supportsJitsiScreensharing(): boolean {
        // See https://github.com/element-hq/element-web/issues/4880
        return false;
    }

    public async getAvailableSpellCheckLanguages(): Promise<string[]> {
        return this.ipc.call("getAvailableSpellCheckLanguages");
    }

    public navigateForwardBack(back: boolean): void {
        void this.ipc.call(back ? "navigateBack" : "navigateForward");
    }

    public overrideBrowserShortcuts(): boolean {
        return true;
    }
}
