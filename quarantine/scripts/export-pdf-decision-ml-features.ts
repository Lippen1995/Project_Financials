import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildPdfDecisionMlFeatureDataset,
  PDF_DECISION_ML_FEATURE_SCHEMA,
  serializePdfDecisionMlFeatureDatasetAsJson,
  serializePdfDecisionMlFeatureDatasetAsJsonl,
} from "@/server/services/pdf-decision-ml-feature-schema-service";

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
  const outputPath = readOption("--out=");
  if (hasFlag("--schema")) {
    const schema = JSON.stringify(PDF_DECISION_ML_FEATURE_SCHEMA, null, 2);
    if (outputPath) {
      writeFileSync(resolve(process.cwd(), outputPath), `${schema}\n`, "utf8");
      console.log(`Wrote PDF Decision ML feature schema to ${outputPath}`);
      return;
    }
    console.log(schema);
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("export:pdf-decision-ml-features requires DATABASE_URL.");
  }

  const dataset = await buildPdfDecisionMlFeatureDataset({
    limit: readNumberOption("--limit="),
    fiscalYear: readNumberOption("--fiscalYear="),
    orgNumber: readOption("--orgNumber="),
    includeSplits: !hasFlag("--noSplits"),
    splitSeed: readOption("--splitSeed="),
  });
  const content = hasFlag("--json")
    ? serializePdfDecisionMlFeatureDatasetAsJson(dataset)
    : serializePdfDecisionMlFeatureDatasetAsJsonl(dataset);
  if (outputPath) {
    writeFileSync(resolve(process.cwd(), outputPath), `${content}\n`, "utf8");
    console.log(`Wrote PDF Decision ML features to ${outputPath}`);
    return;
  }
  console.log(content);
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
