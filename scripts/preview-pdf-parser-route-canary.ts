/**
 * CLI: preview which filings would be eligible for canary routing under the
 * current (default) canary config.
 *
 * The default config is DISABLED with maxCanaryPercent=0. All verdicts will
 * be DISABLED unless the config is modified. Production routing, fact
 * extraction, and publishing are never affected. canUseForProductionRouting
 * is always false.
 *
 * Usage:
 *   npm run preview:pdf-parser-route-canary -- \
 *     [--from=2026-01-01] \
 *     [--to=2026-12-31] \
 *     [--fiscal-year=2024] \
 *     [--org-number=123456789] \
 *     [--limit=100] \
 *     [--json]
 *
 * Examples:
 *
 *   # Text summary (default config, all DISABLED):
 *   npm run preview:pdf-parser-route-canary
 *
 *   # Filter to a single org:
 *   npm run preview:pdf-parser-route-canary -- --org-number=123456789 --fiscal-year=2024
 *
 *   # JSON output for piping:
 *   npm run preview:pdf-parser-route-canary -- --json
 *
 * Exit codes:
 *   0  — report generated successfully
 *   1  — invalid input or unexpected error
 */

import {
  buildPdfParserRouteCanaryPreviewReport,
  DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
  serializePdfParserRouteCanaryPreviewReport,
} from "@/server/services/pdf-parser-route-canary-config-service";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readOption(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("preview-pdf-parser-route-canary requires DATABASE_URL.");
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

  const report = await buildPdfParserRouteCanaryPreviewReport({
    from,
    to,
    fiscalYear,
    organizationNumber: orgNumber,
    limit,
    config: DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
  });

  if (asJson) {
    console.log(serializePdfParserRouteCanaryPreviewReport(report));
    return;
  }

  const s = report.summary;
  console.log(`\nCanary Routing Preview — ${report.generatedAt}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Config mode        : ${report.config.mode}`);
  console.log(`  Max canary %       : ${report.config.maxCanaryPercent}`);
  console.log(`  Config valid       : ${String(report.configValid)}`);

  if (!report.configValid) {
    for (const issue of report.configIssues) {
      console.log(`    ✗ ${issue}`);
    }
  }

  console.log(`\n  Documents          : ${s.totalDocuments}`);
  console.log(`  Eligible           : ${s.eligible}`);
  console.log(`  Blocked            : ${s.blocked}`);
  console.log(`  Disabled           : ${s.disabled}`);

  if (Object.keys(s.eligibleByRoute).length > 0) {
    console.log(`\n  Eligible by route:`);
    for (const [route, count] of Object.entries(s.eligibleByRoute)) {
      console.log(`    ${route.padEnd(24)} ${count}`);
    }
  }

  console.log(`\n  Safety:`);
  console.log(`    canUseForProductionRouting : ${String(report.safety.canUseForProductionRouting)}`);
  console.log(`    productionRoutingChanged   : ${String(report.safety.productionRoutingChanged)}`);
  console.log(`    shadowOnly                 : ${String(report.safety.shadowOnly)}`);

  if (report.filings.length > 0 && report.filings.some((f) => f.verdict !== "DISABLED")) {
    console.log(`\n  Non-disabled filings (up to 20):`);
    const nonDisabled = report.filings.filter((f) => f.verdict !== "DISABLED").slice(0, 20);
    for (const f of nonDisabled) {
      const route = f.canaryRoute ?? "-";
      const blocked =
        f.blockedReasons.length > 0 ? `  [${f.blockedReasons[0]}]` : "";
      console.log(
        `    ${f.filingId.padEnd(28)} ${f.verdict.padEnd(10)} ${route.padEnd(22)}${blocked}`,
      );
    }
  } else if (report.config.mode === "DISABLED" || report.config.maxCanaryPercent === 0) {
    console.log(
      `\n  ℹ Canary routing is disabled — all filings show DISABLED. ` +
        `No production routing changes are made.`,
    );
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
