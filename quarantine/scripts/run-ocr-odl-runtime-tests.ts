#!/usr/bin/env tsx

import { spawnSync } from "node:child_process";

process.env.PDF_RUNTIME_INTEGRATION_TESTS = "1";

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "vitest",
    "run",
    "server/document-understanding/opendataloader-runtime.test.ts",
    "integrations/brreg/annual-report-financials/ocr.test.ts",
  ],
  {
    env: process.env,
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
