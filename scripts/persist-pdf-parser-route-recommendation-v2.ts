/**
 * CLI: build and persist a PARSER_ROUTE_RECOMMENDATION_V2 artifact snapshot.
 *
 * Reads shadow execution artifacts, builds a recommendation v2 report,
 * validates all safety flags, and writes the report as an immutable snapshot.
 * Production routing, fact extraction, and publishing are NOT affected.
 * canUseForProductionRouting is always false.
 *
 * Usage:
 *   npm run persist:pdf-parser-route-recommendation-v2 -- \
 *     [--from=2026-01-01] \
 *     [--to=2026-12-31] \
 *     [--fiscal-year=2024] \
 *     [--org-number=123456789] \
 *     [--routes=OCR,OPENDATALOADER_LOCAL] \
 *     [--limit=100] \
 *     [--json]
 *
 * Exit codes:
 *   0  — snapshot persisted successfully
 *   1  — invalid input, validation failure, or DB error
 */

import {
  buildAndPersistPdfParserRouteRecommendationV2Snapshot,
} from "@/server/services/pdf-model-artifact-snapshot-service";
import type { PdfParserRoute } from "@/server/services/pdf-parser-route-quality-comparison-service";

const VALID_ROUTES = new Set<string>(["OCR", "OPENDATALOADER_LOCAL", "HYBRID", "TEXT_LAYER"]);

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readOption(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("persist-pdf-parser-route-recommendation-v2 requires DATABASE_URL.");
  }

  const from = readOption("--from=");
  const to = readOption("--to=");
  const fiscalYearRaw = readOption("--fiscal-year=");
  const orgNumber = readOption("--org-number=");
  const routesRaw = readOption("--routes=");
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

  let routes: PdfParserRoute[] | undefined;
  if (routesRaw !== undefined) {
    const parsed = routesRaw
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    for (const r of parsed) {
      if (!VALID_ROUTES.has(r)) {
        throw new Error(
          `Invalid route: "${r}". Valid routes: ${Array.from(VALID_ROUTES).join(", ")}.`,
        );
      }
    }
    routes = parsed as PdfParserRoute[];
  }

  const result = await buildAndPersistPdfParserRouteRecommendationV2Snapshot(
    {
      from,
      to,
      fiscalYear,
      organizationNumber: orgNumber,
      routes,
      limit,
      sourceCommand: "persist:pdf-parser-route-recommendation-v2",
    },
  );

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nPARSER_ROUTE_RECOMMENDATION_V2 snapshot persisted.`);
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
