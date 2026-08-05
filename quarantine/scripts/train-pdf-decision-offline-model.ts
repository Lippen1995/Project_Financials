import { readFileSync, writeFileSync } from "node:fs";

import {
  trainPdfDecisionOfflineModel,
  type PdfDecisionOfflineModelTarget,
  type PdfDecisionOfflineModelAlgorithm,
  type PdfDecisionOfflineModelCard,
} from "@/server/services/pdf-decision-offline-model-training-service";
import { parsePdfDecisionMlFeatureDatasetFromJsonOrJsonl } from "@/server/services/pdf-decision-offline-model-training-io";

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
  return Number.isFinite(parsed) ? parsed : undefined;
}

function fmt(value?: number | null): string {
  return value == null ? "-" : `${(value * 100).toFixed(2)}%`;
}

function printModelCard(card: PdfDecisionOfflineModelCard) {
  console.log(`PDF Offline Model Card`);
  console.log(`  Target:    ${card.target}`);
  console.log(`  Algorithm: ${card.algorithm}`);
  console.log(`  Schema:    ${card.featureSchemaVersion}`);
  console.log(`  Generated: ${card.generatedAt}`);
  console.log(`  Records:   train=${card.recordCounts.train}  val=${card.recordCounts.validation}  test=${card.recordCounts.test}  total=${card.recordCounts.total}`);
  if (card.trainingConfig.maxEpochs != null) {
    console.log(`  Epochs:    ${card.trainingConfig.maxEpochs}  lr=${card.trainingConfig.learningRate}`);
  }
  console.log();

  for (const [split, m] of Object.entries(card.metrics)) {
    if (!m) continue;
    console.log(`  [${split}]`);
    console.log(`    n=${m.eligibleCount}  positive_rate=${fmt(m.positiveRate)}`);
    console.log(`    accuracy=${fmt(m.accuracy)}  precision=${fmt(m.precision)}  recall=${fmt(m.recall)}  f1=${fmt(m.f1)}`);
    console.log(`    brier=${m.brierScore?.toFixed(4) ?? "-"}  log_loss=${m.logLossApprox?.toFixed(4) ?? "-"}`);
  }

  if (card.warnings.length > 0) {
    console.log();
    for (const w of card.warnings) {
      console.warn(`  [WARN] ${w}`);
    }
  }
}

async function main() {
  const inPath = readOption("--in=");
  if (!inPath) {
    console.error("Error: --in=<path> is required.");
    process.exitCode = 1;
    return;
  }

  const rawTarget = readOption("--target=") ?? "manualReviewRequired";
  const validTargets: PdfDecisionOfflineModelTarget[] = [
    "manualReviewRequired",
    "corrected",
    "unreadable",
    "published",
  ];
  if (!validTargets.includes(rawTarget as PdfDecisionOfflineModelTarget)) {
    console.error(`Error: --target must be one of ${validTargets.join(", ")}.`);
    process.exitCode = 1;
    return;
  }
  const target = rawTarget as PdfDecisionOfflineModelTarget;

  const rawAlgorithm = readOption("--algorithm=") ?? "MAJORITY_BASELINE";
  const validAlgorithms: PdfDecisionOfflineModelAlgorithm[] = [
    "MAJORITY_BASELINE",
    "RULE_SCORE_BASELINE",
    "LOGISTIC_REGRESSION_SGD",
  ];
  if (!validAlgorithms.includes(rawAlgorithm as PdfDecisionOfflineModelAlgorithm)) {
    console.error(`Error: --algorithm must be one of ${validAlgorithms.join(", ")}.`);
    process.exitCode = 1;
    return;
  }
  const algorithm = rawAlgorithm as PdfDecisionOfflineModelAlgorithm;

  const maxEpochs = readNumberOption("--maxEpochs=");
  const learningRate = readNumberOption("--learningRate=");
  const seed = readOption("--seed=") ?? "default";
  const outPath = readOption("--out=");

  let fileContent: string;
  try {
    fileContent = readFileSync(inPath, "utf8");
  } catch (err) {
    console.error(`Error reading ${inPath}: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  let dataset;
  try {
    dataset = parsePdfDecisionMlFeatureDatasetFromJsonOrJsonl(fileContent);
  } catch (err) {
    console.error(`Error parsing dataset: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  const card = trainPdfDecisionOfflineModel({
    dataset,
    target,
    algorithm,
    maxEpochs,
    learningRate,
    seed,
  });

  const json = JSON.stringify(card, null, 2);

  if (outPath) {
    writeFileSync(outPath, json, "utf8");
    console.log(`Model card written to ${outPath}`);
  }

  if (hasFlag("--json")) {
    console.log(json);
    return;
  }

  printModelCard(card);
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
