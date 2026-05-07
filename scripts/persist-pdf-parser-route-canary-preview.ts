/**
 * CLI: build and persist a PARSER_ROUTE_CANARY_PREVIEW artifact snapshot.
 *
 * Builds a canary preview report under the default (DISABLED) config,
 * validates all safety flags, and writes the report as an immutable snapshot.
 * Production routing, fact extraction, and publishing are NOT affected.
 * canUseForProductionRouting is always false.
 *
 * Usage:
 *   npm run persist:pdf-parser-route-canary-preview -- \
 *     [--from=2026-01-01] \
 *     [--to=2026-12-31] \
 *     [--fiscal-year=2024] \
 *     [--org-number=123456789] \
 *     [--limit=100] \
 *     [--json]
 *
 * Exit codes:
 *   0  — snapshot persisted successfully
 *   1  — invalid input, validation failure, or DB error
 */

import {
  DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
} from "@/server/services/pdf-parser-route-canary-config-service";
import {
  buildAndPersistPdfParserRouteCanaryPreviewSnapshot,
} from "@/server/services/pdf-model-artifact-snapshot-service";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readOption(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("persist-pdf-parser-route-canary-preview requires DATABASE_URL.");
  }

  const from = readOption("--from=");
  const to = readOption("--to=");
  const fiscalYearRaw = readOption("--fiscal-year=");
  const orgNumber = readOption("--org-number=");
  const limitRaw = readOption("--limit=");
  const asJson = hasFlag("--json");

  let fiscalYear: number | undefined;
  if (fiscalYearRaw !== undefined) {
    fiscalYear = parseInt(fiscalYearRaw, 10);
    if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
      throw new Error(`--fiscal-year must be a 4-digit year, got: ${fiscalYearRaw}`);
    }
  }

  let limit: number | undefined;
  if (limitRaw !== undefined) {
    limit = parseInt(limitRaw, 10);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error(`--limit must be between 1 and 500, got: ${limitRaw}`);
    }
  }

  const result = await buildAndPersistPdfParserRouteCanaryPreviewSnapshot(
    {
      from,
      to,
      fiscalYear,
      organizationNumber: orgNumber,
      limit,
      config: DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
      sourceCommand: "persist:pdf-parser-route-canary-preview",
    },
  );

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nPARSER_ROUTE_CANARY_PREVIEW snapshot persisted.`);
  console.log(`  Artifact ID  : ${result.artifactId}`);
  console.log(`  Kind         : ${result.kind}`);
  console.log(`  Created at   : ${result.createdAt.toISOString()}`);
  console.log(`  Summary:`);
  for (const [key, value] of Object.entries(result.summary)) {
    console.log(`    ${key.padEnd(24)} : ${String(value)}`);
  }
  console.log(`\n  canUseForProductionRouting : false`);
  console.log(`  productionRoutingChanged   : false`);
  console.log(`  shadowOnly                 : true`);
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
