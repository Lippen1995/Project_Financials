import fs from "node:fs/promises";
import path from "node:path";

import {
  buildUnifiedConfidenceThresholdCalibrationReport,
  persistUnifiedConfidenceThresholdCalibrationArtifacts,
} from "@/server/services/annual-report-unified-confidence-calibration-service";
import { readFlag } from "@/scripts/financial-script-utils";

type CliOptions = {
  runId?: string;
  includeUnreviewed: boolean;
  outputJson: boolean;
  outputPath?: string;
};

function hasBooleanFlag(name: string) {
  return process.argv.slice(2).includes(`--${name}`);
}

function parseCliOptions(): CliOptions {
  return {
    runId: readFlag("run-id"),
    includeUnreviewed: hasBooleanFlag("include-unreviewed"),
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
    `${timestamp}.json`,
  );
}

async function main() {
  const options = parseCliOptions();
  const report = await buildUnifiedConfidenceThresholdCalibrationReport({
    runId: options.runId,
    includeUnreviewed: options.includeUnreviewed,
    generatedBy: "scripts/calibrate-unified-extraction-confidence.ts",
  });

  const outputPath = path.resolve(process.cwd(), options.outputPath ?? defaultOutputPath());
  const markdownPath = outputPath.replace(/\.json$/i, ".md");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(
    markdownPath,
    [
      "# Unified confidence calibration",
      "",
      `Primary JSON output: ${outputPath}`,
      `Latest persisted report: ${report.output.jsonPath}`,
      "",
    ].join("\n"),
    "utf8",
  );
  await persistUnifiedConfidenceThresholdCalibrationArtifacts(report);

  if (options.outputJson) {
    console.log(JSON.stringify(report, null, 2));
  }

  console.log(`Source run: ${report.sourceRun.runId ?? "unknown"}`);
  console.log(`Reviewed cases: ${report.metrics.totalReviewedCases}`);
  console.log(`False pass count: ${report.metrics.falsePassCount}`);
  console.log(`False review count: ${report.metrics.falseReviewCount}`);
  console.log(`High severity miss count: ${report.metrics.highSeverityMissCount}`);
  console.log(
    `Calibration status: ${report.thresholdBehavior.after.status}`,
  );
  console.log(
    `Distribution before/after: PASS ${report.thresholdBehavior.before.distribution.PASS}->${report.thresholdBehavior.after.distribution.PASS}, WARN ${report.thresholdBehavior.before.distribution.WARN}->${report.thresholdBehavior.after.distribution.WARN}, FAIL ${report.thresholdBehavior.before.distribution.FAIL}->${report.thresholdBehavior.after.distribution.FAIL}`,
  );
  console.log(`Output: ${outputPath}`);
  console.log(`Markdown: ${markdownPath}`);
  console.log(`Latest persisted report: ${report.output.jsonPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
