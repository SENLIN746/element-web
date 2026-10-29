/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { AccountAuthInfo } from "@element-hq/element-web-module-api";

export interface BrowserAttempt {
    key: string;
    localpart: string;
    homeserver: string;
    attemptId: string;
    verifier: string;
    deviceId: string;
    account?: AccountAuthInfo;
}

/** Private bootstrap journal. It is never exported to a URL, UI snapshot or log. */
export class OnboardingStore {
    private async database(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open("agentim-onboarding", 1);
            request.onupgradeneeded = () => request.result.createObjectStore("attempts", { keyPath: "key" });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error("Cannot open private registration storage"));
        });
    }

    public async all(): Promise<BrowserAttempt[]> {
        const db = await this.database();
        try {
            return await new Promise((resolve, reject) => {
                const request = db.transaction("attempts").objectStore("attempts").getAll();
                request.onsuccess = () => resolve(request.result as BrowserAttempt[]);
                request.onerror = () => reject(new Error("Cannot read registration state"));
            });
        } finally {
            db.close();
        }
    }

    public async save(value: BrowserAttempt, create = false): Promise<void> {
        const db = await this.database();
        try {
            await new Promise<void>((resolve, reject) => {
                const transaction = db.transaction("attempts", "readwrite", { durability: "strict" });
                const store = transaction.objectStore("attempts");
                if (create) store.add(value);
                else store.put(value);
                transaction.oncomplete = () => resolve();
                transaction.onabort = () => reject(new Error("Cannot persist private registration state"));
                transaction.onerror = () => reject(new Error("Cannot persist private registration state"));
            });
        } finally {
            db.close();
        }
        window.dispatchEvent(new Event("agentim-onboarding-changed"));
    }

    public async remove(key: string): Promise<void> {
        const db = await this.database();
        try {
            await new Promise<void>((resolve, reject) => {
                const transaction = db.transaction("attempts", "readwrite", { durability: "strict" });
                transaction.objectStore("attempts").delete(key);
                transaction.oncomplete = () => resolve();
                transaction.onabort = () => reject(new Error("Cannot finish registration state"));
            });
        } finally {
            db.close();
        }
    }
}
