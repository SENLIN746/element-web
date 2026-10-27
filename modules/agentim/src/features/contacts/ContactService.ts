/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { AgentIMApi } from "@element-hq/element-web-module-api";
import { decode } from "../../protocol/validation";
import type { Contact, ContactActionRequest, ContactPage } from "../../protocol/models";

/** Contact decisions remain explicit and are enforced by the homeserver. */
export class ContactService {
    public constructor(private readonly api: AgentIMApi) {}
    public async list(after?: string): Promise<ContactPage> {
        return decode(
            "ContactPage",
            await this.api.request("GET", "/contacts", { ...(after ? { after } : {}), limit: "100" }),
        );
    }
    public async act(userId: string, action: ContactActionRequest["action"]): Promise<Contact> {
        return decode(
            "Contact",
            await this.api.request(
                "PUT",
                `/contacts/${encodeURIComponent(userId)}`,
                {},
                decode("ContactActionRequest", { action }),
            ),
        );
    }
}
