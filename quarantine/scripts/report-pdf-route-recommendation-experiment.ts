import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildPdfRouteRecommendationExperimentReport,
  serializePdfRouteRecommendationExperimentReport,
} from "@/server/services/pdf-route-recommendation-experiment-service";

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

function printRecord(title: string, record: Record<string, number>) {
  console.log(title);
  for (const [key, count] of Object.entries(record)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    console.log(`  ${key}: ${count}`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("report:pdf-route-experiment requires DATABASE_URL.");
  }
  const report = await buildPdfRouteRecommendationExperimentReport({
    limit: readNumberOption("--limit="),
    fiscalYear: readNumberOption("--fiscalYear="),
    orgNumber: readOption("--orgNumber="),
    includeLowPriority: hasFlag("--includeLowPriority"),
  });
  const json = serializePdfRouteRecommendationExperimentReport(report);
  const out = readOption("--out=");
  if (out) {
    writeFileSync(resolve(process.cwd(), out), `${json}\n`, "utf8");
    console.log(`Wrote PDF route recommendation experiment report to ${out}`);
    return;
  }
  if (hasFlag("--json")) {
    console.log(json);
    return;
  }

  console.log("PDF route recommendation experiment report");
  console.log(`Documents: ${report.totalDocuments}`);
  console.log(`Experiment candidates: ${report.experimentCandidateCount}`);
  printRecord("Recommendations:", report.recommendationDistribution);
  printRecord("Outcome bands:", report.outcomeBandDistribution);
  console.log("Top safe shadow experiments:");
  for (const item of report.items.filter((i) => i.safeToExperiment).slice(0, 10)) {
    console.log(
      `${item.filingId} ${item.suggestedExperiment} priority=${item.samplePriority} route=${item.evaluatedRecommendedRoute}`,
    );
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
