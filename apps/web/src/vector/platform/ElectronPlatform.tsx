/*
Copyright 2024-2025 New Vector Ltd.
Copyright 2022 Šimon Brandner <simon.bra.ag@gmail.com>
Copyright 2018-2021 New Vector Ltd
Copyright 2019 Michael Telatynski <7t3chguy@gmail.com>
Copyright 2016 Aviral Dasgupta
Copyright 2016 OpenMarket Ltd

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { type MatrixClient, type OAuthRegistrationRequest } from "matrix-js-sdk/src/matrix";
import React from "react";
import { logger } from "matrix-js-sdk/src/logger";
import { uniqueId } from "lodash";

import { UpdateCheckStatus, type UpdateStatus } from "../../BasePlatform";
import type BaseEventIndexManager from "../../indexing/BaseEventIndexManager";
import dis from "../../dispatcher/dispatcher";
import SdkConfig from "../../SdkConfig";
import { type IConfigOptions } from "../../IConfigOptions";
import * as rageshake from "../../rageshake/rageshake";
import Modal from "../../Modal";
import InfoDialog from "../../components/views/dialogs/InfoDialog";
import Spinner from "../../components/views/elements/Spinner";
import { Action } from "../../dispatcher/actions";
import { type ActionPayload } from "../../dispatcher/payloads";
import { showToast as showUpdateToast } from "../../toasts/UpdateToast";
import { type CheckUpdatesPayload } from "../../dispatcher/payloads/CheckUpdatesPayload";
import ToastStore from "../../stores/ToastStore";
import GenericExpiringToast from "../../components/views/toasts/GenericExpiringToast";
import { BreadcrumbsStore } from "../../stores/BreadcrumbsStore";
import { UPDATE_EVENT } from "../../stores/AsyncStore";
import { avatarUrlForRoom, getInitialLetter } from "../../Avatar";
import DesktopCapturerSourcePicker from "../../components/views/elements/DesktopCapturerSourcePicker";
import { MatrixClientPeg } from "../../MatrixClientPeg";
import { SeshatIndexManager } from "./SeshatIndexManager";
import { ElectronNativePlatform } from "./ElectronNativePlatform";
import { _t } from "../../languageHandler";
import { BadgeOverlayRenderer } from "../../favicon";
import { GenericToast } from "@element-hq/web-shared-components";

interface SquirrelUpdate {
    releaseNotes: string;
    releaseName: string;
    releaseDate: Date;
    updateURL: string;
}

const SSO_ID_KEY = "element-desktop-ssoid";

function platformFriendlyName(): string {
    // used to use window.process but the same info is available here
    if (navigator.userAgent.includes("Macintosh")) {
        return "macOS";
    } else if (navigator.userAgent.includes("FreeBSD")) {
        return "FreeBSD";
    } else if (navigator.userAgent.includes("OpenBSD")) {
        return "OpenBSD";
    } else if (navigator.userAgent.includes("SunOS")) {
        return "SunOS";
    } else if (navigator.userAgent.includes("Windows")) {
        return "Windows";
    } else if (navigator.userAgent.includes("Linux")) {
        return "Linux";
    } else {
        return "Unknown";
    }
}

function getUpdateCheckStatus(status: boolean | string): UpdateStatus {
    if (status === true) {
        return { status: UpdateCheckStatus.Downloading };
    } else if (status === false) {
        return { status: UpdateCheckStatus.NotAvailable };
    } else {
        return {
            status: UpdateCheckStatus.Error,
            detail: status,
        };
    }
}

export default class ElectronPlatform extends ElectronNativePlatform {
    private readonly eventIndexManager: BaseEventIndexManager = new SeshatIndexManager();
    public readonly initialised: Promise<void>;
    private protocol!: string;
    private sessionId!: string;
    private badgeOverlayRenderer?: BadgeOverlayRenderer;
    private config!: IConfigOptions;
    private supportedSettings?: Record<string, boolean>;
    private clientStartedPromiseWithResolvers = Promise.withResolvers<void>();

    public constructor() {
        super();

        /*
            IPC Call `check_updates` returns:
            true if there is an update available
            false if there is not
            or the error if one is encountered
         */
        this.electron.on("check_updates", (event, status) => {
            dis.dispatch<CheckUpdatesPayload>({
                action: Action.CheckUpdates,
                ...getUpdateCheckStatus(status),
            });
        });

        // `userAccessToken` (IPC) is requested by the main process when appending authentication
        // to media downloads. A reply is sent over the same channel.
        this.electron.on("userAccessToken", () => {
            this.electron.send("userAccessToken", MatrixClientPeg.get()?.getAccessToken());
        });

        // `homeserverUrl` (IPC) is requested by the main process. A reply is sent over the same channel.
        this.electron.on("homeserverUrl", () => {
            this.electron.send("homeserverUrl", MatrixClientPeg.get()?.getHomeserverUrl());
        });

        // `serverSupportedVersions` is requested by the main process when it needs to know if the
        // server supports a particular version. This is primarily used to detect authenticated media
        // support. A reply is sent over the same channel.
        this.electron.on("serverSupportedVersions", async () => {
            this.electron.send("serverSupportedVersions", await MatrixClientPeg.get()?.getVersions());
        });

        // try to flush the rageshake logs to indexeddb before quit.
        this.electron.on("before-quit", function () {
            logger.log("element-desktop closing");
            rageshake.flush();
        });

        this.electron.on("update-downloaded", this.onUpdateDownloaded);

        this.electron.on("preferences", () => {
            dis.fire(Action.ViewUserSettings);
        });

        this.electron.on("userDownloadCompleted", (ev, { id, name }) => {
            const key = `DOWNLOAD_TOAST_${id}`;

            const onAccept = (): void => {
                this.electron.send("userDownloadAction", { id, open: true });
                ToastStore.sharedInstance().dismissToast(key);
            };

            const onDismiss = (): void => {
                this.electron.send("userDownloadAction", { id });
            };

            ToastStore.sharedInstance().addOrReplaceToast({
                key,
                title: _t("download_completed"),
                props: {
                    description: name,
                    primaryLabel: _t("action|open"),
                    onPrimaryClick: onAccept,
                    dismissLabel: _t("action|dismiss"),
                    onDismiss,
                    numSeconds: 10,
                },
                component: GenericExpiringToast,
                priority: 99,
            });
        });

        this.electron.on("openDesktopCapturerSourcePicker", async () => {
            const { finished } = Modal.createDialog(DesktopCapturerSourcePicker);
            const [source] = await finished;
            // getDisplayMedia promise does not return if no dummy is passed here as source
            await this.ipc.call("callDisplayMediaCallback", source ?? { id: "", name: "", thumbnailURL: "" });
        });

        this.electron.on("showToast", async (ev, { title, description, priority = 40 }) => {
            await this.clientStartedPromiseWithResolvers.promise;

            const key = uniqueId("electron_showToast_");
            const onPrimaryClick = (): void => {
                ToastStore.sharedInstance().dismissToast(key);
            };

            ToastStore.sharedInstance().addOrReplaceToast({
                key,
                title,
                props: {
                    description,
                    primaryLabel: _t("action|dismiss"),
                    onPrimaryClick,
                },
                component: GenericToast,
                priority,
            });
        });

        BreadcrumbsStore.instance.on(UPDATE_EVENT, this.onBreadcrumbsUpdate);

        this.initialised = this.initialise();
    }

    protected onAction(payload: ActionPayload): void {
        super.onAction(payload);
        // Whitelist payload actions, no point sending most across
        if (["call_state"].includes(payload.action)) {
            this.electron.send("app_onAction", payload);
        }

        if (payload.action === Action.ClientStarted) {
            this.clientStartedPromiseWithResolvers.resolve();
        }
    }

    private async initialise(): Promise<void> {
        const { protocol, sessionId, config, supportedSettings, supportsBadgeOverlay, supportsNativeNotifications } =
            await this.electron.initialise();
        this.setNativeNotificationSupport(supportsNativeNotifications);
        this.protocol = protocol;
        this.sessionId = sessionId;
        this.config = config;
        this.supportedSettings = supportedSettings;
        if (supportsBadgeOverlay) {
            this.badgeOverlayRenderer = new BadgeOverlayRenderer();
        }
    }

    public async getConfig(): Promise<IConfigOptions | undefined> {
        await this.initialised;
        return this.config;
    }

    private onBreadcrumbsUpdate = (): void => {
        const rooms = BreadcrumbsStore.instance.rooms.slice(0, 7).map((r) => ({
            roomId: r.roomId,
            avatarUrl: avatarUrlForRoom(
                r,
                Math.floor(60 * window.devicePixelRatio),
                Math.floor(60 * window.devicePixelRatio),
                "crop",
            ),
            initial: getInitialLetter(r.name),
        }));
        void this.ipc.call("breadcrumbs", rooms);
    };

    private onUpdateDownloaded = async (ev: Event, { releaseNotes, releaseName }: SquirrelUpdate): Promise<void> => {
        dis.dispatch<CheckUpdatesPayload>({
            action: Action.CheckUpdates,
            status: UpdateCheckStatus.Ready,
        });
        if (this.shouldShowUpdate(releaseName)) {
            showUpdateToast(await this.getAppVersion(), releaseName, releaseNotes);
        }
    };

    public getHumanReadableName(): string {
        return "Electron Platform"; // no translation required: only used for analytics
    }

    /**
     * Return true if platform supports multi-language
     * spell-checking, otherwise false.
     */

    public setNotificationCount(count: number): void {
        if (this.notificationCount === count) return;
        super.setNotificationCount(count);
        if (this.badgeOverlayRenderer) {
            this.badgeOverlayRenderer
                .render(count)
                .then((buffer) => {
                    this.electron.send("setBadgeCount", count, buffer);
                })
                .catch((ex) => {
                    logger.warn("Unable to generate badge overlay", ex);
                });
        } else {
            this.electron.send("setBadgeCount", count);
        }
    }

    public setErrorStatus(errorDidOccur: boolean): void {
        if (!this.badgeOverlayRenderer) {
            super.setErrorStatus(errorDidOccur);
            return;
        }
        // Check before calling super so we don't override the previous state.
        if (this.errorDidOccur !== errorDidOccur) {
            super.setErrorStatus(errorDidOccur);
            let promise: Promise<ArrayBuffer | null>;
            if (errorDidOccur) {
                promise = this.badgeOverlayRenderer.render(this.notificationCount || "×", "#f00");
            } else {
                promise = this.badgeOverlayRenderer.render(this.notificationCount);
            }
            promise
                .then((buffer) => {
                    this.electron.send("setBadgeCount", this.notificationCount, buffer, errorDidOccur);
                })
                .catch((ex) => {
                    logger.warn("Unable to generate badge overlay", ex);
                });
        }
    }

    public async getAppVersion(): Promise<string> {
        return this.ipc.call("getAppVersion");
    }

    public supportsSetting(settingName?: string): boolean {
        if (settingName === undefined) return true;
        return this.supportedSettings?.[settingName] === true;
    }

    public async getSettingValue(settingName: string): Promise<any> {
        await this.initialised;
        return this.electron.getSettingValue(settingName);
    }

    public async setSettingValue(settingName: string, value: any): Promise<void> {
        await this.initialised;
        return this.electron.setSettingValue(settingName, value);
    }

    public async canSelfUpdate(): Promise<boolean> {
        const feedUrl = await this.ipc.call("getUpdateFeedUrl");
        return Boolean(feedUrl);
    }

    public startUpdateCheck(): void {
        super.startUpdateCheck();
        this.electron.send("check_updates");
    }

    public installUpdate(): void {
        // IPC to the main process to install the update, since quitAndInstall
        // doesn't fire the before-quit event so the main process needs to know
        // it should exit.
        this.electron.send("install_update");
    }

    public getDefaultDeviceDisplayName(): string {
        const brand = SdkConfig.get().brand;
        return _t("desktop_default_device_name", {
            brand,
            platformName: platformFriendlyName(),
        });
    }

    public getEventIndexingManager(): BaseEventIndexManager | null {
        return this.eventIndexManager;
    }

    public getSSOCallbackUrl(fragmentAfterLogin?: string): URL {
        const url = super.getSSOCallbackUrl(fragmentAfterLogin);
        url.protocol = "element";
        url.searchParams.set(SSO_ID_KEY, this.sessionId);
        return url;
    }

    public startSingleSignOn(
        mxClient: MatrixClient,
        loginType: "sso" | "cas",
        fragmentAfterLogin: string,
        idpId?: string,
    ): void {
        // this will get intercepted by electron-main will-navigate
        super.startSingleSignOn(mxClient, loginType, fragmentAfterLogin, idpId);
        Modal.createDialog(InfoDialog, {
            title: _t("auth|sso_complete_in_browser_dialog_title"),
            description: <Spinner />,
        });
    }

    public async getPickleKey(userId: string, deviceId: string): Promise<string | null> {
        return (await this.ipc.call("getPickleKey", userId, deviceId)) ?? null;
    }

    public async createPickleKey(userId: string, deviceId: string): Promise<string | null> {
        try {
            return await this.ipc.call("createPickleKey", userId, deviceId);
        } catch {
            // if we can't connect to the password storage, assume there's no
            // pickle key
            return null;
        }
    }

    public async destroyPickleKey(userId: string, deviceId: string): Promise<void> {
        try {
            await this.ipc.call("destroyPickleKey", userId, deviceId);
        } catch {}
    }

    public async clearStorage(): Promise<void> {
        try {
            await super.clearStorage();
            await this.ipc.call("clearStorage");
        } catch {}
    }

    public get baseUrl(): string {
        // This configuration is element-desktop specific so the types here do not know about it
        return (SdkConfig.get() as unknown as Record<string, string>)["web_base_url"] ?? "https://app.element.io";
    }

    public get defaultOAuthClientUri(): string {
        // Default to element.io as our scheme `io.element.desktop` is within its scope on default MAS policies
        return "https://element.io";
    }

    public async getOAuthClientMetadata(): Promise<OAuthRegistrationRequest> {
        const baseMetadata = await super.getOAuthClientMetadata();
        return {
            ...baseMetadata,
            application_type: "native",
        };
    }

    public getOAuthClientState(): string {
        return `:${SSO_ID_KEY}:${this.sessionId}`;
    }

    /**
     * The URL to return to after a successful OIDC authentication
     */
    public getOAuthCallbackUrl(): URL {
        const url = super.getOAuthCallbackUrl();
        url.protocol = this.protocol;
        // Trim the double slash into a single slash to comply with https://datatracker.ietf.org/doc/html/rfc8252#section-7.1
        if (url.href.startsWith(`${url.protocol}//`)) {
            url.href = url.href.replace("://", ":/");
        }
        return url;
    }

    public checkSessionLockFree(): boolean {
        return true;
    }

    public async getSessionLock(_onNewInstance: () => Promise<void>): Promise<boolean> {
        return true;
    }
}
