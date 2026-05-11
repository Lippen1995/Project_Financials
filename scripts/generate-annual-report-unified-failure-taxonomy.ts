import fs from "node:fs/promises";
import path from "node:path";

import {
  buildAnnualReportUnifiedFailureTaxonomyReport,
  persistAnnualReportUnifiedFailureTaxonomyArtifacts,
} from "@/server/services/annual-report-unified-failure-taxonomy-service";
import { readFlag } from "@/scripts/financial-script-utils";

function hasBooleanFlag(name: string) {
  return process.argv.slice(2).includes(`--${name}`);
}

function defaultOutputPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(
    process.cwd(),
    "output",
    "benchmarks",
    "annual-report-unified-failure-taxonomy",
    `${timestamp}.json`,
  );
}

async function main() {
  const runId = readFlag("run-id");
  const outputJson = hasBooleanFlag("json");
  const outputPath = path.resolve(process.cwd(), readFlag("out") ?? defaultOutputPath());
  const markdownPath = outputPath.replace(/\.json$/i, ".md");

  const report = await buildAnnualReportUnifiedFailureTaxonomyReport({
    runId,
    generatedBy: "scripts/generate-annual-report-unified-failure-taxonomy.ts",
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(
    markdownPath,
    [
      "# Unified failure taxonomy",
      "",
      `Primary JSON output: ${outputPath}`,
      `Latest persisted report: ${report.output.jsonPath}`,
      "",
    ].join("\n"),
    "utf8",
  );

  await persistAnnualReportUnifiedFailureTaxonomyArtifacts(report);

  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
  }

  console.log(`Review round: ${report.sourceRun.reviewRoundId ?? "unknown"}`);
  console.log(`Mapped issues: ${report.summary.totalMappedIssues}`);
  console.log(`High severity issues: ${report.summary.highSeverityIssueCount}`);
  console.log(
    `Top issue class: ${report.summary.issueClassCounts[0]?.issueClass ?? "none"}`,
  );
  console.log(`Output: ${outputPath}`);
  console.log(`Markdown: ${markdownPath}`);
  console.log(`Latest persisted report: ${report.output.jsonPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

