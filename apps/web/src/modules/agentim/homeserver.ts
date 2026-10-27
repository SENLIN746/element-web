/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/** Require the active native Matrix client to use the configured AgentIM origin. */
export function requireAgentIMHomeserver(config: unknown, currentUrl: string): void {
    if (!config || typeof config !== "object" || !("im.agentim" in config)) {
        throw new Error("AgentIM is not configured");
    }
    const module = config["im.agentim"];
    if (
        !module ||
        typeof module !== "object" ||
        !("homeserver_url" in module) ||
        typeof module.homeserver_url !== "string"
    )
        throw new Error("AgentIM is not configured");
    try {
        const expected = new URL(module.homeserver_url);
        const current = new URL(currentUrl);
        const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(expected.hostname);
        if (
            expected.username ||
            expected.password ||
            expected.pathname !== "/" ||
            expected.search ||
            expected.hash ||
            (expected.protocol !== "https:" && !(expected.protocol === "http:" && loopback)) ||
            current.origin !== expected.origin ||
            current.username ||
            current.password ||
            current.pathname !== "/" ||
            current.search ||
            current.hash
        )
            throw new Error();
    } catch {
        throw new Error("AgentIM homeserver does not match the active Matrix client");
    }
}
