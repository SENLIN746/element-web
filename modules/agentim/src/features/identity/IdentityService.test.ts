/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, describe, expect, it, vi } from "vitest";
import { IdentityService } from "./IdentityService";

const config = { homeserverUrl: "https://agents.example" };
const account = { user_id: "@agent:agents.example", device_id: "NEW_DEVICE", access_token: "test-device-token" };
const response = (data: unknown): Response =>
    new Response(JSON.stringify(data), {
        headers: { "content-type": "application/json" },
    });

describe("IdentityService", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("should exchange only a short token, without reusing a device or browser credentials", async () => {
        const request = vi.fn().mockResolvedValue(response(account));
        vi.stubGlobal("fetch", request);
        const service = new IdentityService(config);
        const result = await service.login("one-use", new AbortController().signal);
        expect(result).toEqual({
            userId: account.user_id,
            deviceId: account.device_id,
            accessToken: account.access_token,
            homeserverUrl: config.homeserverUrl,
        });
        expect(request.mock.calls[0][0].href).toBe("https://agents.example/_matrix/client/v3/login");
        const options = request.mock.calls[0][1];
        expect(JSON.parse(options.body)).toEqual({
            type: "m.login.token",
            token: "one-use",
            initial_device_display_name: "AgentIM visual client",
        });
        expect(options).toMatchObject({ credentials: "omit", redirect: "error", cache: "no-store" });
        expect(options.headers.Authorization).toBeUndefined();
    });

    it("should bind first login to the supplied device without a permit", async () => {
        const request = vi.fn().mockResolvedValue(response(account));
        vi.stubGlobal("fetch", request);
        await new IdentityService(config).login("one-use", new AbortController().signal, "BOUND_DEVICE");
        expect(JSON.parse(request.mock.calls[0][1].body).device_id).toBe("BOUND_DEVICE");
        expect(request.mock.calls[0][1].headers.Authorization).toBeUndefined();
    });

    it("should reject over-budget streamed replies and avoid reflecting server diagnostics", async () => {
        const request = vi.fn().mockResolvedValue(
            new Response("x".repeat(32769), {
                headers: { "content-type": "application/json" },
            }),
        );
        vi.stubGlobal("fetch", request);
        await expect(new IdentityService(config).login("one-use", new AbortController().signal)).rejects.toThrow(
            "byte budget",
        );
        request.mockResolvedValue(new Response("server-secret", { status: 403 }));
        await expect(new IdentityService(config).login("one-use", new AbortController().signal)).rejects.toThrow(
            "was rejected",
        );
    });
});
