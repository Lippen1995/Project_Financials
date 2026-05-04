import {
  buildPdfDecisionOutcomeDataset,
  serializePdfDecisionOutcomeDatasetJsonl,
  writePdfDecisionOutcomeDataset,
} from "@/server/services/pdf-decision-outcome-dataset-service";

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
  const json = hasFlag("--json");
  const dataset = await buildPdfDecisionOutcomeDataset({
    limit: readNumberOption("--limit="),
    fiscalYear: readNumberOption("--fiscalYear="),
    orgNumber: readOption("--orgNumber="),
    includeText: hasFlag("--includeText"),
  });

  if (outputPath) {
    writePdfDecisionOutcomeDataset(dataset, outputPath, json ? "json" : "jsonl");
    console.log(`Wrote PDF Decision outcome dataset to ${outputPath}`);
    return;
  }

  if (json) {
    console.log(JSON.stringify(dataset.records, null, 2));
  } else {
    console.log(serializePdfDecisionOutcomeDatasetJsonl(dataset));
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
