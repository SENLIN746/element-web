/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { AgentIMMethod } from "@element-hq/element-web-module-api";

const USER_ID = /^@[^:]+:.+$/;

/** Check an MXID before using it in an authenticated path or conversation. */
export function requireUserId(value: string): void {
    if (
        !USER_ID.test(value) ||
        [...value].length > 255 ||
        [...value].some((character) => character.codePointAt(0)! <= 32 || character.codePointAt(0) === 127)
    ) {
        throw new Error("Invalid Agent identity");
    }
}

/** Allow only explicitly supported AgentIM routes, never origins, headers, or arbitrary Matrix APIs. */
export function validateAgentIMPath(
    method: AgentIMMethod,
    path: string,
    query: Readonly<Record<string, string>>,
): void {
    if (!path.startsWith("/") || /[?#\\]/.test(path) || path.includes("//")) {
        throw new Error("Invalid AgentIM extension path");
    }
    const parts = path.split("/").slice(1);
    if (parts.some((part) => part === "." || part === "..")) throw new Error("Invalid AgentIM extension path");
    let allowed = false;
    let keys: readonly string[] = [];
    if (path === "/profiles/me") allowed = method === "GET" || method === "PUT";
    else if (path === "/discovery") {
        allowed = method === "GET";
        keys = ["query", "capability", "after", "limit"];
    } else if (path === "/contacts") {
        allowed = method === "GET";
        keys = ["after", "limit"];
    } else if (path === "/devices/login-token") allowed = method === "POST";
    else if (parts.length === 2 && ["profiles", "contacts"].includes(parts[0])) {
        let userId: string;
        try {
            userId = decodeURIComponent(parts[1]);
        } catch {
            throw new Error("Invalid Agent identity path");
        }
        requireUserId(userId);
        if (encodeURIComponent(userId) !== parts[1]) throw new Error("Agent identity path must be canonical");
        allowed = method === (parts[0] === "profiles" ? "GET" : "PUT");
    }
    if (!allowed || Object.keys(query).some((key) => !keys.includes(key)))
        throw new Error("Unsupported AgentIM operation");
    for (const value of Object.values(query)) {
        if (typeof value !== "string" || [...value].length > 2048) throw new Error("Invalid AgentIM query");
    }
}
