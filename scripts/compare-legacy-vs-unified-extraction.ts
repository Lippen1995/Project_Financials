/**
 * CLI: Compare legacy extraction output with unified extraction results.
 *
 * Reads legacy CanonicalFactCandidate[] JSON and/or unified extraction JSON
 * fixtures from disk, runs the comparison service, and prints a summary or
 * JSON output.
 *
 * No DB access, no live Brreg, no OCR/ODL runtime. Fixture-only.
 *
 * Usage:
 *   npm run compare:legacy-vs-unified -- \
 *     [--legacy=<path-to-canonical-fact-candidates.json>] \
 *     [--unified-financial=<path-to-unified-financial-extraction.json>] \
 *     [--unified-narrative=<path-to-unified-narrative-extraction.json>] \
 *     [--filing-id=<id>] \
 *     [--org-number=<org>] \
 *     [--fiscal-year=<year>] \
 *     [--json] \
 *     [--out=<output-path>]
 *
 * Exit codes:
 *   0  — success (warnings are non-fatal)
 *   1  — invalid input or validation failure
 */

import { readFileSync, writeFileSync } from "node:fs";

import {
  compareAnnualReportLegacyVsUnifiedExtraction,
  serializeLegacyVsUnifiedComparisonReportAsJson,
  validateLegacyVsUnifiedComparisonReport,
} from "@/server/services/annual-report-legacy-vs-unified-comparison-service";
import type { CanonicalFactCandidate } from "@/integrations/brreg/annual-report-financials/types";
import type { UnifiedFinancialStatementExtractionResult } from "@/integrations/brreg/annual-report-financials/unified-financial-statement-extractor";
import type { UnifiedNarrativeExtractionResult } from "@/integrations/brreg/annual-report-financials/unified-narrative-extractor";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readOption(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function readJsonFile<T>(path: string, label: string): T {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (e) {
    throw new Error(`Could not read ${label} file "${path}": ${String(e)}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${label} file "${path}" is not valid JSON.`);
  }
}

function main() {
  const legacyPath = readOption("--legacy=");
  const unifiedFinancialPath = readOption("--unified-financial=");
  const unifiedNarrativePath = readOption("--unified-narrative=");
  const outPath = readOption("--out=");
  const asJson = hasFlag("--json");
  const filingId = readOption("--filing-id=") ?? null;
  const orgNumber = readOption("--org-number=") ?? null;
  const fiscalYearRaw = readOption("--fiscal-year=");

  if (!legacyPath && !unifiedFinancialPath && !unifiedNarrativePath) {
    throw new Error(
      "compare:legacy-vs-unified requires at least one of: --legacy, --unified-financial, or --unified-narrative",
    );
  }

  let fiscalYear: number | null = null;
  if (fiscalYearRaw !== undefined) {
    fiscalYear = parseInt(fiscalYearRaw, 10);
    if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
      throw new Error(`--fiscal-year must be a 4-digit year, got: ${fiscalYearRaw}`);
    }
  }

  const legacyCandidates: CanonicalFactCandidate[] = legacyPath
    ? readJsonFile<CanonicalFactCandidate[]>(legacyPath, "legacy candidates")
    : [];

  const unifiedFinancial = unifiedFinancialPath
    ? readJsonFile<UnifiedFinancialStatementExtractionResult>(
        unifiedFinancialPath,
        "unified financial extraction",
      )
    : undefined;

  const unifiedNarrative = unifiedNarrativePath
    ? readJsonFile<UnifiedNarrativeExtractionResult>(
        unifiedNarrativePath,
        "unified narrative extraction",
      )
    : undefined;

  const result = compareAnnualReportLegacyVsUnifiedExtraction({
    legacyCandidates,
    unifiedFinancial,
    unifiedNarrative,
    meta: { filingId, orgNumber, fiscalYear },
  });

  const { valid, issues } = validateLegacyVsUnifiedComparisonReport(result);

  if (!valid) {
    console.error("Validation FAILED:");
    for (const issue of issues.filter((i) => i.severity === "ERROR")) {
      console.error(`  ✗ [${issue.code}] ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  if (asJson) {
    const output = JSON.stringify({ valid, issues, result }, null, 2);
    if (outPath) {
      writeFileSync(outPath, output, "utf-8");
      console.log(`Output written to ${outPath}`);
    } else {
      console.log(output);
    }
    return;
  }

  // Human-readable summary
  const s = result.summary;
  console.log(`\nLEGACY-VS-UNIFIED EXTRACTION COMPARISON`);
  console.log(`  Version          : ${result.version}`);
  console.log(`  Generated at     : ${result.generatedAt}`);
  console.log(`  Filing ID        : ${result.source.filingId ?? "—"}`);
  console.log(`  Org number       : ${result.source.orgNumber ?? "—"}`);
  console.log(`  Fiscal year      : ${String(result.source.fiscalYear ?? "—")}`);
  console.log(`  Legacy candidates: ${result.source.legacyCandidateCount}`);
  console.log(`  Unified route    : ${result.source.unifiedRoute ?? "—"}`);

  console.log(`\n  Financial comparison:`);
  console.log(`    ${"Total compared".padEnd(28)} : ${s.financialTotalCompared}`);
  console.log(`    ${"Exact matches".padEnd(28)} : ${s.financialExactMatchCount}`);
  console.log(`    ${"Scaled matches (≤1%)".padEnd(28)} : ${s.financialScaledMatchCount}`);
  console.log(`    ${"Mismatches".padEnd(28)} : ${s.financialMismatchCount}`);
  console.log(`    ${"Missing in legacy".padEnd(28)} : ${s.financialMissingInLegacyCount}`);
  console.log(`    ${"Missing in unified".padEnd(28)} : ${s.financialMissingInUnifiedCount}`);

  const totalFin = s.financialTotalCompared;
  if (totalFin > 0) {
    const matchRate = ((s.financialExactMatchCount + s.financialScaledMatchCount) / totalFin * 100).toFixed(1);
    console.log(`    ${"Match rate".padEnd(28)} : ${matchRate}%`);
  }

  console.log(`\n  Narrative comparison:`);
  console.log(`    ${"Board report".padEnd(28)} : ${String(s.narrativeBoardReportCovered)}`);
  console.log(`    ${"Auditor report".padEnd(28)} : ${String(s.narrativeAuditorReportCovered)}`);
  console.log(`    ${"Signatures".padEnd(28)} : ${String(s.narrativeSignaturesCovered)}`);
  console.log(`    ${"Coverage score".padEnd(28)} : ${(s.narrativeCoverageScore * 100).toFixed(0)}%`);

  // Show mismatches
  const mismatches = result.financialComparisons.filter((c) => c.match === "CONFLICTING_VALUES");
  if (mismatches.length > 0) {
    console.log(`\n  Mismatches (first 10):`);
    for (const m of mismatches.slice(0, 10)) {
      console.log(
        `    [${m.year}] ${m.canonicalKey.padEnd(30)} legacy=${m.legacyValueNok ?? "—"} unified=${m.unifiedValueNok ?? "—"}` +
          (m.relativeDeviation !== null ? ` (dev=${(m.relativeDeviation * 100).toFixed(1)}%)` : ""),
      );
    }
    if (mismatches.length > 10) {
      console.log(`    … and ${mismatches.length - 10} more`);
    }
  }

  if (result.warnings.length > 0) {
    console.log(`\n  Warnings:`);
    for (const w of result.warnings) {
      console.log(`    ⚠ ${w}`);
    }
  }

  if (issues.some((i) => i.severity === "WARNING")) {
    console.log(`\n  Validation warnings:`);
    for (const issue of issues.filter((i) => i.severity === "WARNING")) {
      console.log(`    ⚠ [${issue.code}] ${issue.message}`);
    }
  }

  console.log(`\n  Safety:`);
  console.log(`    canUseForProductionRouting : false`);
  console.log(`    productionRoutingChanged   : false`);
  console.log(`    productionFactsMutated     : false`);
  console.log(`    publishAffected            : false`);

  if (outPath) {
    writeFileSync(outPath, serializeLegacyVsUnifiedComparisonReportAsJson(result), "utf-8");
    console.log(`\nFull result written to ${outPath}`);
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
