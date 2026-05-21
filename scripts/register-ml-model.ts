/**
 * Registers a freshly-trained model in the MlModelVersion table.
 *
 * The Python trainer writes two files: the model binary (.joblib) and a
 * metadata sidecar (.metadata.json). This script reads the sidecar and
 * creates a PROPOSED MlModelVersion row. An admin then approves it in
 * /admin/extraction-learning, which flips it to ACTIVE.
 *
 * Usage:
 *   npx tsx scripts/register-ml-model.ts <path-to-metadata.json>
 *
 * Example:
 *   npx tsx scripts/register-ml-model.ts \
 *     docker/ml-inference/models/unit_scale_classifier.metadata.json
 *
 * This script does NOT activate the model — registration only. Activation is
 * a deliberate human step in the admin UI.
 */
import fs from "node:fs";

import type { MlTaskType } from "@prisma/client";

import { proposeModelVersion } from "@/server/services/ml-model-version-service";

type ModelMetadata = {
  taskType: string;
  algorithm: string;
  binaryPath: string;
  trainedAt?: string;
  evaluationMetrics?: unknown;
  trainingDataSnapshot?: unknown;
  summary?: string;
};

const VALID_TASK_TYPES: MlTaskType[] = [
  "UNIT_SCALE_CLASSIFIER",
  "PAGE_TYPE_CLASSIFIER",
  "YEAR_COLUMN_DETECTOR",
  "OTHER",
];

async function main() {
  const metadataPath = process.argv[2];
  if (!metadataPath) {
    console.error("Usage: npx tsx scripts/register-ml-model.ts <path-to-metadata.json>");
    process.exit(1);
  }

  if (!fs.existsSync(metadataPath)) {
    console.error(`Metadata file not found: ${metadataPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(metadataPath, "utf8");
  let metadata: ModelMetadata;
  try {
    metadata = JSON.parse(raw) as ModelMetadata;
  } catch (error) {
    console.error(`Could not parse metadata JSON: ${(error as Error).message}`);
    process.exit(1);
  }

  if (!VALID_TASK_TYPES.includes(metadata.taskType as MlTaskType)) {
    console.error(
      `Invalid taskType "${metadata.taskType}". Expected one of: ${VALID_TASK_TYPES.join(", ")}`,
    );
    process.exit(1);
  }
  if (!metadata.algorithm || !metadata.binaryPath) {
    console.error("Metadata is missing required fields: algorithm and binaryPath.");
    process.exit(1);
  }

  const proposal = await proposeModelVersion({
    taskType: metadata.taskType as MlTaskType,
    algorithm: metadata.algorithm,
    binaryPath: metadata.binaryPath,
    evaluationMetrics: metadata.evaluationMetrics ?? null,
    trainingDataSnapshot: metadata.trainingDataSnapshot ?? null,
    summary: metadata.summary ?? null,
  });

  console.log(
    `Registered ${proposal.taskType} v${proposal.taskVersion} (status: ${proposal.status}).`,
  );
  console.log(`Model id: ${proposal.id}`);
  console.log(
    "Next: open /admin/extraction-learning and approve the proposal to activate it.",
  );
}

main()
  .catch((error) => {
    console.error("Registration failed:", error);
    process.exit(1);
  });
