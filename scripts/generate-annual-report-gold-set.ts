import fs from "node:fs/promises";
import path from "node:path";

import {
  generateRepresentativeAnnualReportGoldSetManifest,
  renderAnnualReportGoldSetManifestMarkdown,
  validateAnnualReportGoldSetManifest,
} from "@/server/benchmarking/annual-report-gold-set";
import { readFlag, readNumberFlag } from "@/scripts/financial-script-utils";

async function main() {
  const outputDir =
    readFlag("output-dir") ??
    path.join(process.cwd(), "output", "benchmarks", "annual-report-gold-set");
  const name = readFlag("name") ?? "annual-report-go-live-gold-set";
  const limitPerTag = readNumberFlag("limit-per-tag") ?? 1;

  const manifest = await generateRepresentativeAnnualReportGoldSetManifest({
    name,
    limitPerTag,
  });
  const validation = validateAnnualReportGoldSetManifest(manifest);
  const markdown = renderAnnualReportGoldSetManifestMarkdown(manifest, validation);
  const json = JSON.stringify(manifest, null, 2);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "gold-set.json"), json, "utf8");
  await fs.writeFile(path.join(outputDir, "gold-set.md"), markdown, "utf8");

  console.log(markdown);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
