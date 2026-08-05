/**
 * CLI: preview deterministic parser route assignment under the default (DISABLED) canary config.
 *
 * Shows which route each filing *would* be assigned to based on the stable
 * cohort hash for the given seed. No production routing is changed.
 * canUseForProductionRouting is always false.
 *
 * Usage:
 *   npm run preview:pdf-parser-route-assignment -- \
 *     [--seed=preview] \
 *     [--from=2026-01-01] \
 *     [--to=2026-12-31] \
 *     [--fiscal-year=2024] \
 *     [--org-number=123456789] \
 *     [--limit=100] \
 *     [--json]
 *
 * Exit codes:
 *   0  — report printed successfully
 *   1  — invalid input or runtime error
 */

import {
  buildPdfParserRouteAssignmentPreviewReport,
} from "@/server/services/pdf-parser-route-assignment-preview-service";
import {
  DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
} from "@/server/services/pdf-parser-route-canary-config-service";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readOption(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("preview-pdf-parser-route-assignment requires DATABASE_URL.");
  }

  const seed = readOption("--seed=") ?? "preview";
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

  const report = await buildPdfParserRouteAssignmentPreviewReport({
    seed,
    from,
    to,
    fiscalYear,
    organizationNumber: orgNumber,
    limit,
    config: DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
  });

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const s = report.summary;
  console.log(`\nPARSER ROUTE ASSIGNMENT PREVIEW`);
  console.log(`  Seed             : ${report.seed}`);
  console.log(`  Generated at     : ${report.generatedAt}`);
  console.log(`  Config mode      : ${report.config.mode}`);
  console.log(`  Max canary %     : ${report.config.maxCanaryPercent}`);
  console.log(`\n  Summary:`);
  console.log(`    ${"Total".padEnd(24)} : ${s.totalDocuments}`);
  console.log(`    ${"Canary route".padEnd(24)} : ${s.wouldUseCanaryRoute}`);
  console.log(`    ${"Text layer".padEnd(24)} : ${s.wouldUseTextLayer}`);
  console.log(`    ${"Manual review".padEnd(24)} : ${s.manualReview}`);
  console.log(`    ${"Blocked".padEnd(24)} : ${s.blocked}`);
  console.log(`    ${"Disabled".padEnd(24)} : ${s.disabled}`);

  if (Object.keys(s.byAssignedRoute).length > 0) {
    console.log(`\n  By canary route:`);
    for (const [route, count] of Object.entries(s.byAssignedRoute)) {
      console.log(`    ${route.padEnd(24)} : ${count}`);
    }
  }

  console.log(`\n  canUseForProductionRouting : false`);
  console.log(`  productionRoutingChanged   : false`);
  console.log(`  shadowOnly                 : true`);

  if (report.assignments.length > 0) {
    console.log(`\n  Assignments (first 20):`);
    const shown = report.assignments.slice(0, 20);
    for (const a of shown) {
      const route = a.assignedCanaryRoute ?? (a.verdict === "WOULD_USE_TEXT_LAYER" ? "TEXT_LAYER" : a.verdict);
      console.log(
        `    [bucket=${String(a.bucket).padStart(2)}] ${a.filingId.padEnd(36)} ${a.verdict.padEnd(22)} ${route}`,
      );
    }
    if (report.assignments.length > 20) {
      console.log(`    … and ${report.assignments.length - 20} more. Use --json for full output.`);
    }
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
