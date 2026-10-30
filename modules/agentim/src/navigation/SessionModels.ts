/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { CredentialBackupViewModel } from "../features/account/CredentialBackupViewModel";
import type { ProfileViewModel } from "../features/profiles/ProfileViewModel";
import type { DiscoveryViewModel } from "../features/discovery/DiscoveryViewModel";
import type { ContactsViewModel } from "../features/contacts/ContactsViewModel";
import type { DevicesViewModel } from "../features/devices/DevicesViewModel";

/** Agent sections share models but each location can select its own initial section. */
export type SessionTab = "profile" | "discovery" | "contacts" | "devices";

/** Feature models scoped to one mounted native identity panel. */
export interface SessionModels {
    profile: ProfileViewModel;
    discovery: DiscoveryViewModel;
    contacts: ContactsViewModel;
    devices: DevicesViewModel;
    credential?: CredentialBackupViewModel;
}
