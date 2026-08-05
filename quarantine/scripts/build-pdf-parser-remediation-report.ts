import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildPdfParserRemediationReport } from "@/server/services/pdf-parser-remediation-report-service";

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

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("report:pdf-parser-remediation requires DATABASE_URL.");
  }
  const report = await buildPdfParserRemediationReport({
    limit: readNumberOption("--limit="),
    fiscalYear: readNumberOption("--fiscalYear="),
    orgNumber: readOption("--orgNumber="),
    maxExamplesPerCluster: readNumberOption("--maxExamples="),
  });
  const output = readOption("--out=");
  const json = JSON.stringify(report, null, 2);
  if (output) {
    writeFileSync(resolve(process.cwd(), output), `${json}\n`, "utf8");
    console.log(`Wrote PDF parser remediation report to ${output}`);
    return;
  }
  if (hasFlag("--json")) {
    console.log(json);
    return;
  }
  console.log("PDF parser remediation report");
  console.log(`Documents: ${report.totalDocuments}`);
  console.log(`Source clusters: ${report.sourceClusterCount}`);
  console.log(`Items: ${report.itemCount}`);
  for (const item of report.items.slice(0, 10)) {
    console.log(
      `[${item.priority}] ${item.workstream} docs=${item.documentCount} action=${item.recommendedAction}`,
    );
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
