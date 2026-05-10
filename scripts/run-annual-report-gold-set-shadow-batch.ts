import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

import {
  parseAnnualReportGoldSetManifest,
} from "@/server/benchmarking/annual-report-gold-set";
import {
  renderAnnualReportGoldSetShadowRunMarkdown,
  runAnnualReportGoldSetShadowBatch,
} from "@/server/benchmarking/annual-report-gold-set-shadow-run";
import { readFlag } from "@/scripts/financial-script-utils";

function readGitCommitSha() {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const manifestPath =
    readFlag("manifest") ??
    path.join(process.cwd(), "output", "benchmarks", "annual-report-gold-set", "gold-set.json");
  const outputDir =
    readFlag("output-dir") ??
    path.join(process.cwd(), "output", "benchmarks", "annual-report-gold-set-shadow-runs");

  const manifest = parseAnnualReportGoldSetManifest(
    JSON.parse(await fs.readFile(path.resolve(process.cwd(), manifestPath), "utf8")),
  );

  const run = await runAnnualReportGoldSetShadowBatch({
    manifest,
    gitCommitSha: readGitCommitSha(),
    mode: "PERSIST_ARTIFACTS",
    persistShadowArtifacts: true,
    persistConfidenceGateArtifacts: true,
  });
  const markdown = renderAnnualReportGoldSetShadowRunMarkdown(run);
  const json = JSON.stringify(run, null, 2);
  const stamp = run.generatedAt.replace(/[:.]/g, "-");

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, `${stamp}.json`), json, "utf8");
  await fs.writeFile(path.join(outputDir, `${stamp}.md`), markdown, "utf8");
  await fs.writeFile(path.join(outputDir, "latest.json"), json, "utf8");
  await fs.writeFile(path.join(outputDir, "latest.md"), markdown, "utf8");

  console.log(markdown);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
