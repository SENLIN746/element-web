/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Watchable, type AccountAuthInfo } from "@element-hq/element-web-module-api";
import type { PairingRequest } from "../../protocol/models";
import type { PairingService } from "./PairingService";

interface PairingState {
    target: string;
    device: string;
    phase: "idle" | "creating" | "waiting" | "connecting" | "expired" | "rejected" | "failed";
    request: PairingRequest | null;
    seconds: number;
}

function base64url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const abort = (): void => {
            clearTimeout(timer);
            reject(new Error("Pairing stopped"));
        };
        const timer = setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve();
        }, milliseconds);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
    });
}

/** A mount owns one proof, one read loop and at most one token consumption. */
export class PairingViewModel {
    public readonly state = new Watchable<PairingState>({
        target: "",
        device: "AgentIM browser",
        phase: "idle",
        request: null,
        seconds: 0,
    });
    private controller: AbortController | null = null;
    private verifier = "";
    private disposed = false;

    public constructor(
        private readonly service: PairingService,
        private readonly connected: (account: AccountAuthInfo) => void,
    ) {}

    public readonly edit = (target: string, device: string): void => {
        if (this.disposed || this.controller) return;
        this.state.value = { ...this.state.value, target, device, phase: "idle" };
    };

    public readonly start = async (): Promise<void> => {
        if (this.disposed || this.controller) return;
        const controller = new AbortController();
        this.controller = controller;
        this.state.value = { ...this.state.value, phase: "creating", request: null };
        try {
            this.verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
            const challenge = base64url(
                new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(this.verifier))),
            );
            const target = this.state.value.target.trim();
            let request = await this.service.create(
                target,
                this.state.value.device.trim(),
                challenge,
                controller.signal,
            );
            if (controller.signal.aborted) return;
            if (
                request.target_user_id !== target ||
                request.code_challenge !== challenge ||
                request.state !== "pending"
            )
                throw new Error("Invalid pairing response");
            const deadline = performance.now() + request.expires_at_ms - request.server_time_ms;
            this.state.value = { ...this.state.value, request, phase: "waiting" };
            while (!controller.signal.aborted) {
                const seconds = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
                this.state.value = { ...this.state.value, request, seconds };
                if (seconds === 0 || request.state === "expired") {
                    this.state.value = { ...this.state.value, phase: "expired" };
                    return;
                }
                if (request.state === "approved") {
                    this.state.value = { ...this.state.value, phase: "connecting" };
                    const account = await this.service.connect(
                        request.pairing_id,
                        this.verifier,
                        target,
                        controller.signal,
                    );
                    if (!controller.signal.aborted) {
                        if (account.userId !== target) throw new Error("Pairing identity changed");
                        this.connected(account);
                    }
                    return;
                }
                if (request.state !== "pending") {
                    this.state.value = {
                        ...this.state.value,
                        phase: request.state === "rejected" ? "rejected" : "failed",
                    };
                    return;
                }
                await delay(request.poll_interval_ms, controller.signal);
                request = await this.service.status(request.pairing_id, this.verifier, controller.signal);
                if (
                    request.target_user_id !== target ||
                    request.code_challenge !== challenge ||
                    request.pairing_id !== this.state.value.request?.pairing_id
                )
                    throw new Error("Pairing request changed");
            }
        } catch {
            if (!controller.signal.aborted) this.state.value = { ...this.state.value, phase: "failed" };
        } finally {
            if (this.controller === controller) {
                this.controller = null;
                this.verifier = "";
            }
        }
    };

    public readonly cancel = (): void => {
        const request = this.state.value.request;
        const proof = this.verifier;
        this.controller?.abort();
        this.controller = null;
        this.verifier = "";
        if (request && proof)
            void this.service.cancel(request.pairing_id, proof, AbortSignal.timeout(5000)).catch(() => {});
        this.state.value = { ...this.state.value, phase: "idle", request: null, seconds: 0 };
    };

    public dispose(): void {
        this.cancel();
        this.disposed = true;
    }
}
