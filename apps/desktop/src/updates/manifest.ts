/*
Copyright 2026 alljoy
SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export interface DesktopUpdate {
    version: string;
    platform: "darwin" | "win32" | "linux";
    arch: "x64" | "arm64";
    format: "zip" | "exe" | "deb";
    url: string;
    sha256: string;
    bytes: number;
    published_at: string;
    notes: string;
}

const versionPattern =
    /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})(?:-([a-zA-Z0-9]+(?:[.-][a-zA-Z0-9]+)*))?$/;

function validVersion(value: string): boolean {
    if (value.length > 80 || !versionPattern.test(value)) return false;
    return !versionPattern
        .exec(value)?.[4]
        ?.split(".")
        .some((part) => /^0\d+$/.test(part));
}

export function compareVersions(left: string, right: string): number {
    const a = versionPattern.exec(left);
    const b = versionPattern.exec(right);
    if (!a || !b || !validVersion(left) || !validVersion(right)) throw new Error("Invalid Desktop version");
    for (let i = 1; i <= 3; i++) {
        const difference = Number(a[i]) - Number(b[i]);
        if (difference) return Math.sign(difference);
    }
    if (!a[4] || !b[4]) return a[4] ? -1 : b[4] ? 1 : 0;
    const first = a[4].split(".");
    const second = b[4].split(".");
    for (let i = 0; i < Math.max(first.length, second.length); i++) {
        if (first[i] === second[i]) continue;
        if (first[i] === undefined) return -1;
        if (second[i] === undefined) return 1;
        const numericA = /^\d+$/.test(first[i]);
        const numericB = /^\d+$/.test(second[i]);
        if (numericA !== numericB) return numericA ? -1 : 1;
        if (numericA) {
            const x = BigInt(first[i]);
            const y = BigInt(second[i]);
            if (x !== y) return x > y ? 1 : -1;
        } else return first[i] > second[i] ? 1 : -1;
    }
    return 0;
}

export function updateFeed(base: string): URL {
    const url = new URL(base);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
        throw new Error("Desktop updates require a plain HTTPS origin");
    }
    if (url.pathname !== "/downloads/desktop/") throw new Error("Invalid Desktop update path");
    return new URL("updates.json", url);
}

export function parseUpdates(value: unknown, feed: URL): DesktopUpdate[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid update manifest");
    const root = value as Record<string, unknown>;
    if (
        Object.keys(root).sort().join() !== "entries,product,version" ||
        root.version !== 1 ||
        root.product !== "AgentIM" ||
        !Array.isArray(root.entries) ||
        root.entries.length > 32
    ) {
        throw new Error("Invalid update manifest");
    }
    const identities = new Set<string>();
    return root.entries.map((entry: unknown) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Invalid update entry");
        const item = entry as DesktopUpdate;
        if (
            Object.keys(item).sort().join() !== "arch,bytes,format,notes,platform,published_at,sha256,url,version" ||
            typeof item.version !== "string" ||
            !validVersion(item.version) ||
            !["darwin", "win32", "linux"].includes(item.platform) ||
            !["x64", "arm64"].includes(item.arch) ||
            item.format !== ({ darwin: "zip", win32: "exe", linux: "deb" } as const)[item.platform] ||
            !Number.isSafeInteger(item.bytes) ||
            item.bytes < 1 ||
            item.bytes > 2 * 1024 ** 3 ||
            typeof item.sha256 !== "string" ||
            !/^[a-f0-9]{64}$/.test(item.sha256) ||
            typeof item.published_at !== "string" ||
            !Number.isFinite(Date.parse(item.published_at)) ||
            typeof item.notes !== "string" ||
            item.notes.length > 2000 ||
            typeof item.url !== "string"
        ) {
            throw new Error("Invalid update entry");
        }
        const url = new URL(item.url, feed);
        if (
            url.origin !== feed.origin ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            !/^\/downloads\/desktop\/[a-zA-Z0-9_.-]+$/.test(url.pathname) ||
            !url.pathname.endsWith("." + item.format)
        ) {
            throw new Error("Update artifact is outside its trusted origin");
        }
        const key = item.platform + "/" + item.arch;
        if (identities.has(key)) throw new Error("Duplicate Desktop update platform");
        identities.add(key);
        return { ...item, url: url.href };
    });
}

export function selectUpdate(
    entries: DesktopUpdate[],
    platform: string,
    arch: string,
    current: string,
): DesktopUpdate | undefined {
    return entries.find(
        (item) => item.platform === platform && item.arch === arch && compareVersions(item.version, current) > 0,
    );
}
