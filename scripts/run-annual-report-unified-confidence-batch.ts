import fs from "node:fs/promises";
import path from "node:path";

import { selectAnnualReportShadowBatchManifest } from "@/server/benchmarking/annual-report-shadow-batch";
import {
  parseAnnualReportUnifiedConfidenceBatchManifest,
  runAnnualReportUnifiedConfidenceBatch,
  type AnnualReportUnifiedConfidenceBatchManifest,
} from "@/server/benchmarking/annual-report-unified-confidence-batch";
import { readFlag, readListFlag, readNumberFlag } from "@/scripts/financial-script-utils";

type CliOptions = {
  manifestPath?: string;
  filingIds?: string[];
  orgNumbers?: string[];
  fiscalYearFrom?: number;
  fiscalYearTo?: number;
  limit: number;
  mode: "DRY_RUN" | "PERSIST_ARTIFACTS";
  persistShadowArtifacts: boolean;
  persistConfidenceGateArtifacts: boolean;
  outputJson: boolean;
  outputPath?: string;
};

function hasBooleanFlag(name: string) {
  return process.argv.slice(2).includes(`--${name}`);
}

function parseCliOptions(): CliOptions {
  const modeFlag = readFlag("mode");
  const mode =
    modeFlag === "PERSIST_ARTIFACTS" || modeFlag === "DRY_RUN"
      ? modeFlag
      : "DRY_RUN";
  const persistShadowArtifacts = hasBooleanFlag("persist-shadow-artifacts");
  const persistConfidenceGateArtifacts = hasBooleanFlag("persist-confidence-gate-artifacts");

  if (
    mode !== "PERSIST_ARTIFACTS" &&
    (persistShadowArtifacts || persistConfidenceGateArtifacts)
  ) {
    throw new Error(
      "--persist-shadow-artifacts and --persist-confidence-gate-artifacts require --mode=PERSIST_ARTIFACTS.",
    );
  }

  return {
    manifestPath: readFlag("manifest"),
    filingIds: readListFlag("filing-ids"),
    orgNumbers: readListFlag("org-numbers"),
    fiscalYearFrom: readNumberFlag("fiscal-year-from"),
    fiscalYearTo: readNumberFlag("fiscal-year-to"),
    limit: readNumberFlag("limit") ?? 20,
    mode,
    persistShadowArtifacts,
    persistConfidenceGateArtifacts,
    outputJson: hasBooleanFlag("json"),
    outputPath: readFlag("out"),
  };
}

async function loadManifest(options: CliOptions): Promise<AnnualReportUnifiedConfidenceBatchManifest> {
  if (options.manifestPath) {
    const manifestJson = await fs.readFile(path.resolve(process.cwd(), options.manifestPath), "utf8");
    return parseAnnualReportUnifiedConfidenceBatchManifest(JSON.parse(manifestJson));
  }

  const selectedManifest = await selectAnnualReportShadowBatchManifest({
    filingIds: options.filingIds,
    orgNumbers: options.orgNumbers,
    fiscalYearFrom: options.fiscalYearFrom,
    fiscalYearTo: options.fiscalYearTo,
    limit: options.limit,
    onlyLatest: true,
    requirePdfArtifact: true,
  });

  return parseAnnualReportUnifiedConfidenceBatchManifest(selectedManifest);
}

function defaultOutputPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(
    process.cwd(),
    "output",
    "benchmarks",
    "annual-report-unified-confidence-batches",
    `${timestamp}-report.json`,
  );
}

function formatTopChecks(values: Array<{ checkCode: string; count: number }>) {
  if (values.length === 0) {
    return "none";
  }
  return values
    .slice(0, 5)
    .map((value) => `${value.checkCode} (${value.count})`)
    .join(", ");
}

async function main() {
  const options = parseCliOptions();
  const manifest = await loadManifest(options);
  const run = await runAnnualReportUnifiedConfidenceBatch({
    manifest,
    mode: options.mode,
    persistShadowArtifacts: options.persistShadowArtifacts,
    persistConfidenceGateArtifacts: options.persistConfidenceGateArtifacts,
    limit: options.limit,
    sourceCommand: "scripts/run-annual-report-unified-confidence-batch.ts",
  });

  const outputPath = path.resolve(process.cwd(), options.outputPath ?? defaultOutputPath());
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(run, null, 2), "utf8");

  if (options.outputJson) {
    console.log(JSON.stringify(run, null, 2));
  }

  console.log(`Cases: ${run.summary.totalCases}`);
  console.log(
    `Completed/skipped/error: ${run.summary.completedCases}/${run.summary.skippedCases}/${run.summary.errorCases}`,
  );
  console.log(
    `Verdicts: PASS=${run.summary.verdictCounts.PASS}, WARN=${run.summary.verdictCounts.WARN}, FAIL=${run.summary.verdictCounts.FAIL}, INSUFFICIENT_DATA=${run.summary.verdictCounts.INSUFFICIENT_DATA}`,
  );
  console.log(`Top failing checks: ${formatTopChecks(run.summary.mostCommonFailingChecks)}`);
  console.log(`Top warning checks: ${formatTopChecks(run.summary.mostCommonWarningChecks)}`);
  console.log(`Output: ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
