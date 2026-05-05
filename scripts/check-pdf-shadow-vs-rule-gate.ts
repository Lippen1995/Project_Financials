import { writeFileSync } from "node:fs";

import {
  buildPdfShadowVsRuleComparisonGateReport,
  validatePdfShadowVsRuleComparisonGateReport,
  serializePdfShadowVsRuleComparisonGateReportAsJson,
} from "@/server/services/pdf-shadow-vs-rule-comparison-gate-service";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readOption(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function fmtPct(value?: number | null): string {
  return value == null ? "-" : `${(value * 100).toFixed(1)}%`;
}

function fmtNum(value?: number | null): string {
  return value == null ? "-" : value.toFixed(4);
}

async function main() {
  const limit = readOption("--limit=");
  const fiscalYear = readOption("--fiscalYear=");
  const orgNumber = readOption("--orgNumber=");
  const split = readOption("--split=") as "train" | "validation" | "test" | "all" | undefined;
  const minRecordCount = readOption("--minRecordCount=");
  const outPath = readOption("--out=");
  const strict = hasFlag("--strict");

  const report = await buildPdfShadowVsRuleComparisonGateReport({
    limit: limit ? parseInt(limit, 10) : undefined,
    fiscalYear: fiscalYear ? parseInt(fiscalYear, 10) : undefined,
    orgNumber: orgNumber || undefined,
    split: split || undefined,
    minRecordCount: minRecordCount ? parseInt(minRecordCount, 10) : undefined,
  });

  const { valid, issues } = validatePdfShadowVsRuleComparisonGateReport(report);

  if (hasFlag("--json")) {
    const json = serializePdfShadowVsRuleComparisonGateReportAsJson(report);
    if (outPath) {
      writeFileSync(outPath, json, "utf8");
      console.log(`Written to ${outPath}`);
    }
    console.log(json);
    if (!valid) process.exitCode = 1;
    if (strict && report.status !== "PASS") process.exitCode = 1;
    return;
  }

  console.log("PDF Shadow-vs-Rule Comparison Gate");
  console.log(`  Generated at:  ${report.generatedAt}`);
  console.log(`  Status:        ${report.status}`);
  console.log(`  Records:       ${report.summary.recordCount}`);
  console.log();

  console.log("  Summary:");
  console.log(`    Disagreements:           ${report.summary.disagreementCount}`);
  console.log(`    High-severity:           ${report.summary.highSeverityDisagreementCount}`);
  console.log(`    Shadow more conservative: ${report.summary.shadowMoreConservativeCount}`);
  console.log(`    Shadow less conservative: ${report.summary.shadowLessConservativeCount}`);
  console.log(`    Publish safety concerns: ${report.summary.publishSafetyConcernCount}`);
  console.log(`    MR safety concerns:      ${report.summary.manualReviewSafetyConcernCount}`);
  console.log();

  console.log("  Metrics:");
  console.log(`    Route accuracy:      ${fmtPct(report.metrics.shadowRouteAccuracy)}`);
  console.log(`    MR recall:           ${fmtPct(report.metrics.shadowManualReviewRecall)}`);
  console.log(`    Unreadable recall:   ${fmtPct(report.metrics.shadowUnreadableRecall)}`);
  console.log(`    Publish precision:   ${fmtPct(report.metrics.shadowPublishPrecision)}`);
  console.log(`    Calibration error:   ${fmtNum(report.metrics.calibrationErrorApprox)}`);
  console.log();

  console.log("  Checks:");
  for (const check of report.checks) {
    const obs = check.observedValue != null ? ` (observed=${check.observedValue})` : "";
    console.log(`    [${check.status.padEnd(17)}] ${check.code}${obs}`);
    console.log(`                          ${check.message}`);
  }

  if (!valid) {
    console.log();
    console.error(`Report validation FAILED (${issues.length} issue${issues.length === 1 ? "" : "s"}):`);
    for (const issue of issues) {
      console.error(`  - ${issue}`);
    }
  }

  if (outPath) {
    writeFileSync(outPath, serializePdfShadowVsRuleComparisonGateReportAsJson(report), "utf8");
    console.log(`\nWritten to ${outPath}`);
  }

  if (!valid) {
    process.exitCode = 1;
    return;
  }

  if (strict && report.status !== "PASS") {
    console.log(`\nStrict mode: gate status is ${report.status} — exiting with error.`);
    process.exitCode = 1;
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
