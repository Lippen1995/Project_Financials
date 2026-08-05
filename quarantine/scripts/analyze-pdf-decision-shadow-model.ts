import { writeFileSync } from "node:fs";

import {
  buildPdfDecisionShadowModelAnalysisReport,
  serializePdfDecisionShadowModelAnalysisReportAsJson,
  validatePdfDecisionShadowModelAnalysisReport,
  type PdfShadowModelBinaryMetrics,
  type PdfShadowModelCalibrationBucket,
} from "@/server/services/pdf-decision-shadow-model-analysis-service";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readNumberOption(prefix: string): number | undefined {
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readOption(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function fmt(value: number | null): string {
  return value == null ? "-" : `${(value * 100).toFixed(1)}%`;
}

function printMetrics(label: string, metrics: PdfShadowModelBinaryMetrics) {
  console.log(
    `  ${label}: precision=${fmt(metrics.precision)}  recall=${fmt(metrics.recall)}  f1=${fmt(metrics.f1)}  (n=${metrics.eligibleCount})`,
  );
}

function avgCalibrationError(buckets: PdfShadowModelCalibrationBucket[]): string {
  const nonEmpty = buckets.filter((b) => b.absoluteCalibrationError != null);
  if (nonEmpty.length === 0) return "-";
  const avg = nonEmpty.reduce((sum, b) => sum + b.absoluteCalibrationError!, 0) / nonEmpty.length;
  return avg.toFixed(4);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL is required.");
    process.exitCode = 1;
    return;
  }

  const limit = readNumberOption("--limit=") ?? 100;
  const fiscalYear = readNumberOption("--fiscalYear=");
  const orgNumber = readOption("--orgNumber=");
  const rawSplit = readOption("--split=");
  const split = rawSplit === "train" || rawSplit === "validation" || rawSplit === "test" || rawSplit === "all"
    ? rawSplit
    : "all";
  const threshold = readNumberOption("--threshold=") ?? 0.5;
  const maxExamples = Math.floor(readNumberOption("--maxExamples=") ?? 50);
  const outPath = readOption("--out=");

  const report = await buildPdfDecisionShadowModelAnalysisReport({
    limit,
    fiscalYear,
    orgNumber,
    split,
    threshold,
    maxExamples,
  });

  const { valid, issues } = validatePdfDecisionShadowModelAnalysisReport(report);
  if (!valid) {
    for (const issue of issues) console.warn(`  [WARN] ${issue}`);
  }

  if (hasFlag("--json") || outPath) {
    const json = serializePdfDecisionShadowModelAnalysisReportAsJson(report);
    if (outPath) {
      writeFileSync(outPath, json, "utf8");
      console.log(`Report written to ${outPath}`);
    }
    if (hasFlag("--json")) {
      console.log(json);
      return;
    }
    return;
  }

  // Human-readable output
  console.log("PDF Shadow Model Calibration Analysis");
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Records: ${report.recordCount}  |  Route-eligible: ${report.eligibleRouteCount}`);
  console.log(`Split: ${report.input.split}  |  Threshold: ${report.input.threshold}`);
  console.log();

  // Route confusion
  const cm = report.routeConfusionMatrix;
  if (cm.labels.length > 0) {
    console.log("Route Confusion Matrix:");
    const header = ["actual \\ predicted", ...cm.labels].map((l) => l.padEnd(24)).join("  ");
    console.log("  " + header);
    for (const actual of cm.labels) {
      const row = [actual, ...cm.labels.map((p) => String(cm.matrix[actual]?.[p] ?? 0))]
        .map((v) => v.padEnd(24))
        .join("  ");
      console.log("  " + row);
    }
    console.log();
  }

  // Binary metrics
  console.log("Binary Metrics:");
  printMetrics("Manual Review", report.manualReviewMetrics);
  printMetrics("Correction   ", report.correctionMetrics);
  printMetrics("Unreadable   ", report.unreadableMetrics);
  console.log();

  // Calibration summary
  console.log("Calibration (avg absolute error by probability):");
  console.log(`  Manual Review:  ${avgCalibrationError(report.calibration.manualReviewProbability)}`);
  console.log(`  Correction:     ${avgCalibrationError(report.calibration.correctionProbability)}`);
  console.log(`  Unreadable:     ${avgCalibrationError(report.calibration.unreadableProbability)}`);
  console.log(`  Publish:        ${avgCalibrationError(report.calibration.publishProbability)}`);
  console.log();

  // Top 5 slices by worst route accuracy
  const worstSlices = report.slices
    .filter((s) => s.routeAccuracy != null)
    .sort((a, b) => (a.routeAccuracy ?? 1) - (b.routeAccuracy ?? 1))
    .slice(0, 5);
  if (worstSlices.length > 0) {
    console.log("Worst Slices (by route accuracy):");
    for (const s of worstSlices) {
      console.log(
        `  [${s.key}=${s.value}]  n=${s.count}  route=${fmt(s.routeAccuracy)}  mr-f1=${fmt(s.manualReviewMetrics.f1)}`,
      );
    }
    console.log();
  }

  // Top errors
  if (report.topErrors.length > 0) {
    console.log(`Top Errors (${report.topErrors.length} shown):`);
    for (const e of report.topErrors.slice(0, 10)) {
      console.log(
        `  [${e.errorType}] ${e.filingId}  predicted=${e.predictedRoute}  actual=${e.actualRoute ?? "-"}  conf=${e.confidenceOverall.toFixed(3)}`,
      );
    }
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
