import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  evaluatePdfDecisionShadowModel,
  serializePdfDecisionShadowModelEvaluationAsJson,
} from "@/server/services/pdf-decision-shadow-model-service";

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

function readSplit() {
  const value = readOption("--split=");
  if (value === "train" || value === "validation" || value === "test" || value === "all") {
    return value;
  }
  return undefined;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("evaluate:pdf-decision-shadow-model requires DATABASE_URL.");
  }
  const evaluation = await evaluatePdfDecisionShadowModel({
    limit: readNumberOption("--limit="),
    fiscalYear: readNumberOption("--fiscalYear="),
    orgNumber: readOption("--orgNumber="),
    split: readSplit(),
  });
  const json = serializePdfDecisionShadowModelEvaluationAsJson(evaluation);
  const out = readOption("--out=");
  if (out) {
    writeFileSync(resolve(process.cwd(), out), `${json}\n`, "utf8");
    console.log(`Wrote PDF Decision shadow model evaluation to ${out}`);
    return;
  }
  if (hasFlag("--json")) {
    console.log(json);
    return;
  }

  console.log("PDF Decision shadow model evaluation");
  console.log(`Records: ${evaluation.recordCount}`);
  console.log(`Route accuracy: ${evaluation.metrics.routeAccuracy ?? "n/a"}`);
  console.log(`Manual review accuracy: ${evaluation.metrics.manualReviewAccuracy ?? "n/a"}`);
  console.log(`Correction Brier approx: ${evaluation.metrics.correctionBrierApprox ?? "n/a"}`);
  console.log(`Unreadable Brier approx: ${evaluation.metrics.unreadableBrierApprox ?? "n/a"}`);
  console.log(`Publish Brier approx: ${evaluation.metrics.publishBrierApprox ?? "n/a"}`);
  console.log("Route prediction distribution:");
  for (const [route, count] of Object.entries(evaluation.routePredictionDistribution)) {
    console.log(`  ${route}: ${count}`);
  }
  console.log("Top uncertain predictions:");
  for (const prediction of evaluation.predictions
    .slice()
    .sort((a, b) => a.confidence.overall - b.confidence.overall)
    .slice(0, 10)) {
    console.log(
      `${prediction.filingId} route=${prediction.predictions.routeRecommendation} overall=${prediction.confidence.overall}`,
    );
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
