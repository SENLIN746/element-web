/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Method, type MatrixClient } from "matrix-js-sdk/src/matrix";

const queues = new WeakMap<MatrixClient, Promise<unknown>>();

/** Contact consent succeeded, but standard Matrix ignore state needs an explicit retry. */
export class NativeIgnoreProjectionError extends Error {
    public constructor() {
        super("Contact policy changed, but Matrix ignore synchronization failed");
        this.name = "AgentIMIgnoreProjectionError";
    }
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function projectIgnore(
    client: MatrixClient,
    userId: string,
    ignored: boolean,
    assertActive: () => void,
): Promise<void> {
    const ownId = client.getUserId();
    if (!ownId || ownId === userId) throw new Error("Invalid native ignore target");
    const path = `/user/${encodeURIComponent(ownId)}/account_data/m.ignored_user_list`;
    const options = { prefix: "/_matrix/client/v3" };
    let content: unknown;
    try {
        // These SDK account-data helpers can use or short-circuit on stale sync cache, so use fixed network calls.
        content = await client.http.authedRequest<unknown>(Method.Get, path, undefined, undefined, options);
    } catch (error) {
        if (!record(error) || !record(error.data) || error.data.errcode !== "M_NOT_FOUND") throw error;
        content = {};
    }
    assertActive();
    if (!record(content) || (content.ignored_users !== undefined && !record(content.ignored_users))) {
        throw new Error("Invalid native ignored-user content");
    }
    const ignoredUsers = { ...(record(content.ignored_users) ? content.ignored_users : {}) };
    if (ignored) ignoredUsers[userId] = {};
    else delete ignoredUsers[userId];
    // Account data is last-write-wins across devices; the fresh read preserves unrelated entries known to the server.
    await client.http.authedRequest(Method.Put, path, undefined, { ...content, ignored_users: ignoredUsers }, options);
    assertActive();
}

/** Serialize all contact decisions for this device and project block/unblock onto native Matrix ignore state. */
export function mutateContact<T>(
    client: MatrixClient,
    path: string,
    body: unknown,
    operation: () => Promise<T>,
    assertActive: () => void,
): Promise<T> {
    const result = (queues.get(client) ?? Promise.resolve()).then(async () => {
        assertActive();
        const response = await operation();
        if (record(body) && (body.action === "block" || body.action === "unblock")) {
            try {
                await projectIgnore(
                    client,
                    decodeURIComponent(path.slice("/contacts/".length)),
                    body.action === "block",
                    assertActive,
                );
            } catch {
                throw new NativeIgnoreProjectionError();
            }
        }
        return response;
    });
    queues.set(
        client,
        result.then(
            () => undefined,
            () => undefined,
        ),
    );
    return result;
}
