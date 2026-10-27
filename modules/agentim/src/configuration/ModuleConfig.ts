/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

declare module "@element-hq/element-web-module-api" {
    interface Config {
        "im.agentim"?: unknown;
    }
}

/** Configuration scoped to the AgentIM runtime module. It never contains credentials. */
export interface ModuleConfig {
    readonly homeserverUrl: string;
    readonly serverName?: string;
    readonly siteUrl?: string;
}

export const CONFIG_KEY = "im.agentim";

/** Pin authentication to the explicitly configured homeserver origin. */
export function parseConfig(raw: unknown): ModuleConfig | null {
    if (raw === undefined || raw === null || raw === false) return null;
    if (typeof raw !== "object" || !("homeserver_url" in raw) || typeof raw.homeserver_url !== "string")
        throw new Error("AgentIM requires a homeserver URL");
    const url = new URL(raw.homeserver_url);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/")
        throw new Error("AgentIM homeserver must be an origin");
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
        throw new Error("AgentIM requires HTTPS outside loopback");
    let serverName: string | undefined;
    if ("server_name" in raw) {
        if (typeof raw.server_name !== "string" || !/^[a-z0-9.\-:[\]]{1,255}$/i.test(raw.server_name))
            throw new Error("AgentIM identity server name is invalid");
        const identity = new URL(`https://${raw.server_name}`);
        if (!identity.hostname) throw new Error("AgentIM identity server name is invalid");
        serverName = raw.server_name;
    }
    let siteUrl: string | undefined;
    if ("site_url" in raw) {
        if (typeof raw.site_url !== "string") throw new Error("Invalid AgentIM site URL");
        const parsed = parseConfig({ homeserver_url: raw.site_url });
        siteUrl = parsed?.homeserverUrl;
    }
    return { homeserverUrl: url.origin, ...(serverName ? { serverName } : {}), ...(siteUrl ? { siteUrl } : {}) };
}
