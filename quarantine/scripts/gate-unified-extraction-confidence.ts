/**
 * CLI: gate-unified-extraction-confidence
 *
 * Evaluates the quality of a unified extraction run against the confidence gate.
 * Reads financial/narrative/comparison artifacts from JSON files or loads them
 * from DB artifact IDs.
 *
 * Usage:
 *   npx tsx scripts/gate-unified-extraction-confidence.ts \
 *     [--financial=<path>] \
 *     [--narrative=<path>] \
 *     [--comparison=<path>] \
 *     [--filing-id=<id>] \
 *     [--org-number=<org>] \
 *     [--fiscal-year=<year>] \
 *     [--persist] \
 *     [--json] \
 *     [--out=<path>]
 *
 * Safety:
 * - Never modifies production facts, routing decisions, or publish state.
 * - Gate report canUseForProductionRouting is always false.
 * - --persist requires DATABASE_URL.
 */

import fs from "node:fs";
import path from "node:path";
import {
  buildUnifiedExtractionConfidenceGateReport,
  type UnifiedExtractionConfidenceGateConfig,
} from "@/server/services/annual-report-unified-extraction-confidence-gate-service";
import type { UnifiedFinancialStatementExtractionResult } from "@/integrations/brreg/annual-report-financials/unified-financial-statement-extractor";
import type { UnifiedNarrativeExtractionResult } from "@/integrations/brreg/annual-report-financials/unified-narrative-extractor";
import type { AnnualReportLegacyVsUnifiedComparisonReport } from "@/server/services/annual-report-legacy-vs-unified-comparison-service";

// ── Arg parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(name: string): string | null {
  const prefix = `--${name}=`;
  const entry = args.find((a) => a.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

const financialPath = getArg("financial");
const narrativePath = getArg("narrative");
const comparisonPath = getArg("comparison");
const filingId = getArg("filing-id");
const orgNumber = getArg("org-number");
const fiscalYearArg = getArg("fiscal-year");
const fiscalYear = fiscalYearArg ? parseInt(fiscalYearArg, 10) : null;
const persist = hasFlag("persist");
const outputJson = hasFlag("json");
const outputPath = getArg("out");

// ── Loaders ───────────────────────────────────────────────────────────────────

function loadJson<T>(filePath: string, label: string): T {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved} (${label})`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(resolved, "utf8")) as T;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Load input data
  const financial: UnifiedFinancialStatementExtractionResult | null = financialPath
    ? loadJson<UnifiedFinancialStatementExtractionResult>(financialPath, "financial extraction")
    : null;

  const narrative: UnifiedNarrativeExtractionResult | null = narrativePath
    ? loadJson<UnifiedNarrativeExtractionResult>(narrativePath, "narrative extraction")
    : null;

  const comparison: AnnualReportLegacyVsUnifiedComparisonReport | null = comparisonPath
    ? loadJson<AnnualReportLegacyVsUnifiedComparisonReport>(comparisonPath, "comparison report")
    : null;

  if (!financial && !narrative && !comparison) {
    console.warn(
      "Warning: No inputs provided. Gate will return INSUFFICIENT_DATA for all checks.",
    );
  }

  // Config overrides from args (future extension point)
  const configOverrides: Partial<UnifiedExtractionConfidenceGateConfig> = {};

  // Build gate report
  const report = buildUnifiedExtractionConfidenceGateReport({
    financial,
    narrative,
    comparison,
    meta: {
      filingId: filingId ?? null,
      orgNumber: orgNumber ?? null,
      fiscalYear: fiscalYear ?? null,
    },
    config: configOverrides,
  });

  // ── Persist ────────────────────────────────────────────────────────────────

  if (persist) {
    const { persistUnifiedExtractionConfidenceGateArtifact } = await import(
      "@/server/services/annual-report-unified-extraction-artifact-service"
    );
    const result = await persistUnifiedExtractionConfidenceGateArtifact({
      report,
      sourceCommand: "scripts/gate-unified-extraction-confidence.ts",
    });
    console.log(`Artifact persisted: ${result.artifactId} (${result.kind})`);
  }

  // ── Output ─────────────────────────────────────────────────────────────────

  if (outputJson) {
    const json = JSON.stringify(report, null, 2);
    if (outputPath) {
      fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
      fs.writeFileSync(path.resolve(outputPath), json, "utf8");
      console.log(`Result written to: ${outputPath}`);
    } else {
      console.log(json);
    }
  } else {
    const VERDICT_EMOJI: Record<string, string> = {
      PASS: "✅",
      WARN: "⚠️ ",
      FAIL: "❌",
      INSUFFICIENT_DATA: "ℹ️ ",
    };

    console.log("\n── Unified Extraction Confidence Gate ──────────────────────────");
    if (filingId) console.log(`  Filing:      ${filingId}`);
    if (orgNumber) console.log(`  Org:         ${orgNumber}`);
    if (fiscalYear) console.log(`  Fiscal year: ${fiscalYear}`);
    console.log(`\n  Overall:     ${VERDICT_EMOJI[report.overallVerdict] ?? ""} ${report.overallVerdict}`);
    console.log(`  PASS:        ${report.passCount}`);
    console.log(`  WARN:        ${report.warnCount}`);
    console.log(`  FAIL:        ${report.failCount}`);
    console.log(`  N/A:         ${report.insufficientDataCount}`);
    console.log("\n  Checks:");
    for (const check of report.checks) {
      const emoji = VERDICT_EMOJI[check.verdict] ?? "  ";
      console.log(`    ${emoji} ${check.checkCode}: ${check.message}`);
    }
    if (report.blockingChecks.length > 0) {
      console.log("\n  Blocking checks:");
      for (const check of report.blockingChecks) {
        console.log(`    ❌ ${check.checkCode}: ${check.message}`);
      }
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
