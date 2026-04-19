import fs from "node:fs/promises";
import path from "node:path";

import {
  AnnualReportBenchmarkRun,
  renderAnnualReportBenchmarkMarkdown,
} from "@/server/benchmarking/annual-report-benchmark";

async function main() {
  const inputPath =
    process.argv[2] ??
    path.join(
      process.cwd(),
      "output",
      "benchmarks",
      "annual-report-golden",
      "latest.json",
    );

  const absolutePath = path.resolve(process.cwd(), inputPath);
  const run = JSON.parse(
    await fs.readFile(absolutePath, "utf8"),
  ) as AnnualReportBenchmarkRun;

  console.log(renderAnnualReportBenchmarkMarkdown(run));
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Kunne ikke oppsummere annual-report benchmark.",
  );
  process.exitCode = 1;
});
