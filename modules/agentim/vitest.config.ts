/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

export default defineProject({
    resolve: {
        alias: {
            "@element-hq/element-web-module-api": fileURLToPath(
                new URL("../../packages/module-api/src/index.ts", import.meta.url),
            ),
        },
    },
    test: { name: "agentim", environment: "happy-dom", include: ["src/**/*.test.{ts,tsx}"] },
});
