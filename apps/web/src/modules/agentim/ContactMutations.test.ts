/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";
import { mutateContact, NativeIgnoreProjectionError } from "./ContactMutations";

function setup() {
    let server = { ignored_users: { "@unrelated:example": {} } };
    const request = vi.fn(async (method: string, _path: string, _query: unknown, body: unknown): Promise<unknown> => {
        if (method === "GET") return structuredClone(server);
        server = structuredClone(body) as typeof server;
        return {};
    });
    const client = { getUserId: () => "@self:example", http: { authedRequest: request } } as unknown as MatrixClient;
    return { client, request, read: () => server };
}

describe("AgentIM native ignore projection", () => {
    it("should serialize rapid block/unblock and preserve unrelated ignored entries with fresh network reads", async () => {
        const { client, request, read } = setup();
        const decide = vi.fn().mockResolvedValue({ user_id: "@peer:example" });
        const active = vi.fn();
        const blocking = mutateContact(client, "/contacts/%40peer%3Aexample", { action: "block" }, decide, active);
        const unblocking = mutateContact(client, "/contacts/%40peer%3Aexample", { action: "unblock" }, decide, active);
        await Promise.all([blocking, unblocking]);
        expect(request.mock.calls.map(([method]) => method)).toEqual(["GET", "PUT", "GET", "PUT"]);
        expect(request.mock.calls[1][3]).toEqual({ ignored_users: { "@unrelated:example": {}, "@peer:example": {} } });
        expect(read()).toEqual({ ignored_users: { "@unrelated:example": {} } });
        expect(request).toHaveBeenCalledWith(
            "GET",
            "/user/%40self%3Aexample/account_data/m.ignored_user_list",
            undefined,
            undefined,
            { prefix: "/_matrix/client/v3" },
        );
    });

    it("should surface a safe partial failure after consent succeeds, and permit a later retry", async () => {
        const { client, request } = setup();
        const decide = vi.fn().mockResolvedValue({ blocked: true });
        request.mockRejectedValueOnce(new Error("credential-secret"));
        await expect(
            mutateContact(client, "/contacts/%40peer%3Aexample", { action: "block" }, decide, () => {}),
        ).rejects.toEqual(new NativeIgnoreProjectionError());
        expect(decide).toHaveBeenCalledTimes(1);
        await expect(
            mutateContact(client, "/contacts/%40peer%3Aexample", { action: "block" }, decide, () => {}),
        ).resolves.toEqual({ blocked: true });
    });

    it("should not project rejected consent and should discard operations queued for an old identity", async () => {
        const { client, request } = setup();
        const decide = vi.fn().mockRejectedValue(new Error("rejected"));
        await expect(
            mutateContact(client, "/contacts/%40peer%3Aexample", { action: "block" }, decide, () => {}),
        ).rejects.toThrow("rejected");
        expect(request).not.toHaveBeenCalled();
        const next = vi.fn();
        await expect(
            mutateContact(client, "/contacts/%40peer%3Aexample", { action: "block" }, next, () => {
                throw new Error("identity changed");
            }),
        ).rejects.toThrow("identity changed");
        expect(next).not.toHaveBeenCalled();
    });

    it("should initialize only a missing ignore list and reject malformed existing data", async () => {
        const { client, request } = setup();
        request.mockRejectedValueOnce({ data: { errcode: "M_NOT_FOUND" } });
        await mutateContact(
            client,
            "/contacts/%40peer%3Aexample",
            { action: "block" },
            async () => true,
            () => {},
        );
        expect(request.mock.calls[1][3]).toEqual({ ignored_users: { "@peer:example": {} } });
        request.mockResolvedValueOnce({ ignored_users: [] });
        await expect(
            mutateContact(
                client,
                "/contacts/%40peer%3Aexample",
                { action: "unblock" },
                async () => true,
                () => {},
            ),
        ).rejects.toBeInstanceOf(NativeIgnoreProjectionError);
    });
});
