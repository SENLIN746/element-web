/*
Copyright 2026 alljoy

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import react from "@vitejs/plugin-react";
import baseConfig from "@element-hq/element-web-module-api/vite.base.ts";

export default mergeConfig(baseConfig, {
    build: {
        sourcemap: false,
        lib: {
            entry: fileURLToPath(import.meta.resolve("./src/index.ts")),
            name: "agentim-element-module",
            fileName: "index",
            formats: ["es"],
        },
    },
    plugins: [react({ jsxRuntime: "classic" })],
});
