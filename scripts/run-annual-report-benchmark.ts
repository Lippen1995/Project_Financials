import fs from "node:fs/promises";
import path from "node:path";

import {
  AnnualReportBenchmarkRun,
  inspectOpenDataLoaderRuntime,
  loadAnnualReportBenchmarkCases,
  renderAnnualReportBenchmarkMarkdown,
  runAnnualReportBenchmarkCase,
  summarizeAnnualReportBenchmarkRun,
} from "@/server/benchmarking/annual-report-benchmark";

function parseArgs(argv: string[]) {
  const caseIds: string[] = [];
  let outputDir = path.join(process.cwd(), "output", "benchmarks", "annual-report-golden");

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--case" && argv[index + 1]) {
      caseIds.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--case=")) {
      caseIds.push(arg.slice("--case=".length));
      continue;
    }

    if (arg === "--output-dir" && argv[index + 1]) {
      outputDir = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--output-dir=")) {
      outputDir = path.resolve(process.cwd(), arg.slice("--output-dir=".length));
    }
  }

  return {
    caseIds,
    outputDir,
  };
}

async function main() {
  const { caseIds, outputDir } = parseArgs(process.argv.slice(2));
  const casesDirectory = path.join(
    process.cwd(),
    "benchmarks",
    "annual-report-golden",
    "cases",
  );

  const allCases = await loadAnnualReportBenchmarkCases(casesDirectory);
  const selectedCases =
    caseIds.length > 0
      ? allCases.filter((item) => caseIds.includes(item.id))
      : allCases;

  if (selectedCases.length === 0) {
    throw new Error(
      caseIds.length > 0
        ? `Fant ingen benchmark-caser for: ${caseIds.join(", ")}`
        : "Fant ingen benchmark-caser.",
    );
  }

  const runtimeEnvironment = await inspectOpenDataLoaderRuntime();
  const results = [];
  for (const benchmarkCase of selectedCases) {
    results.push(await runAnnualReportBenchmarkCase(benchmarkCase));
  }

  const run: AnnualReportBenchmarkRun = {
    generatedAt: new Date().toISOString(),
    cases: results,
    runtimeEnvironment,
    summary: summarizeAnnualReportBenchmarkRun({
      cases: results,
      runtimeEnvironment,
    }),
  };

  await fs.mkdir(outputDir, { recursive: true });
  const stamp = run.generatedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(outputDir, `annual-report-benchmark-${stamp}.json`);
  const markdownPath = path.join(outputDir, `annual-report-benchmark-${stamp}.md`);
  const latestJsonPath = path.join(outputDir, "latest.json");
  const latestMarkdownPath = path.join(outputDir, "latest.md");

  const jsonContent = JSON.stringify(run, null, 2);
  const markdownContent = renderAnnualReportBenchmarkMarkdown(run);

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
  console.error(
    error instanceof Error
      ? error.message
      : "Kunne ikke kjore annual-report benchmark.",
  );
  process.exitCode = 1;
});
