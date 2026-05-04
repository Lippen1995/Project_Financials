import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildPdfDecisionOutcomeDataset,
  type PdfDecisionOutcomeDataset,
} from "@/server/services/pdf-decision-outcome-dataset-service";
import { splitPdfDecisionOutcomeDataset } from "@/server/services/pdf-decision-dataset-split-service";

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

async function loadDataset(): Promise<PdfDecisionOutcomeDataset> {
  const inPath = readOption("--in=");
  if (inPath) {
    const raw = readFileSync(inPath, "utf8");
    return JSON.parse(raw) as PdfDecisionOutcomeDataset;
  }
  return buildPdfDecisionOutcomeDataset({
    limit: readNumberOption("--limit="),
    fiscalYear: readNumberOption("--fiscalYear="),
    orgNumber: readOption("--orgNumber="),
  });
}

function parseRatios(raw?: string): { train: number; validation: number; test: number } | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 3 || parts.some((p) => !Number.isFinite(p))) return undefined;
  return { train: parts[0], validation: parts[1], test: parts[2] };
}

async function main() {
  const dataset = await loadDataset();
  const json = hasFlag("--json");
  const outPath = readOption("--out=");
  const seed = readOption("--seed=");
  const ratios = parseRatios(readOption("--ratios="));

  const result = splitPdfDecisionOutcomeDataset({ dataset, seed, ratios });

  if (result.leakageIssues.length > 0) {
    console.error(`WARNING: ${result.leakageIssues.length} leakage issue(s) detected.`);
    for (const issue of result.leakageIssues) {
      console.error(`  [${issue.severity}] ${issue.message}`);
    }
  }

  if (!outPath) {
    console.log(`Split: ${result.recordCount} records`);
    console.log(
      `  train=${result.splitCounts.train}, validation=${result.splitCounts.validation}, test=${result.splitCounts.test}`,
    );
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      for (const record of result.records) {
        console.log(JSON.stringify(record));
      }
    }
    return;
  }

  const resolved = resolve(process.cwd(), outPath);
  let content: string;
  if (json) {
    content = JSON.stringify(result, null, 2) + "\n";
  } else {
    content = result.records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  }
  writeFileSync(resolved, content, "utf8");
  console.log(
    `Wrote split dataset to ${resolved} (train=${result.splitCounts.train}, validation=${result.splitCounts.validation}, test=${result.splitCounts.test})`,
  );
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
