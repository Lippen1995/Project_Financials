/**
 * CLI: run-annual-report-unified-shadow
 *
 * Runs the unified extractor in shadow mode on a single annual-report filing.
 * The primary pipeline is NOT re-run; this script loads the filing's preflight
 * artifact from storage and re-runs only the unified shadow path.
 *
 * Usage:
 *   npx tsx scripts/run-annual-report-unified-shadow.ts \
 *     --filingId=<id> \
 *     [--mode=DRY_RUN|PERSIST_ARTIFACTS] \
 *     [--persist-doc] [--persist-fin] [--persist-nar] [--persist-cmp] \
 *     [--json] [--out=<path>]
 *
 * Safety:
 * - Never modifies production facts, routing decisions, or publish state.
 * - Default mode is DRY_RUN (unless overridden by --mode).
 * - PERSIST_ARTIFACTS requires DATABASE_URL to be set.
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { preflightAnnualReportDocument } from "@/integrations/brreg/annual-report-financials/preflight";
import type { CanonicalFactCandidate } from "@/integrations/brreg/annual-report-financials/types";
import { LocalAnnualReportArtifactStorage } from "@/server/financials/artifact-storage";
import { runAnnualReportUnifiedShadowExtraction } from "@/server/services/annual-report-unified-shadow-extraction-service";
import {
  validateAnnualReportUnifiedShadowConfig,
  type AnnualReportUnifiedShadowConfig,
  type AnnualReportUnifiedShadowMode,
} from "@/server/services/annual-report-unified-shadow-config";

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

const filingId = getArg("filingId");
const modeArg = getArg("mode");
const outputJson = hasFlag("json");
const outputPath = getArg("out");
const persistDoc = hasFlag("persist-doc");
const persistFin = hasFlag("persist-fin");
const persistNar = hasFlag("persist-nar");
const persistCmp = hasFlag("persist-cmp");

if (!filingId) {
  console.error("Usage: tsx scripts/run-annual-report-unified-shadow.ts --filingId=<id> [--mode=DRY_RUN|PERSIST_ARTIFACTS] [--persist-doc] [--persist-fin] [--persist-nar] [--persist-cmp] [--json] [--out=<path>]");
  process.exit(1);
}

const VALID_MODES: ReadonlySet<string> = new Set<AnnualReportUnifiedShadowMode>([
  "DRY_RUN",
  "PERSIST_ARTIFACTS",
]);
const mode: AnnualReportUnifiedShadowMode =
  modeArg && VALID_MODES.has(modeArg)
    ? (modeArg as AnnualReportUnifiedShadowMode)
    : "DRY_RUN";

const config: AnnualReportUnifiedShadowConfig = {
  mode,
  persistUnifiedParserDocument: persistDoc,
  persistUnifiedFinancialExtraction: persistFin,
  persistUnifiedNarrativeExtraction: persistNar,
  persistLegacyVsUnifiedComparison: persistCmp,
};

const configErrors = validateAnnualReportUnifiedShadowConfig(config);
if (configErrors.length > 0) {
  console.error("Config validation errors:");
  for (const err of configErrors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[run-annual-report-unified-shadow] filingId=${filingId} mode=${mode}`);

  // Load filing record
  const filing = await prisma.annualReportFiling.findUnique({
    where: { id: filingId! },
    include: { company: { select: { id: true, orgNumber: true, name: true } } },
  });
  if (!filing) {
    console.error(`Filing not found: ${filingId}`);
    process.exit(1);
  }

  console.log(`  Company: ${filing.company.name} (${filing.company.orgNumber}), FY=${filing.fiscalYear}`);

  // Load PDF
  const artifactStorage = new LocalAnnualReportArtifactStorage();
  const artifacts = await prisma.annualReportArtifact.findMany({
    where: { filingId: filingId! },
    orderBy: { createdAt: "desc" },
  });

  const pdfArtifact = artifacts.find((a) => a.artifactType === "PDF");
  if (!pdfArtifact) {
    console.error("No PDF artifact found for this filing. Has the filing been downloaded?");
    process.exit(1);
  }

  console.log(`  Loading PDF from storage key: ${pdfArtifact.storageKey}`);
  const pdfBuffer = await artifactStorage.getArtifactBuffer(pdfArtifact.storageKey);

  // Re-run preflight (needed for unified doc construction)
  console.log("  Running preflight...");
  const preflight = await preflightAnnualReportDocument(pdfBuffer);
  console.log(
    `  Preflight done: hasTextLayer=${preflight.hasTextLayer}, hasReliableTextLayer=${preflight.hasReliableTextLayer}, pages=${preflight.pageCount}`,
  );

  // Build legacy candidates (empty — we don't re-run the primary extraction)
  // For a richer comparison, run extract:unified-financial-statements + compare:legacy-vs-unified CLI instead.
  const legacyCandidates: CanonicalFactCandidate[] = [];

  // Run shadow extraction
  console.log(`  Running unified shadow extraction (mode=${mode})...`);
  const result = await runAnnualReportUnifiedShadowExtraction({
    filingId: filingId!,
    companyId: filing.company.id,
    orgNumber: filing.company.orgNumber,
    fiscalYear: filing.fiscalYear,
    preflight,
    legacyCandidates,
    config,
    sourceCommand: "scripts/run-annual-report-unified-shadow.ts",
  });

  // ── Output ────────────────────────────────────────────────────────────────

  const output = {
    filingId: filingId!,
    orgNumber: filing.company.orgNumber,
    fiscalYear: filing.fiscalYear,
    mode: result.mode,
    skipped: result.skipped,
    canUseForProductionRouting: result.canUseForProductionRouting,
    totalDurationMs: result.totalDurationMs,
    steps: {
      document: result.steps.document,
      financial: result.steps.financial,
      narrative: result.steps.narrative,
      comparison: result.steps.comparison,
    },
    artifacts: result.artifacts,
    warnings: result.warnings,
    summary: {
      documentPageCount: result.document?.pages.length ?? null,
      documentSectionCount: result.document?.sections.length ?? null,
      financialLineItemCount: result.financial?.statements.flatMap((s) => s.lineItems).length ?? null,
      narrativeSectionCount: result.narrative?.sections.length ?? null,
      comparisonFactCount: result.comparison?.financialComparisons.length ?? null,
      comparisonMismatches: result.comparison?.summary.financialMismatchCount ?? null,
      comparisonExact: result.comparison?.summary.financialExactMatchCount ?? null,
    },
  };

  if (outputJson) {
    const json = JSON.stringify(output, null, 2);
    if (outputPath) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, json, "utf8");
      console.log(`\nResult written to: ${outputPath}`);
    } else {
      console.log("\n" + json);
    }
  } else {
    console.log("\n── Result ──────────────────────────────────────────────────");
    console.log(`  mode:               ${output.mode}`);
    console.log(`  skipped:            ${output.skipped}`);
    console.log(`  totalDurationMs:    ${output.totalDurationMs}`);
    console.log(`  document pages:     ${output.summary.documentPageCount ?? "n/a"}`);
    console.log(`  document sections:  ${output.summary.documentSectionCount ?? "n/a"}`);
    console.log(`  financial items:    ${output.summary.financialLineItemCount ?? "n/a"}`);
    console.log(`  narrative sections: ${output.summary.narrativeSectionCount ?? "n/a"}`);
    console.log(`  comparison facts:   ${output.summary.comparisonFactCount ?? "n/a"}`);
    console.log(`  comparison exact:   ${output.summary.comparisonExact ?? "n/a"}`);
    console.log(`  comparison mismatches: ${output.summary.comparisonMismatches ?? "n/a"}`);
    if (output.warnings.length > 0) {
      console.log(`  warnings (${output.warnings.length}):`);
      for (const w of output.warnings) {
        console.log(`    - ${w}`);
      }
    }
    console.log("\n  Steps:");
    for (const [stepName, stepResult] of Object.entries(output.steps)) {
      if (stepResult === null) {
        console.log(`    ${stepName}: skipped`);
      } else if (stepResult.ok) {
        console.log(`    ${stepName}: ok (${stepResult.durationMs}ms)`);
      } else {
        console.log(`    ${stepName}: FAILED — ${stepResult.error} (${stepResult.durationMs}ms)`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
