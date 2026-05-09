import fs from "node:fs/promises";
import path from "node:path";

import {
  buildUnifiedConfidenceThresholdCalibrationReport,
} from "@/server/services/annual-report-unified-confidence-calibration-service";
import { readFlag, readListFlag, readNumberFlag } from "@/scripts/financial-script-utils";

type CliOptions = {
  fiscalYearFrom?: number;
  fiscalYearTo?: number;
  orgNumbers?: string[];
  verdicts?: Array<"PASS" | "WARN" | "FAIL" | "INSUFFICIENT_DATA">;
  minReviewedCases?: number;
  includeUnreviewed: boolean;
  limit?: number;
  outputJson: boolean;
  outputPath?: string;
};

function hasBooleanFlag(name: string) {
  return process.argv.slice(2).includes(`--${name}`);
}

function parseVerdicts() {
  const values = readListFlag("verdicts");
  if (!values) {
    return undefined;
  }

  return values.filter(
    (value): value is "PASS" | "WARN" | "FAIL" | "INSUFFICIENT_DATA" =>
      value === "PASS" ||
      value === "WARN" ||
      value === "FAIL" ||
      value === "INSUFFICIENT_DATA",
  );
}

function parseCliOptions(): CliOptions {
  return {
    fiscalYearFrom: readNumberFlag("fiscal-year-from"),
    fiscalYearTo: readNumberFlag("fiscal-year-to"),
    orgNumbers: readListFlag("org-numbers"),
    verdicts: parseVerdicts(),
    minReviewedCases: readNumberFlag("min-reviewed-cases"),
    includeUnreviewed: hasBooleanFlag("include-unreviewed"),
    limit: readNumberFlag("limit"),
    outputJson: hasBooleanFlag("json"),
    outputPath: readFlag("out"),
  };
}

function defaultOutputPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(
    process.cwd(),
    "output",
    "benchmarks",
    "annual-report-unified-confidence-calibration",
    `${timestamp}-report.json`,
  );
}

function summarizeRecommendations(
  recommendations: Awaited<ReturnType<typeof buildUnifiedConfidenceThresholdCalibrationReport>>["proposedThresholdAdjustments"],
  kind: "RELAX" | "TIGHTEN" | "NEEDS_MORE_DATA",
) {
  const matches = recommendations.filter((item) => item.recommendation === kind);
  if (matches.length === 0) {
    return "none";
  }
  return matches
    .slice(0, 5)
    .map((item) => `${item.checkCode} (${item.sampleSize})`)
    .join(", ");
}

async function main() {
  const options = parseCliOptions();
  const report = await buildUnifiedConfidenceThresholdCalibrationReport({
    fiscalYearFrom: options.fiscalYearFrom,
    fiscalYearTo: options.fiscalYearTo,
    orgNumbers: options.orgNumbers,
    verdicts: options.verdicts,
    minReviewedCases: options.minReviewedCases,
    includeUnreviewed: options.includeUnreviewed,
    limit: options.limit,
    generatedBy: "scripts/calibrate-unified-extraction-confidence.ts",
  });

  const outputPath = path.resolve(process.cwd(), options.outputPath ?? defaultOutputPath());
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");

  if (options.outputJson) {
    console.log(JSON.stringify(report, null, 2));
  }

  console.log(`Total gate artifacts: ${report.sampleSummary.totalGateArtifacts}`);
  console.log(`Reviewed cases: ${report.sampleSummary.reviewedCases}`);
  console.log(
    `Accepted/rejected/corrected: ${report.sampleSummary.acceptedCases}/${report.sampleSummary.rejectedCases}/${report.sampleSummary.correctedCases}`,
  );
  console.log(
    `Top checks to tighten: ${summarizeRecommendations(report.proposedThresholdAdjustments, "TIGHTEN")}`,
  );
  console.log(
    `Top checks to relax: ${summarizeRecommendations(report.proposedThresholdAdjustments, "RELAX")}`,
  );
  console.log(
    `Checks needing more data: ${summarizeRecommendations(report.proposedThresholdAdjustments, "NEEDS_MORE_DATA")}`,
  );
  console.log(`Output: ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
