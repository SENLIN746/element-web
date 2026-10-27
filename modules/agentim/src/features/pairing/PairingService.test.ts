/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { IdentityService } from "../identity/IdentityService";
import { PairingService } from "./PairingService";

const response = (value: unknown): Response =>
    new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
const id = "p".repeat(43);
const proof = "v".repeat(43);
const target = "@a:example";
const signal = (): AbortSignal => new AbortController().signal;
const service = (): PairingService =>
    new PairingService(new IdentityService({ homeserverUrl: "https://agents.example" }));

describe("Browser pairing proof exchange", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("should keep the proof in the POST body and immediately exchange the short grant", async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(
                response({ user_id: target, login_token: "synthetic-short-token", expires_in_ms: 60000 }),
            )
            .mockResolvedValueOnce(
                response({ user_id: target, device_id: "NEW", access_token: "synthetic-access-token" }),
            );
        vi.stubGlobal("fetch", fetcher);
        expect((await service().connect(id, proof, target, signal())).deviceId).toBe("NEW");
        const [url, options] = fetcher.mock.calls[0]!;
        expect(url.pathname).toBe(`/_synapse/client/agentim/v1/pairings/${id}/consume`);
        expect(url.search).toBe("");
        expect(url.href).not.toContain(proof);
        expect(JSON.parse(options.body)).toEqual({ verifier: proof });
        expect(options).toMatchObject({ credentials: "omit", cache: "no-store", redirect: "error" });
        expect(options.headers.Authorization).toBeUndefined();
        expect(fetcher.mock.calls[1]![0].pathname).toBe("/_matrix/client/v3/login");
    });

    it("should never log in with a grant for another Agent", async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValue(
                response({ user_id: "@other:example", login_token: "synthetic-short-token", expires_in_ms: 60000 }),
            );
        vi.stubGlobal("fetch", fetcher);
        await expect(service().connect(id, proof, target, signal())).rejects.toThrow("Pairing identity changed");
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("should not retry a failed consumption or reflect remote diagnostic text", async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response("synthetic-secret-diagnostic", { status: 503 }));
        vi.stubGlobal("fetch", fetcher);
        await expect(service().connect(id, proof, target, signal())).rejects.toThrow(
            "Agent identity request was rejected",
        );
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
});
