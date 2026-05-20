/**
 * Training Data Export Service
 *
 * Converts reviewer feedback (PdfTrainingLabel rows) into machine-learning
 * training datasets. Each task type has a different shape — the unit-scale
 * classifier needs raw page text + the chosen scale, the page-type classifier
 * needs page text + the section type, and so on.
 *
 * The output format is JSONL: one JSON object per line. This is the
 * de-facto standard for ML training data — it streams cleanly, the Python
 * trainer can read it line-by-line without parsing megabytes of JSON, and
 * splits (train/val/test) are just slicing the file.
 *
 * For reviewers (business view):
 *  - This service does not train any model. It only produces the *input*
 *    a model trainer reads.
 *  - The export is non-destructive — you can run it as many times as you
 *    like; reviewer corrections are never modified.
 *  - Each export is a snapshot of training data at a point in time. The
 *    next export will reflect newer corrections.
 */
import { type MlTaskType, PdfTrainingLabelType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const DEFAULT_VALIDATION_FRACTION = 0.15;
const DEFAULT_TEST_FRACTION = 0.15;

export type TrainingExample = {
  filingId: string;
  /** Free-form text features for the model. Shape depends on task type. */
  features: Record<string, unknown>;
  /** The reviewer-approved label. Shape depends on task type. */
  label: unknown;
  /** Optional: machine's proposed label, for diagnostic comparison. */
  proposedLabel?: unknown;
};

export type TrainingDatasetSplit = {
  taskType: MlTaskType;
  generatedAt: string;
  totalExamples: number;
  train: TrainingExample[];
  validation: TrainingExample[];
  test: TrainingExample[];
  /** Distribution of labels — useful to spot class imbalance before training. */
  labelDistribution: Record<string, number>;
};

// ──────────────────────────────────────────────────────────────────────────────
// Feature extractors per task type
// ──────────────────────────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Unit-scale task: predicts whether values on a page are denominated in
 *   1 (kroner), 1000 (tusen kroner), or 1_000_000 (millioner kroner).
 *
 * Feature surface (minimal first version):
 *   - `rawLabel` from the corrected fact (the surrounding header text)
 *   - `proposedUnitScale` if the machine had one
 *
 * Label: the reviewer's chosen `unitScale`.
 */
function buildUnitScaleExample(
  filingId: string,
  proposedValue: unknown,
  acceptedValue: unknown,
  sourcePayload: unknown,
): TrainingExample | null {
  if (!isObject(acceptedValue)) return null;

  const acceptedUnitScale = acceptedValue.unitScale;
  if (typeof acceptedUnitScale !== "number") return null;

  const rawLabel =
    (isObject(acceptedValue) && typeof acceptedValue.rawLabel === "string"
      ? acceptedValue.rawLabel
      : null) ??
    (isObject(sourcePayload) && typeof sourcePayload.rawLabel === "string"
      ? sourcePayload.rawLabel
      : null);

  if (!rawLabel) return null;

  const proposedUnitScale =
    isObject(proposedValue) && typeof proposedValue.unitScale === "number"
      ? proposedValue.unitScale
      : null;

  return {
    filingId,
    features: {
      rawLabel,
      proposedUnitScale,
    },
    label: acceptedUnitScale,
    proposedLabel: proposedUnitScale,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Deterministic split
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Deterministic hash-based assignment to train/val/test. Same example always
 * lands in the same split, so repeated exports don't shuffle examples
 * between buckets — important when comparing model versions trained at
 * different times.
 */
function assignSplit(
  key: string,
  validationFraction: number,
  testFraction: number,
): "train" | "validation" | "test" {
  // Simple FNV-1a hash → float in [0,1)
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = ((hash >>> 0) % 10_000) / 10_000;

  if (normalized < validationFraction) return "validation";
  if (normalized < validationFraction + testFraction) return "test";
  return "train";
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

export type ExportOptions = {
  validationFraction?: number;
  testFraction?: number;
};

/**
 * Builds an in-memory dataset for the unit-scale classifier. Reads all
 * FACT_VALUE training labels with reviewer-approved unit scales, extracts
 * features, splits deterministically into train/val/test.
 *
 * The Python trainer will receive this exact structure as JSONL.
 */
export async function exportUnitScaleDataset(
  options: ExportOptions = {},
): Promise<TrainingDatasetSplit> {
  const validationFraction = options.validationFraction ?? DEFAULT_VALIDATION_FRACTION;
  const testFraction = options.testFraction ?? DEFAULT_TEST_FRACTION;

  const labels = await prisma.pdfTrainingLabel.findMany({
    where: { labelType: PdfTrainingLabelType.FACT_VALUE },
    select: {
      filingId: true,
      proposedValue: true,
      acceptedValue: true,
      sourcePayload: true,
      id: true,
    },
  });

  const examples: TrainingExample[] = [];
  const labelDistribution: Record<string, number> = {};

  for (const label of labels) {
    const example = buildUnitScaleExample(
      label.filingId,
      label.proposedValue,
      label.acceptedValue,
      label.sourcePayload,
    );
    if (!example) continue;
    examples.push(example);
    const key = String(example.label);
    labelDistribution[key] = (labelDistribution[key] ?? 0) + 1;
  }

  const buckets = { train: [], validation: [], test: [] } as {
    train: TrainingExample[];
    validation: TrainingExample[];
    test: TrainingExample[];
  };

  for (const example of examples) {
    const splitKey = `${example.filingId}::${String(example.label)}`;
    const bucket = assignSplit(splitKey, validationFraction, testFraction);
    buckets[bucket].push(example);
  }

  return {
    taskType: "UNIT_SCALE_CLASSIFIER",
    generatedAt: new Date().toISOString(),
    totalExamples: examples.length,
    train: buckets.train,
    validation: buckets.validation,
    test: buckets.test,
    labelDistribution,
  };
}

/**
 * Serialises a dataset split to JSONL format — one example per line, ready
 * for the Python trainer.
 */
export function serializeDatasetAsJsonl(split: TrainingDatasetSplit): {
  trainJsonl: string;
  validationJsonl: string;
  testJsonl: string;
} {
  const toJsonl = (examples: TrainingExample[]) =>
    examples.map((ex) => JSON.stringify(ex)).join("\n");
  return {
    trainJsonl: toJsonl(split.train),
    validationJsonl: toJsonl(split.validation),
    testJsonl: toJsonl(split.test),
  };
}
