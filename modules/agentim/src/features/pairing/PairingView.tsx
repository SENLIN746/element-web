/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type FormEvent, type JSX } from "react";
import { Button, Form } from "@vector-im/compound-web";
import { useWatchable, type Api } from "@element-hq/element-web-module-api";
import type { PairingViewModel } from "./PairingViewModel";

/** Request an independent device; authorization remains the Agent's decision. */
export function PairingView({ api, vm, server }: { api: Api; vm: PairingViewModel; server?: string }): JSX.Element {
    const state = useWatchable(vm.state);
    const t = api.i18n.translate;
    const active = ["creating", "waiting", "connecting"].includes(state.phase);
    const submit = (event: FormEvent): void => {
        event.preventDefault();
        void vm.start();
    };
    const fingerprint = state.request
        ? JSON.stringify(
              {
                  pairing_id: state.request.pairing_id,
                  user_code: state.request.user_code,
                  code_challenge: state.request.code_challenge,
              },
              null,
              2,
          )
        : "";
    return (
        <Form.Root className="mx_AgentIMAuth_form" onSubmit={submit}>
            <Form.Field name="target">
                <Form.Label>{t("agentim_pair_target")}</Form.Label>
                <Form.TextControl
                    required
                    value={state.target}
                    disabled={active}
                    placeholder={`@research-agent:${server || "example.org"}`}
                    onChange={(event) => vm.edit(event.target.value, state.device)}
                />
            </Form.Field>
            <Form.Field name="device">
                <Form.Label>{t("agentim_pair_device")}</Form.Label>
                <Form.TextControl
                    required
                    maxLength={80}
                    value={state.device}
                    disabled={active}
                    onChange={(event) => vm.edit(state.target, event.target.value)}
                />
            </Form.Field>
            {state.phase === "waiting" && state.request && (
                <div role="status" aria-live="polite">
                    <p>{t("agentim_pair_waiting")}</p>
                    <strong className="mx_AgentIMAuth_pairCode">{state.request.user_code}</strong>
                    <p>{t("agentim_pair_context")}</p>
                    <details>
                        <summary>{t("agentim_pair_fingerprint")}</summary>
                        <pre className="mx_AgentIMAuth_fingerprint">{fingerprint}</pre>
                    </details>
                    <Button
                        type="button"
                        kind="secondary"
                        onClick={() => void navigator.clipboard.writeText(fingerprint).catch(() => {})}
                    >
                        {t("agentim_pair_copy")}
                    </Button>
                    <p>
                        {t("agentim_pair_expires")} {state.seconds}s
                    </p>
                </div>
            )}
            {["failed", "expired", "rejected"].includes(state.phase) && (
                <p role="alert">{t(`agentim_pair_${state.phase}`)}</p>
            )}
            {active ? (
                <>
                    <Button type="button" kind="primary" disabled>
                        {t(`agentim_pair_${state.phase}`)}
                    </Button>
                    {state.phase !== "connecting" && (
                        <Button type="button" kind="tertiary" onClick={vm.cancel}>
                            {t("agentim_pair_cancel")}
                        </Button>
                    )}
                </>
            ) : (
                <Button type="submit" kind="primary">
                    {t("agentim_pair_start")}
                </Button>
            )}
            <p className="mx_AgentIMAuth_boundary">{t("agentim_pair_boundary")}</p>
        </Form.Root>
    );
}
