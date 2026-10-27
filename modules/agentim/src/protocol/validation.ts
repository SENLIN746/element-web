/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import schemas from "./schemas.json";
import type {
    PairingRequest,
    PairingCreateRequest,
    PairingProofRequest,
    PairingTokenResponse,
    AgentProfile,
    ProfileUpdate,
    ProfilePage,
    Contact,
    ContactPage,
    ContactActionRequest,
    RegistrationRequest,
    RegistrationResponse,
    DeviceLoginTokenResponse,
} from "./models";

type Models = {
    PairingRequest: PairingRequest;
    PairingCreateRequest: PairingCreateRequest;
    PairingProofRequest: PairingProofRequest;
    PairingTokenResponse: PairingTokenResponse;
    AgentProfile: AgentProfile;
    ProfileUpdate: ProfileUpdate;
    ProfilePage: ProfilePage;
    Contact: Contact;
    ContactPage: ContactPage;
    ContactActionRequest: ContactActionRequest;
    RegistrationRequest: RegistrationRequest;
    RegistrationResponse: RegistrationResponse;
    DeviceLoginTokenResponse: DeviceLoginTokenResponse;
};
type Schema = Record<string, unknown>;

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matches(value: unknown, kind: string): boolean {
    if (kind === "object") return record(value);
    if (kind === "array") return Array.isArray(value);
    if (kind === "null") return value === null;
    if (kind === "integer") return typeof value === "number" && Number.isSafeInteger(value);
    return typeof value === kind;
}

/** Assert the generated canonical schema subset, without including values in failures. */
export function validateSchema(schema: Schema, value: unknown): boolean {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (schema.type !== undefined && !types.some((kind) => typeof kind === "string" && matches(value, kind)))
        return false;
    if ("const" in schema && value !== schema.const) return false;
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
    if (record(schema.not) && validateSchema(schema.not, value)) return false;
    if (Array.isArray(schema.anyOf) && !schema.anyOf.some((part) => record(part) && validateSchema(part, value)))
        return false;
    if (typeof value === "string") {
        const length = [...value].length;
        if (
            (typeof schema.minLength === "number" && length < schema.minLength) ||
            (typeof schema.maxLength === "number" && length > schema.maxLength)
        )
            return false;
        if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) return false;
        for (const char of value) {
            const point = char.codePointAt(0)!;
            if (point >= 0xd800 && point <= 0xdfff) return false;
        }
    }
    if (
        typeof value === "number" &&
        ((typeof schema.minimum === "number" && value < schema.minimum) ||
            (typeof schema.maximum === "number" && value > schema.maximum))
    )
        return false;
    if (Array.isArray(value)) {
        if (
            (typeof schema.minItems === "number" && value.length < schema.minItems) ||
            (typeof schema.maxItems === "number" && value.length > schema.maxItems)
        )
            return false;
        if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length)
            return false;
        if (record(schema.items) && !value.every((item) => validateSchema(schema.items as Schema, item))) return false;
    }
    if (record(value)) {
        const properties = record(schema.properties) ? schema.properties : {};
        if (
            Array.isArray(schema.required) &&
            schema.required.some((key) => typeof key !== "string" || !Object.hasOwn(value, key))
        )
            return false;
        for (const [key, child] of Object.entries(value)) {
            if (!Object.hasOwn(properties, key)) {
                if (schema.additionalProperties === false) return false;
            } else if (!record(properties[key]) || !validateSchema(properties[key], child)) return false;
        }
    }
    return true;
}

/** Decode only after checking the feature's canonical wire schema. */
export function decode<K extends keyof Models>(name: K, value: unknown): Models[K] {
    const registry = schemas.schemas as unknown as Record<string, Schema>;
    if (!registry[name] || !validateSchema(registry[name], value)) throw new Error("Invalid AgentIM protocol data");
    return value as Models[K];
}
