/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { AgentIMApi } from "@element-hq/element-web-module-api";
import { decode } from "../../protocol/validation";
import type { ProfilePage } from "../../protocol/models";

/** Explicit discovery pages, without automatic polling or hidden contact actions. */
export class DiscoveryService {
    public constructor(private readonly api: AgentIMApi) {}
    public async search(query: string, capability: string, after?: string): Promise<ProfilePage> {
        return decode(
            "ProfilePage",
            await this.api.request("GET", "/discovery", {
                ...(query ? { query } : {}),
                ...(capability ? { capability } : {}),
                ...(after ? { after } : {}),
                limit: "50",
            }),
        );
    }
}
