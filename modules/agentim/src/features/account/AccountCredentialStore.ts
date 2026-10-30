/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { AccountAuthInfo } from "@element-hq/element-web-module-api";
import type { AccountCredentialFile } from "../../protocol/models";

export interface CredentialRecord {
    key: string;
    credential: AccountCredentialFile;
    verified: boolean;
}
export interface AccountLoginAttempt {
    key: string;
    attemptId: string;
    deviceId: string;
    account?: AccountAuthInfo;
}

/** IndexedDB stores are private browser state, never a substitute for a saved account credential. */
export class AccountCredentialStore {
    private async database(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open("agentim-account-access", 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore("credentials", { keyPath: "key" });
                request.result.createObjectStore("logins", { keyPath: "key" });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error("Private account storage is unavailable"));
        });
    }
    public async get<T extends CredentialRecord | AccountLoginAttempt>(
        store: "credentials" | "logins",
        key: string,
    ): Promise<T | undefined> {
        const db = await this.database();
        try {
            return await new Promise((resolve, reject) => {
                const request = db.transaction(store).objectStore(store).get(key);
                request.onsuccess = () => resolve(request.result as T | undefined);
                request.onerror = () => reject(new Error("Cannot read private account state"));
            });
        } finally {
            db.close();
        }
    }
    public async allLogins(): Promise<AccountLoginAttempt[]> {
        const db = await this.database();
        try {
            return await new Promise((resolve, reject) => {
                const request = db.transaction("logins").objectStore("logins").getAll();
                request.onsuccess = () => resolve(request.result as AccountLoginAttempt[]);
                request.onerror = () => reject(new Error("Cannot read private device attempts"));
            });
        } finally {
            db.close();
        }
    }
    public async save(
        store: "credentials" | "logins",
        value: CredentialRecord | AccountLoginAttempt,
        create = false,
    ): Promise<void> {
        const db = await this.database();
        try {
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(store, "readwrite", { durability: "strict" });
                if (create) tx.objectStore(store).add(value);
                else tx.objectStore(store).put(value);
                tx.oncomplete = () => resolve();
                tx.onabort = tx.onerror = () => reject(new Error("Cannot save private account state"));
            });
        } finally {
            db.close();
        }
    }
    public removeLogin(key: string): Promise<void> {
        return this.remove("logins", key);
    }
    public removeCredential(key: string): Promise<void> {
        return this.remove("credentials", key);
    }
    private async remove(store: "credentials" | "logins", key: string): Promise<void> {
        const db = await this.database();
        try {
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(store, "readwrite", { durability: "strict" });
                tx.objectStore(store).delete(key);
                tx.oncomplete = () => resolve();
                tx.onabort = tx.onerror = () => reject(new Error("Cannot complete private account state"));
            });
        } finally {
            db.close();
        }
    }
}
