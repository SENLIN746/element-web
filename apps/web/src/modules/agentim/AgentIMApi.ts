/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { Method } from "matrix-js-sdk/src/matrix";
import type { AgentIMApi as IAgentIMApi, AgentIMMethod } from "@element-hq/element-web-module-api";

import { MatrixClientPeg } from "../../MatrixClientPeg";
import { findDMForUser } from "../../utils/dm/findDMForUser";
import createRoom from "../../createRoom";
import { requireUserId, validateAgentIMPath } from "./paths";
import { requireAgentIMHomeserver } from "./homeserver";
import { mutateContact } from "./ContactMutations";
import SdkConfig from "../../SdkConfig";

/** AgentIM extension calls stay attached to the currently authenticated Matrix client. */
export class AgentIMApi implements IAgentIMApi {
    public async request(
        method: AgentIMMethod,
        path: string,
        query: Readonly<Record<string, string>> = {},
        body?: unknown,
    ): Promise<unknown> {
        validateAgentIMPath(method, path, query);
        if (method === "GET" && body !== undefined) throw new Error("AgentIM GET cannot carry a request body");
        const serialized = body === undefined ? undefined : JSON.stringify(body);
        if (serialized !== undefined && new TextEncoder().encode(serialized).byteLength > 32768) {
            throw new Error("AgentIM request exceeds its byte budget");
        }
        const snapshot: unknown = serialized === undefined ? undefined : JSON.parse(serialized);
        if (snapshot !== undefined && (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot))) {
            throw new Error("AgentIM request body must be a JSON object");
        }
        const client = MatrixClientPeg.safeGet();
        requireAgentIMHomeserver(SdkConfig.get(), client.getHomeserverUrl());
        const assertActive = (): void => {
            if (MatrixClientPeg.get() !== client) throw new Error("Matrix identity changed");
        };
        const operation = async (): Promise<unknown> => {
            try {
                assertActive();
                const response = await client.http.authedRequest<unknown>(
                    method as Method,
                    path,
                    { ...query },
                    snapshot,
                    {
                        prefix: path.startsWith("/account/")
                            ? "/_synapse/client/agentim/v2"
                            : "/_synapse/client/agentim/v1",
                    },
                );
                assertActive();
                return response;
            } catch {
                // MatrixError retains request/response diagnostics. Keep them inside the host.
                throw new Error("AgentIM request was rejected or could not be completed");
            }
        };
        return method === "PUT" && path.startsWith("/contacts/")
            ? mutateContact(client, path, snapshot, operation, assertActive)
            : operation();
    }

    public async openDirect(userId: string): Promise<string> {
        requireUserId(userId);
        const client = MatrixClientPeg.safeGet();
        requireAgentIMHomeserver(SdkConfig.get(), client.getHomeserverUrl());
        const existing = findDMForUser(client, userId);
        if (existing?.hasEncryptionStateEvent()) return existing.roomId;
        try {
            const roomId = await createRoom(client, {
                dmUserId: userId,
                encryption: true,
                inlineErrors: true,
                andView: false,
                spinner: false,
            });
            if (!roomId || MatrixClientPeg.get() !== client) throw new Error("No conversation was created");
            return roomId;
        } catch {
            throw new Error("The Agent conversation could not be opened");
        }
    }
}
