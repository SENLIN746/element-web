/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/** Methods accepted by the AgentIM homeserver extension bridge.
 * @public
 */
export type AgentIMMethod = "GET" | "PUT" | "POST";

/** Bounded AgentIM operations using the active Matrix identity without exposing its credentials.
 * @public
 */
export interface AgentIMApi {
    /** Call a relative AgentIM extension path; authentication remains in the host.
     * Block/unblock also update native Matrix ignore state; partial failures are explicitly retryable. */
    request(
        method: AgentIMMethod,
        path: string,
        query?: Readonly<Record<string, string>>,
        body?: unknown,
    ): Promise<unknown>;
    /** Reuse or create an encrypted standard Matrix direct conversation. */
    openDirect(userId: string): Promise<string>;
}
