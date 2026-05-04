import { readFileSync } from "node:fs";

import {
  buildPdfDecisionOutcomeDataset,
  type PdfDecisionOutcomeDataset,
} from "@/server/services/pdf-decision-outcome-dataset-service";
import {
  evaluatePdfDecisionDatasetQuality,
  validatePdfDecisionDatasetForMlReadiness,
} from "@/server/services/pdf-decision-dataset-quality-service";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readOption(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function readNumberOption(prefix: string): number | undefined {
  const value = readOption(prefix);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

async function loadDataset(): Promise<PdfDecisionOutcomeDataset> {
  const inPath = readOption("--in=");
  if (inPath) {
    const raw = readFileSync(inPath, "utf8");
    return JSON.parse(raw) as PdfDecisionOutcomeDataset;
  }
  return buildPdfDecisionOutcomeDataset({
    limit: readNumberOption("--limit="),
    fiscalYear: readNumberOption("--fiscalYear="),
    orgNumber: readOption("--orgNumber="),
  });
}

async function main() {
  const dataset = await loadDataset();
  const json = hasFlag("--json");
  const { ready, report } = validatePdfDecisionDatasetForMlReadiness(dataset);

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = ready ? 0 : 1;
    return;
  }

  console.log(`PDF Decision dataset quality report`);
  console.log(`Records: ${report.recordCount}`);
  console.log(`Issues: ${report.issueCount} (errors: ${report.errorCount}, warnings: ${report.warningCount})`);
  console.log(`ML-ready: ${ready ? "YES" : "NO"}`);
  console.log();

  if (report.issues.length > 0) {
    console.log("Issues:");
    for (const issue of report.issues) {
      const loc = issue.filingId ? ` [${issue.filingId}]` : "";
      console.log(`  [${issue.severity}] ${issue.code}${loc}: ${issue.message}`);
    }
    console.log();
  }

  console.log("Distributions:");
  for (const [dim, counts] of Object.entries(report.distributions)) {
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    console.log(`  ${dim}: ${entries.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }

  const _ = evaluatePdfDecisionDatasetQuality(dataset);
  process.exitCode = ready ? 0 : 1;
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
