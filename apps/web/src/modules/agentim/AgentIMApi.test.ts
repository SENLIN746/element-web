/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentIMApi } from "./AgentIMApi";

const mocks = vi.hoisted(() => {
    const client = { http: { authedRequest: vi.fn() }, getHomeserverUrl: () => "https://agents.example" };
    return { client, get: vi.fn((): typeof client | null => client), findDM: vi.fn(), createRoom: vi.fn() };
});
vi.mock("../../MatrixClientPeg", () => ({ MatrixClientPeg: { safeGet: () => mocks.client, get: mocks.get } }));
vi.mock("../../SdkConfig", () => ({
    default: { get: () => ({ "im.agentim": { homeserver_url: "https://agents.example" } }) },
}));
vi.mock("../../utils/dm/findDMForUser", () => ({ findDMForUser: mocks.findDM }));
vi.mock("../../createRoom", () => ({ default: mocks.createRoom }));

describe("AgentIMApi", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.get.mockReturnValue(mocks.client);
        mocks.findDM.mockReturnValue(undefined);
    });

    it("should authenticate through the host at a fixed prefix without exposing credential methods", async () => {
        const profile = { user_id: "@agent:example" };
        mocks.client.http.authedRequest.mockResolvedValue(profile);
        const api = new AgentIMApi();
        expect(await api.request("GET", "/profiles/me")).toEqual(profile);
        expect(mocks.client.http.authedRequest).toHaveBeenCalledWith("GET", "/profiles/me", {}, undefined, {
            prefix: "/_synapse/client/agentim/v1",
        });
        expect("getAccessToken" in api).toBe(false);
    });

    it("should reject bodies on GET and oversized writes before the HTTP layer", async () => {
        const api = new AgentIMApi();
        await expect(api.request("GET", "/profiles/me", {}, {})).rejects.toThrow();
        await expect(api.request("PUT", "/profiles/me", {}, { description: "x".repeat(32769) })).rejects.toThrow();
        expect(mocks.client.http.authedRequest).not.toHaveBeenCalled();
    });

    it("should sanitize Matrix errors and drop replies from a previous client", async () => {
        const api = new AgentIMApi();
        mocks.client.http.authedRequest.mockRejectedValue({
            message: "credential-secret",
            data: { access_token: "secret" },
        });
        await expect(api.request("GET", "/profiles/me")).rejects.toThrow("AgentIM request was rejected");
        const pending = Promise.withResolvers<unknown>();
        mocks.client.http.authedRequest.mockReturnValue(pending.promise);
        const operation = api.request("GET", "/profiles/me");
        mocks.get.mockReturnValue(null);
        pending.resolve({ user_id: "@previous:example" });
        await expect(operation).rejects.toThrow("AgentIM request was rejected");
    });

    it("should reuse only encrypted direct rooms, otherwise create a standard encrypted DM", async () => {
        const api = new AgentIMApi();
        mocks.findDM.mockReturnValue({ roomId: "!plain:example", hasEncryptionStateEvent: () => false });
        mocks.createRoom.mockResolvedValue("!new-encrypted:example");
        expect(await api.openDirect("@peer:example")).toBe("!new-encrypted:example");
        expect(mocks.createRoom).toHaveBeenCalledWith(
            mocks.client,
            expect.objectContaining({ dmUserId: "@peer:example", encryption: true, andView: false }),
        );
        mocks.findDM.mockReturnValue({ roomId: "!existing:example", hasEncryptionStateEvent: () => true });
        expect(await api.openDirect("@peer:example")).toBe("!existing:example");
        expect(mocks.createRoom).toHaveBeenCalledTimes(1);
    });
});
