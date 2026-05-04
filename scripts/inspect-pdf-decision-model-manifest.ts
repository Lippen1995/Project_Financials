import { readFileSync, writeFileSync } from "node:fs";

import {
  validatePdfDecisionModelRegistryManifest,
  assertPdfDecisionModelManifestSafeForShadowEvaluation,
  type PdfDecisionModelRegistryManifest,
} from "@/server/services/pdf-decision-model-registry-contract-service";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readOption(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function printManifest(manifest: PdfDecisionModelRegistryManifest) {
  console.log("PDF Model Registry Manifest");
  console.log(`  Model ID:          ${manifest.modelId}`);
  console.log(`  Version:           ${manifest.modelVersion}`);
  console.log(`  Created at:        ${manifest.createdAt}`);
  console.log(`  Lifecycle stage:   ${manifest.lifecycleStage}`);
  console.log(`  Target:            ${manifest.target}`);
  console.log(`  Algorithm:         ${manifest.algorithm}`);
  console.log(`  Feature schema:    ${manifest.featureSchemaVersion}`);
  console.log(`  Compatible:        ${manifest.compatibleFeatureSchemaVersions.join(", ")}`);
  console.log();

  console.log("  Safety:");
  console.log(`    productionUseAllowed: ${manifest.safety.productionUseAllowed}`);
  console.log(`    routingUseAllowed:    ${manifest.safety.routingUseAllowed}`);
  console.log(`    publishUseAllowed:    ${manifest.safety.publishUseAllowed}`);
  console.log(`    requiresShadowGate:  ${manifest.safety.requiresShadowGate}`);
  console.log();

  for (const [split, m] of Object.entries(manifest.metrics)) {
    if (!m) continue;
    const parts = Object.entries(m)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(4) : v}`)
      .join("  ");
    console.log(`  Metrics [${split}]: ${parts || "(none)"}`);
  }

  if (manifest.artifacts.length > 0) {
    console.log();
    console.log("  Artifacts:");
    for (const a of manifest.artifacts) {
      console.log(`    ${a.kind}  required=${a.required}  path=${a.path ?? "(none)"}`);
    }
  }

  if (manifest.provenance.sourceCommand || manifest.provenance.createdBy) {
    console.log();
    console.log("  Provenance:");
    if (manifest.provenance.createdBy) console.log(`    createdBy: ${manifest.provenance.createdBy}`);
    if (manifest.provenance.sourceCommand) console.log(`    command: ${manifest.provenance.sourceCommand}`);
    if (manifest.provenance.sourceCommitSha) console.log(`    commit: ${manifest.provenance.sourceCommitSha}`);
  }

  if (manifest.safety.notes.length > 0) {
    console.log();
    console.log("  Notes:");
    for (const note of manifest.safety.notes) {
      console.log(`    - ${note}`);
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

  let raw: string;
  try {
    raw = readFileSync(inPath, "utf8");
  } catch (err) {
    console.error(`Error reading ${inPath}: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`Error parsing JSON: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  const { valid, issues, manifest } = validatePdfDecisionModelRegistryManifest(parsed);

  let shadowSafe = false;
  let shadowSafeError: string | null = null;
  if (manifest) {
    try {
      assertPdfDecisionModelManifestSafeForShadowEvaluation(manifest);
      shadowSafe = true;
    } catch (err) {
      shadowSafeError = err instanceof Error ? err.message : String(err);
    }
  }

  const outPath = readOption("--out=");

  if (hasFlag("--json")) {
    const result = {
      valid,
      issues,
      shadowSafe,
      shadowSafeError,
      manifest: manifest ?? null,
    };
    const json = JSON.stringify(result, null, 2);
    if (outPath) {
      writeFileSync(outPath, json, "utf8");
      console.log(`Written to ${outPath}`);
    }
    console.log(json);
    if (!valid) process.exitCode = 1;
    return;
  }

  if (!valid) {
    console.error(`Manifest validation FAILED (${issues.length} issue${issues.length === 1 ? "" : "s"}):`);
    for (const issue of issues) {
      console.error(`  - ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  printManifest(manifest!);
  console.log();
  console.log(`  Shadow-safe: ${shadowSafe ? "YES" : "NO"}`);
  if (shadowSafeError) {
    console.log(`  Shadow-safe reason: ${shadowSafeError}`);
  }

  if (outPath) {
    writeFileSync(outPath, JSON.stringify({ valid, issues, shadowSafe, shadowSafeError, manifest }, null, 2), "utf8");
    console.log(`Written to ${outPath}`);
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
