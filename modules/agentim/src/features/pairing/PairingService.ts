/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { AccountAuthInfo } from "@element-hq/element-web-module-api";
import type { IdentityService } from "../identity/IdentityService";
import type { PairingRequest } from "../../protocol/models";
import { decode } from "../../protocol/validation";

const PATH = "/_synapse/client/agentim/v1/pairings";

/** Browser proof is sent only in POST bodies to the configured homeserver. */
export class PairingService {
    public constructor(private readonly identity: IdentityService) {}

    public async create(
        target: string,
        device: string,
        challenge: string,
        signal: AbortSignal,
    ): Promise<PairingRequest> {
        const origin = window.location.protocol === "vector:" ? "vector://vector" : window.location.origin;
        const body = decode("PairingCreateRequest", {
            target_user_id: target,
            device_name: device,
            client_origin: origin,
            code_challenge: challenge,
        });
        return decode("PairingRequest", await this.identity.post(PATH, body, signal));
    }

    public async status(id: string, verifier: string, signal: AbortSignal): Promise<PairingRequest> {
        return decode(
            "PairingRequest",
            await this.identity.post(`${PATH}/${encodeURIComponent(id)}/status`, { verifier }, signal),
        );
    }

    public async cancel(id: string, verifier: string, signal: AbortSignal): Promise<void> {
        await this.identity.post(`${PATH}/${encodeURIComponent(id)}/cancel`, { verifier }, signal);
    }

    public async connect(id: string, verifier: string, target: string, signal: AbortSignal): Promise<AccountAuthInfo> {
        const grant = decode(
            "PairingTokenResponse",
            await this.identity.post(`${PATH}/${encodeURIComponent(id)}/consume`, { verifier }, signal),
        );
        if (grant.user_id !== target) throw new Error("Pairing identity changed");
        return this.identity.login(grant.login_token, signal);
    }
}
