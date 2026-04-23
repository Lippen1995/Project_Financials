import fs from "node:fs/promises";
import path from "node:path";

import {
  parseAnnualReportShadowBatchManifest,
  renderAnnualReportShadowBatchMarkdown,
  runAnnualReportShadowBatch,
} from "@/server/benchmarking/annual-report-shadow-batch";
import { readFlag } from "@/scripts/financial-script-utils";

async function main() {
  const manifestPath =
    readFlag("manifest") ??
    path.join(
      process.cwd(),
      "output",
      "benchmarks",
      "annual-report-shadow-batches",
      "selected-manifest.json",
    );
  const outputDir =
    readFlag("output-dir") ??
    path.join(
      process.cwd(),
      "output",
      "benchmarks",
      "annual-report-shadow-batches",
    );

  const absoluteManifestPath = path.resolve(process.cwd(), manifestPath);
  const manifest = parseAnnualReportShadowBatchManifest(
    JSON.parse(await fs.readFile(absoluteManifestPath, "utf8")),
  );
  const run = await runAnnualReportShadowBatch(manifest);

  await fs.mkdir(outputDir, { recursive: true });
  const stamp = run.generatedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(outputDir, `shadow-batch-${stamp}.json`);
  const markdownPath = path.join(outputDir, `shadow-batch-${stamp}.md`);
  const latestJsonPath = path.join(outputDir, "latest.json");
  const latestMarkdownPath = path.join(outputDir, "latest.md");

  const jsonContent = JSON.stringify(run, null, 2);
  const markdownContent = renderAnnualReportShadowBatchMarkdown(run);

  await fs.writeFile(jsonPath, jsonContent, "utf8");
  await fs.writeFile(markdownPath, markdownContent, "utf8");
  await fs.writeFile(latestJsonPath, jsonContent, "utf8");
  await fs.writeFile(latestMarkdownPath, markdownContent, "utf8");

  console.log(markdownContent);
  console.log("");
  console.log(`JSON artifact: ${jsonPath}`);
  console.log(`Markdown summary: ${markdownPath}`);
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : "Kunne ikke kjore annual-report shadow batch.";
  if (
    message.includes("AnnualReportFiling") &&
    message.includes("does not exist")
  ) {
    console.error(
      "Annual-report shadow batch run requires a database with the annual-report ingestion tables. Kjor Prisma-migrasjonene / db push mot riktig database for du evaluerer reelle filings.",
    );
    process.exitCode = 1;
    return;
  }

  console.error(
    message,
  );
  process.exitCode = 1;
});
