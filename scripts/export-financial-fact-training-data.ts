import fs from "node:fs/promises";
import path from "node:path";

import {
  exportFinancialFactDataset,
  serializeDatasetAsJsonl,
} from "@/server/services/training-data-export-service";

function readFlag(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main() {
  const outputDir = path.resolve(
    process.cwd(),
    readFlag("output-dir") ?? path.join("output", "ml-datasets", "financial-facts"),
  );

  const dataset = await exportFinancialFactDataset();
  const { trainJsonl, validationJsonl, testJsonl } = serializeDatasetAsJsonl(dataset);

  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDir, "train.jsonl"), trainJsonl, "utf8"),
    fs.writeFile(path.join(outputDir, "validation.jsonl"), validationJsonl, "utf8"),
    fs.writeFile(path.join(outputDir, "test.jsonl"), testJsonl, "utf8"),
    fs.writeFile(
      path.join(outputDir, "manifest.json"),
      JSON.stringify(
        {
          taskType: "FINANCIAL_FACT_EXTRACTOR",
          registryTaskType: dataset.taskType,
          generatedAt: dataset.generatedAt,
          totalExamples: dataset.totalExamples,
          trainSize: dataset.train.length,
          validationSize: dataset.validation.length,
          testSize: dataset.test.length,
          labelDistribution: dataset.labelDistribution,
          featureText: "features.factContextText",
        },
        null,
        2,
      ),
      "utf8",
    ),
  ]);

  console.log(
    `Wrote financial fact dataset to ${outputDir} ` +
      `(train=${dataset.train.length}, validation=${dataset.validation.length}, test=${dataset.test.length})`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
