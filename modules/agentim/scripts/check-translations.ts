/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const translations: Record<string, Record<string, unknown>> = JSON.parse(
    readFileSync(new URL("../src/translations.json", import.meta.url), "utf8"),
);
const identity: Record<string, Record<string, unknown>> = JSON.parse(
    readFileSync(new URL("../src/features/identity/translations.json", import.meta.url), "utf8"),
);
const pairing: Record<string, Record<string, unknown>> = JSON.parse(
    readFileSync(new URL("../src/features/pairing/translations.json", import.meta.url), "utf8"),
);
for (const [key, values] of Object.entries({ ...identity, ...pairing })) {
    if (key in translations) throw new Error(`Duplicate translation ${key}`);
    translations[key] = values;
}
for (const [key, values] of Object.entries(translations)) {
    if (!/^agentim_[a-z_]+$/.test(key)) throw new Error(`Unscoped translation key: ${key}`);
    for (const language of Object.keys(values)) Intl.getCanonicalLocales(language);
    for (const language of ["en", "zh-hans"]) {
        if (typeof values[language] !== "string" || !values[language].trim()) {
            throw new Error(`Missing ${language} translation for ${key}`);
        }
    }
}
for (const source of globSync("src/**/*.{ts,tsx}", { cwd: root })) {
    const contents = readFileSync(new URL(`../${source}`, import.meta.url), "utf8");
    for (const match of contents.matchAll(/(?:t|translate)\("(agentim_[a-z_]+)"/g)) {
        if (!(match[1] in translations)) throw new Error(`Missing translation ${match[1]} in ${source}`);
    }
}
console.log(`AgentIM translations valid: ${Object.keys(translations).length} keys in English and Simplified Chinese`);
