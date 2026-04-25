import fs from "node:fs/promises";
import path from "node:path";

import {
  buildBaselineAnnualReportShadowBatchManifest,
  parseAnnualReportShadowBatchManifest,
  renderAnnualReportShadowBatchMarkdown,
  runAnnualReportShadowBatch,
} from "@/server/benchmarking/annual-report-shadow-batch";
import { inspectOpenDataLoaderBaselinePreflight } from "@/server/document-understanding/opendataloader-baseline-preflight";
import { readFlag, readListFlag } from "@/scripts/financial-script-utils";

async function main() {
  const orgNumber = readFlag("org-number");
  const fiscalYears =
    readListFlag("years")?.map((value) => Number(value)).filter(Number.isInteger) ??
    undefined;
  const outputDir =
    readFlag("output-dir") ??
    path.join(
      process.cwd(),
      "output",
      "benchmarks",
      "annual-report-shadow-batches",
    );
  const skipPreflight = readFlag("skip-preflight") === "true";

  if (!skipPreflight) {
    const preflight = await inspectOpenDataLoaderBaselinePreflight();
    if (!preflight.ready) {
      console.error(
        JSON.stringify(
          {
            error:
              "Baseline OCR shadow batch preflight failed. Fix runtime mismatch before rerunning.",
            checks: preflight.checks,
            guidance: preflight.guidance,
            activeJava: preflight.runtime.java,
            hybridHealth: {
              errorType: preflight.hybridHealth.errorType,
              reason: preflight.hybridHealth.reason,
              httpProbe: preflight.hybridHealth.httpProbe,
              compatibilityProbe: preflight.hybridHealth.compatibilityProbe,
            },
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
      return;
    }
  }

  const manifest = parseAnnualReportShadowBatchManifest(
    await buildBaselineAnnualReportShadowBatchManifest({
      orgNumber: orgNumber ?? undefined,
      fiscalYears,
      name: readFlag("name"),
    }),
  );

  const run = await runAnnualReportShadowBatch(manifest);

  await fs.mkdir(outputDir, { recursive: true });
  const stamp = run.generatedAt.replace(/[:.]/g, "-");
  const prefix = `baseline-shadow-batch-${manifest.selection?.baselineOrgNumber ?? orgNumber ?? "default"}-${stamp}`;
  const jsonPath = path.join(outputDir, `${prefix}.json`);
  const markdownPath = path.join(outputDir, `${prefix}.md`);
  const latestJsonPath = path.join(outputDir, "latest-baseline.json");
  const latestMarkdownPath = path.join(outputDir, "latest-baseline.md");

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
    error instanceof Error
      ? error.message
      : "Kunne ikke kjore baseline OCR shadow batch.";
  console.error(message);
  process.exitCode = 1;
});
