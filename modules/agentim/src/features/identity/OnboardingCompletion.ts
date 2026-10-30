/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import type { Api } from "@element-hq/element-web-module-api";
import type { AccountCredentialService } from "../account/AccountCredentialService";
import type { OnboardingService } from "./OnboardingService";

/** Finish durable bootstrap after Element has persisted and started its crypto session. */
export function startOnboardingCompletion(
    api: Api,
    service: OnboardingService,
    credentials?: AccountCredentialService,
): void {
    let running = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const resume = async (): Promise<void> => {
        if (running) return;
        running = true;
        clearTimeout(retry);
        try {
            await service.completeWhenReady(api);
            await credentials?.completeWhenReady(api);
        } catch {
            // Preserve the proof and device. Never log credentials or reset on transient failure.
            retry = setTimeout(() => void resume(), 10000);
        } finally {
            running = false;
        }
    };
    window.addEventListener("agentim-onboarding-changed", () => void resume());
    void resume();
}
