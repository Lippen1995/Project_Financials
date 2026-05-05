import { readFileSync } from "node:fs";

import { persistPdfModelArtifactSnapshot } from "@/server/services/pdf-model-artifact-snapshot-service";

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
  return Number.isFinite(parsed) ? Math.floor(parsed) : undefined;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("persist:pdf-model-artifact requires DATABASE_URL.");
  }
  const kind = readOption("--kind=");
  const inputPath = readOption("--in=");
  if (
    kind !== "SHADOW_MODEL_EVALUATION" &&
    kind !== "SHADOW_MODEL_ANALYSIS" &&
    kind !== "SHADOW_VS_RULE_GATE" &&
    kind !== "MODEL_REGISTRY_MANIFEST"
  ) {
    throw new Error("--kind must be SHADOW_MODEL_EVALUATION, SHADOW_MODEL_ANALYSIS, SHADOW_VS_RULE_GATE, or MODEL_REGISTRY_MANIFEST.");
  }
  if (!inputPath) throw new Error("--in=<path> is required.");
  const payload = JSON.parse(readFileSync(inputPath, "utf8")) as unknown;
  const snapshot = await persistPdfModelArtifactSnapshot({
    kind,
    payload,
    modelId: readOption("--modelId="),
    modelVersion: readOption("--modelVersion="),
    modelTarget: readOption("--modelTarget="),
    featureSchemaVersion: readOption("--featureSchemaVersion="),
    fiscalYear: readNumberOption("--fiscalYear="),
    orgNumber: readOption("--orgNumber="),
    split: readOption("--split="),
    sourceCommand: readOption("--sourceCommand="),
    sourceCommitSha: readOption("--sourceCommitSha="),
  });
  if (hasFlag("--json")) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  console.log(`Persisted ${snapshot.kind} artifact snapshot ${snapshot.id}`);
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
