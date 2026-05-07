/**
 * CLI: Persist unified extraction artifacts as PdfModelArtifactSnapshots.
 *
 * Reads a JSON artifact fixture from disk and persists it as the specified
 * artifact kind. Requires DATABASE_URL to be set.
 *
 * Usage:
 *   npm run persist:unified-extraction-artifact -- \
 *     --kind=<UNIFIED_PARSER_DOCUMENT|UNIFIED_FINANCIAL_EXTRACTION|UNIFIED_NARRATIVE_EXTRACTION|LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON> \
 *     --in=<path-to-artifact.json> \
 *     [--fiscal-year=2024] \
 *     [--org-number=<org>] \
 *     [--source-command=<cmd>] \
 *     [--commit-sha=<sha>]
 *
 * Exit codes:
 *   0  — success
 *   1  — invalid input, missing file, validation failure, or DB error
 */

import { readFileSync } from "node:fs";

import {
  persistLegacyVsUnifiedComparisonArtifact,
  persistUnifiedFinancialExtractionArtifact,
  persistUnifiedNarrativeExtractionArtifact,
  persistUnifiedParserDocumentArtifact,
} from "@/server/services/annual-report-unified-extraction-artifact-service";
import type { UnifiedParserDocument } from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";
import type { UnifiedFinancialStatementExtractionResult } from "@/integrations/brreg/annual-report-financials/unified-financial-statement-extractor";
import type { UnifiedNarrativeExtractionResult } from "@/integrations/brreg/annual-report-financials/unified-narrative-extractor";
import type { AnnualReportLegacyVsUnifiedComparisonReport } from "@/server/services/annual-report-legacy-vs-unified-comparison-service";

type SupportedKind =
  | "UNIFIED_PARSER_DOCUMENT"
  | "UNIFIED_FINANCIAL_EXTRACTION"
  | "UNIFIED_NARRATIVE_EXTRACTION"
  | "LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON";

const VALID_KINDS: SupportedKind[] = [
  "UNIFIED_PARSER_DOCUMENT",
  "UNIFIED_FINANCIAL_EXTRACTION",
  "UNIFIED_NARRATIVE_EXTRACTION",
  "LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON",
];

function readOption(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const kindRaw = readOption("--kind=");
  const inPath = readOption("--in=");
  const fiscalYearRaw = readOption("--fiscal-year=");
  const orgNumber = readOption("--org-number=") ?? null;
  const sourceCommand = readOption("--source-command=") ?? null;
  const sourceCommitSha = readOption("--commit-sha=") ?? null;

  if (!kindRaw || !VALID_KINDS.includes(kindRaw as SupportedKind)) {
    throw new Error(
      `persist:unified-extraction-artifact requires --kind=<${VALID_KINDS.join("|")}>`,
    );
  }
  if (!inPath) {
    throw new Error("persist:unified-extraction-artifact requires --in=<path>");
  }

  const kind = kindRaw as SupportedKind;

  let fiscalYear: number | null = null;
  if (fiscalYearRaw !== undefined) {
    fiscalYear = parseInt(fiscalYearRaw, 10);
    if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
      throw new Error(`--fiscal-year must be a 4-digit year, got: ${fiscalYearRaw}`);
    }
  }

  let rawContent: string;
  try {
    rawContent = readFileSync(inPath, "utf-8");
  } catch (e) {
    throw new Error(`Could not read input file "${inPath}": ${String(e)}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawContent);
  } catch {
    throw new Error(`Input file "${inPath}" is not valid JSON.`);
  }

  console.log(`Persisting ${kind} artifact from ${inPath}...`);

  let result;
  switch (kind) {
    case "UNIFIED_PARSER_DOCUMENT":
      result = await persistUnifiedParserDocumentArtifact({
        document: payload as UnifiedParserDocument,
        sourceCommand,
        sourceCommitSha,
      });
      break;

    case "UNIFIED_FINANCIAL_EXTRACTION":
      result = await persistUnifiedFinancialExtractionArtifact({
        result: payload as UnifiedFinancialStatementExtractionResult,
        sourceCommand,
        sourceCommitSha,
      });
      break;

    case "UNIFIED_NARRATIVE_EXTRACTION":
      result = await persistUnifiedNarrativeExtractionArtifact({
        result: payload as UnifiedNarrativeExtractionResult,
        sourceCommand,
        sourceCommitSha,
      });
      break;

    case "LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON":
      result = await persistLegacyVsUnifiedComparisonArtifact({
        report: payload as AnnualReportLegacyVsUnifiedComparisonReport,
        sourceCommand,
        sourceCommitSha,
      });
      break;
  }

  console.log(`\nPersisted successfully:`);
  console.log(`  Artifact ID : ${result.artifactId}`);
  console.log(`  Kind        : ${result.kind}`);
  console.log(`  Created at  : ${result.createdAt.toISOString()}`);
  console.log(`  Summary     :`);
  for (const [k, v] of Object.entries(result.summary)) {
    console.log(`    ${k.padEnd(28)} : ${JSON.stringify(v)}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
