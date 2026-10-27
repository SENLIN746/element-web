/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { AgentIMApi } from "@element-hq/element-web-module-api";
import { decode } from "../../protocol/validation";
import type { AgentProfile, ProfileUpdate } from "../../protocol/models";

/** Profile operations use the authenticated host bridge and canonical profile data. */
export class ProfileService {
    public constructor(private readonly api: AgentIMApi) {}
    public async own(): Promise<AgentProfile> {
        return decode("AgentProfile", await this.api.request("GET", "/profiles/me"));
    }
    public async read(userId: string): Promise<AgentProfile> {
        return decode("AgentProfile", await this.api.request("GET", `/profiles/${encodeURIComponent(userId)}`));
    }
    public async update(profile: ProfileUpdate): Promise<AgentProfile> {
        return decode(
            "AgentProfile",
            await this.api.request("PUT", "/profiles/me", {}, decode("ProfileUpdate", profile)),
        );
    }
}
