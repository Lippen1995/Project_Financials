/**
 * CLI: generate a read-only parser route recommendation report (v2) from persisted shadow
 * execution artifacts.
 *
 * Recommendations are derived from quality comparison scores across shadow routes.
 * Production routing, fact extraction, and publishing are NOT affected.
 * canUseForProductionRouting is always false.
 *
 * Usage:
 *   npm run report:pdf-parser-route-recommendation-v2 -- \
 *     [--from=2026-01-01] \
 *     [--to=2026-12-31] \
 *     [--fiscal-year=2024] \
 *     [--org-number=123456789] \
 *     [--routes=OCR,OPENDATALOADER_LOCAL] \
 *     [--limit=100] \
 *     [--json]
 *
 * Examples:
 *
 *   # Full recommendation report (text summary):
 *   npm run report:pdf-parser-route-recommendation-v2
 *
 *   # Filter to a single org and year:
 *   npm run report:pdf-parser-route-recommendation-v2 -- \
 *     --org-number=123456789 --fiscal-year=2024
 *
 *   # JSON output for piping to downstream tools:
 *   npm run report:pdf-parser-route-recommendation-v2 -- --json
 *
 * Exit codes:
 *   0  — report generated successfully (even if corpus is empty)
 *   1  — invalid input or unexpected error
 */

import {
  buildPdfParserRouteRecommendationV2Report,
  serializePdfParserRouteRecommendationV2Report,
  validatePdfParserRouteRecommendationV2Report,
} from "@/server/services/pdf-parser-route-recommendation-v2-service";
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
    throw new Error("report-pdf-parser-route-recommendation-v2 requires DATABASE_URL.");
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

  const report = await buildPdfParserRouteRecommendationV2Report({
    from,
    to,
    fiscalYear,
    organizationNumber: orgNumber,
    routes,
    limit,
  });

  const { valid, issues } = validatePdfParserRouteRecommendationV2Report(report);
  if (!valid) {
    console.error("Report validation failed:");
    for (const issue of issues) {
      console.error(`  - ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  if (asJson) {
    console.log(serializePdfParserRouteRecommendationV2Report(report));
    return;
  }

  const s = report.summary;
  console.log(`\nParser Route Recommendation v2 — ${report.generatedAt}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Documents      : ${s.totalDocuments}`);
  console.log(`  Artifacts      : ${report.corpus.artifactCount}`);
  console.log(`  Insufficient?  : ${report.corpus.insufficientData}`);

  if (report.corpus.insufficientData) {
    for (const reason of report.corpus.insufficientDataReasons) {
      console.log(`    ⚠  ${reason}`);
    }
  }

  console.log(`\n  Recommendations:`);
  console.log(`    TEXT_LAYER            : ${s.textLayerRecommended}`);
  console.log(`    OCR                   : ${s.ocrRecommended}`);
  console.log(`    OPENDATALOADER_LOCAL  : ${s.odlRecommended}`);
  console.log(`    HYBRID                : ${s.hybridRecommended}`);
  console.log(`    MANUAL_REVIEW         : ${s.manualReviewRequired}`);

  console.log(`\n  Confidence:`);
  console.log(`    HIGH                  : ${s.highConfidence}`);
  console.log(`    MEDIUM                : ${s.mediumConfidence}`);
  console.log(`    LOW                   : ${s.lowConfidence}`);
  console.log(`    INSUFFICIENT_DATA     : ${s.insufficientData}`);

  console.log(`\n  Risk:`);
  console.log(`    HIGH                  : ${s.highRisk}`);

  console.log(`\n  Safety guardrails:`);
  console.log(`    canUseForProductionRouting : ${String(report.safety.canUseForProductionRouting)}`);
  console.log(`    productionRoutingChanged   : ${String(report.safety.productionRoutingChanged)}`);
  console.log(`    shadowOnly                 : ${String(report.safety.shadowOnly)}`);

  if (report.decisions.length > 0) {
    console.log(`\n  Top decisions (up to 20):`);
    for (const d of report.decisions.slice(0, 20)) {
      const scores = [
        `TL=${d.evidence.textLayerQualityScore?.toFixed(1) ?? "-"}`,
        d.evidence.ocrQualityScore !== null ? `OCR=${d.evidence.ocrQualityScore.toFixed(1)}` : null,
        d.evidence.odlQualityScore !== null ? `ODL=${d.evidence.odlQualityScore.toFixed(1)}` : null,
        d.evidence.hybridQualityScore !== null ? `HYB=${d.evidence.hybridQualityScore.toFixed(1)}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      console.log(
        `    ${d.filingId.padEnd(28)} ${d.recommendedRoute.padEnd(22)} conf=${d.confidence.padEnd(16)} risk=${d.risk.padEnd(8)} [${scores}]`,
      );
    }
    if (report.decisions.length > 20) {
      console.log(`    ... and ${report.decisions.length - 20} more.`);
    }
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
