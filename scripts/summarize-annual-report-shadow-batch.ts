import fs from "node:fs/promises";
import path from "node:path";

import {
  AnnualReportShadowBatchRun,
  renderAnnualReportShadowBatchMarkdown,
} from "@/server/benchmarking/annual-report-shadow-batch";

async function main() {
  const inputPath =
    process.argv[2] ??
    path.join(
      process.cwd(),
      "output",
      "benchmarks",
      "annual-report-shadow-batches",
      "latest.json",
    );

  const absolutePath = path.resolve(process.cwd(), inputPath);
  const run = JSON.parse(
    await fs.readFile(absolutePath, "utf8"),
  ) as AnnualReportShadowBatchRun;

  console.log(renderAnnualReportShadowBatchMarkdown(run));
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Kunne ikke oppsummere annual-report shadow batch.",
  );
  process.exitCode = 1;
});
