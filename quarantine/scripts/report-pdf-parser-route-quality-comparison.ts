/**
 * CLI: generate a read-only quality comparison report from persisted shadow execution artifacts.
 *
 * Usage:
 *   pnpm tsx scripts/report-pdf-parser-route-quality-comparison.ts \
 *     [--from=2026-01-01] \
 *     [--to=2026-12-31] \
 *     [--fiscal-year=2024] \
 *     [--org-number=123456789] \
 *     [--routes=OCR,OPENDATALOADER_LOCAL] \
 *     [--limit=100] \
 *     [--json]
 *
 * Exit codes:
 *   0  — report generated successfully (even if corpus is empty)
 *   1  — invalid input
 */

import {
  buildPdfParserRouteQualityComparisonReport,
  serializePdfParserRouteQualityComparisonReport,
  validatePdfParserRouteQualityComparisonReport,
} from "@/server/services/pdf-parser-route-quality-comparison-service";
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
    throw new Error("report-pdf-parser-route-quality-comparison requires DATABASE_URL.");
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
  if (routesRaw) {
    const parsed = routesRaw
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    for (const route of parsed) {
      if (!VALID_ROUTES.has(route)) {
        throw new Error(
          `Invalid route: ${route}. Valid values: ${Array.from(VALID_ROUTES).join(", ")}.`,
        );
      }
    }
    routes = parsed as PdfParserRoute[];
  }

  const report = await buildPdfParserRouteQualityComparisonReport({
    from,
    to,
    fiscalYear,
    organizationNumber: orgNumber,
    routes,
    limit,
  });

  const { valid, issues } = validatePdfParserRouteQualityComparisonReport(report);
  if (!valid) {
    process.stderr.write(`[WARN] Report validation issues:\n${issues.map((i) => `  - ${i}`).join("\n")}\n`);
  }

  if (asJson) {
    process.stdout.write(serializePdfParserRouteQualityComparisonReport(report) + "\n");
    return;
  }

  const { corpus, routeMetrics, topOpportunities, topFailures } = report;

  process.stdout.write(`\n=== PDF Parser Route Quality Comparison Report ===\n`);
  process.stdout.write(`Generated: ${report.generatedAt}\n\n`);

  process.stdout.write(`Corpus:\n`);
  process.stdout.write(`  Artifacts:        ${corpus.artifactCount}\n`);
  process.stdout.write(`  Documents:        ${corpus.documentCount}\n`);
  process.stdout.write(`  Malformed:        ${corpus.malformedArtifactCount}\n`);
  process.stdout.write(`  Successful runs:  ${corpus.successfulRouteRuns}\n`);
  process.stdout.write(`  Failed runs:      ${corpus.failedRouteRuns}\n`);
  process.stdout.write(`  Unavailable:      ${corpus.unavailableRouteRuns}\n`);
  process.stdout.write(`  Skipped:          ${corpus.skippedRouteRuns}\n`);

  if (corpus.insufficientData) {
    process.stdout.write(`\n[!] Insufficient data warnings:\n`);
    for (const reason of corpus.insufficientDataReasons) {
      process.stdout.write(`  - ${reason}\n`);
    }
  }

  process.stdout.write(`\nRoute Metrics:\n`);
  for (const m of routeMetrics) {
    process.stdout.write(
      `  ${m.route}: ${m.successCount}/${m.documentsCompared} successful` +
        (m.averageQualityScore !== null ? `, avg score ${m.averageQualityScore.toFixed(1)}` : "") +
        `\n`,
    );
  }

  if (topOpportunities.length > 0) {
    process.stdout.write(`\nTop Opportunities (${topOpportunities.length}):\n`);
    for (const opp of topOpportunities.slice(0, 10)) {
      process.stdout.write(
        `  ${opp.annualReportId} → ${opp.suggestedRoute} (+${opp.delta.toFixed(1)} score delta)\n`,
      );
      if (opp.reasons.length > 0) {
        process.stdout.write(`    Reasons: ${opp.reasons.join(", ")}\n`);
      }
    }
  } else {
    process.stdout.write(`\nTop Opportunities: none\n`);
  }

  if (topFailures.length > 0) {
    process.stdout.write(`\nTop Failures (${topFailures.length}):\n`);
    for (const f of topFailures.slice(0, 10)) {
      process.stdout.write(`  ${f.annualReportId} ${f.route} [${f.status}]: ${f.reason}\n`);
    }
  }

  process.stdout.write(`\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
