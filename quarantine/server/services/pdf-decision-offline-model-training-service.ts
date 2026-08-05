import {
  PDF_DECISION_ML_FEATURE_SCHEMA_VERSION,
  type PdfDecisionMlFeatureDataset,
  type PdfDecisionMlFeatureRecord,
} from "@/server/services/pdf-decision-ml-feature-schema-service";

export type PdfDecisionOfflineModelTarget =
  | "manualReviewRequired"
  | "corrected"
  | "unreadable"
  | "published";

export type PdfDecisionOfflineModelAlgorithm =
  | "MAJORITY_BASELINE"
  | "RULE_SCORE_BASELINE"
  | "LOGISTIC_REGRESSION_SGD";

export type PdfDecisionOfflineTrainingInput = {
  dataset: PdfDecisionMlFeatureDataset;
  target: PdfDecisionOfflineModelTarget;
  algorithm: PdfDecisionOfflineModelAlgorithm;
  maxEpochs?: number;
  learningRate?: number;
  seed?: string;
};

export type PdfDecisionOfflineBinaryMetrics = {
  eligibleCount: number;
  positiveRate: number | null;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  brierScore: number | null;
  logLossApprox: number | null;
};

export type PdfDecisionOfflineModelCard = {
  version: "pdf-decision-offline-model-card-v1";
  generatedAt: string;
  featureSchemaVersion: string;
  target: PdfDecisionOfflineModelTarget;
  algorithm: PdfDecisionOfflineModelAlgorithm;
  trainingConfig: {
    maxEpochs?: number;
    learningRate?: number;
    seed: string;
  };
  recordCounts: {
    train: number;
    validation: number;
    test: number;
    total: number;
  };
  metrics: {
    train?: PdfDecisionOfflineBinaryMetrics;
    validation?: PdfDecisionOfflineBinaryMetrics;
    test?: PdfDecisionOfflineBinaryMetrics;
  };
  featureNames: string[];
  coefficients?: Record<string, number>;
  intercept?: number;
  warnings: string[];
};

// ---- Categorical vocabulary (stable, low-cardinality) ----

const CATEGORICAL_VOCAB: Record<string, string[]> = {
  riskLevel: ["LOW", "MEDIUM", "HIGH"],
  decisionRoute: [
    "TEXT_LAYER",
    "CONSERVATIVE_FALLBACK",
    "FORCE_OCR",
    "OPENDATALOADER_HYBRID",
    "MANUAL_REVIEW",
    "OPENDATALOADER_LOCAL",
    "HYBRID",
    "OCR",
  ],
  qualityRisk: ["LOW", "MEDIUM", "HIGH"],
  goldSetStatus: ["CANDIDATE", "APPROVED", "EXCLUDED"],
  latestReviewDecisionType: [
    "ACCEPTED",
    "CORRECTED",
    "REJECTED",
    "UNREADABLE",
    "REPROCESS_REQUESTED",
    "PUBLISHED_FROM_REVIEW",
  ],
  currentOutcome: [
    "PUBLISHED",
    "MANUAL_REVIEW_PENDING",
    "MANUAL_REVIEW_ACCEPTED",
    "MANUAL_REVIEW_CORRECTED",
    "MANUAL_REVIEW_REJECTED",
    "MANUAL_REVIEW_UNREADABLE",
    "REPROCESS_REQUESTED",
    "FAILED",
    "UNKNOWN",
  ],
};

const NUMERIC_KEYS: (keyof PdfDecisionMlFeatureRecord["numericFeatures"])[] = [
  "confidenceScore",
  "parserRiskReasonCount",
  "extractionWarningCount",
  "manualReviewReasonCount",
  "blockingRuleCount",
  "warningRuleCount",
  "trainingLabelCount",
  "reviewedFactCount",
  "samplePriority",
  "remediationItemCount",
];

const BOOLEAN_KEYS: (keyof PdfDecisionMlFeatureRecord["booleanFeatures"])[] = [
  "hasStructuredDocument",
  "hasPdfDecision",
  "hasPostValidationDecision",
  "hasGoldSet",
  "isGoldSetApproved",
  "hasParserRiskReasons",
  "hasBlockingRules",
  "hasManualReviewReasons",
  "hasCorrections",
  "isUnreadable",
  "isReprocessRequested",
  "isPublished",
];

const CATEGORICAL_KEYS = Object.keys(CATEGORICAL_VOCAB);

// Build a deterministic list of feature names (used for all records).
function buildFeatureNames(): string[] {
  const names: string[] = [];
  for (const key of NUMERIC_KEYS) {
    names.push(key);
    names.push(`${key}_missing`);
  }
  for (const key of BOOLEAN_KEYS) {
    names.push(key);
  }
  for (const key of CATEGORICAL_KEYS) {
    const vocab = CATEGORICAL_VOCAB[key];
    for (const value of vocab) {
      names.push(`${key}__${value}`);
    }
    names.push(`${key}__MISSING`);
  }
  return names;
}

export const FEATURE_NAMES = buildFeatureNames();

export function vectorizePdfDecisionMlFeatureRecord(
  record: PdfDecisionMlFeatureRecord,
): { featureNames: string[]; values: number[] } {
  const values: number[] = [];

  // Numeric features with missing indicator
  for (const key of NUMERIC_KEYS) {
    const raw = record.numericFeatures[key];
    if (raw == null) {
      values.push(0);
      values.push(1); // missing indicator
    } else {
      values.push(Number(raw));
      values.push(0);
    }
  }

  // Boolean features
  for (const key of BOOLEAN_KEYS) {
    values.push(record.booleanFeatures[key] ? 1 : 0);
  }

  // Categorical one-hot
  for (const key of CATEGORICAL_KEYS) {
    const vocab = CATEGORICAL_VOCAB[key];
    const catVal = record.categoricalFeatures[key as keyof typeof record.categoricalFeatures] as string | null;
    let matched = false;
    for (const v of vocab) {
      values.push(catVal === v ? 1 : 0);
      if (catVal === v) matched = true;
    }
    values.push(matched ? 0 : 1); // MISSING indicator (value is null or not in known vocab)
  }

  return { featureNames: FEATURE_NAMES, values };
}

// ---- Label extraction ----

function getLabel(
  record: PdfDecisionMlFeatureRecord,
  target: PdfDecisionOfflineModelTarget,
): 0 | 1 {
  return record.labels[target];
}

// ---- Metrics ----

function safeDiv(a: number, b: number): number | null {
  return b === 0 ? null : Number((a / b).toFixed(4));
}

function computeBinaryMetrics(
  predictions: number[],
  actuals: (0 | 1)[],
  threshold = 0.5,
): PdfDecisionOfflineBinaryMetrics {
  const n = actuals.length;
  if (n === 0) {
    return {
      eligibleCount: 0,
      positiveRate: null,
      accuracy: null,
      precision: null,
      recall: null,
      f1: null,
      brierScore: null,
      logLossApprox: null,
    };
  }

  const positiveRate = Number((actuals.filter((a) => a === 1).length / n).toFixed(4));
  let tp = 0, fp = 0, tn = 0, fn = 0;
  let brierSum = 0;
  let logLossSum = 0;
  const eps = 1e-7;

  for (let i = 0; i < n; i++) {
    const p = Math.max(eps, Math.min(1 - eps, predictions[i]));
    const a = actuals[i];
    const predicted = p >= threshold ? 1 : 0;
    if (predicted === 1 && a === 1) tp++;
    else if (predicted === 1 && a === 0) fp++;
    else if (predicted === 0 && a === 0) tn++;
    else fn++;
    brierSum += (p - a) ** 2;
    logLossSum += -(a * Math.log(p) + (1 - a) * Math.log(1 - p));
  }

  const accuracy = safeDiv(tp + tn, n);
  const precision = safeDiv(tp, tp + fp);
  const recall = safeDiv(tp, tp + fn);
  const f1 =
    precision != null && recall != null && precision + recall > 0
      ? safeDiv(2 * precision * recall, precision + recall)
      : null;

  return {
    eligibleCount: n,
    positiveRate,
    accuracy,
    precision,
    recall,
    f1,
    brierScore: Number((brierSum / n).toFixed(4)),
    logLossApprox: Number((logLossSum / n).toFixed(4)),
  };
}

// ---- Algorithms ----

function majorityBaselinePredict(
  trainActuals: (0 | 1)[],
  evalRecords: PdfDecisionMlFeatureRecord[],
): number[] {
  const positiveRate =
    trainActuals.length === 0
      ? 0.5
      : trainActuals.filter((a) => a === 1).length / trainActuals.length;
  return evalRecords.map(() => positiveRate);
}

function ruleScorePredict(
  target: PdfDecisionOfflineModelTarget,
  records: PdfDecisionMlFeatureRecord[],
): number[] {
  return records.map((record) => {
    const r = record;
    let score = 0.15;
    if (target === "manualReviewRequired") {
      score += r.categoricalFeatures.riskLevel === "HIGH" ? 0.25 : 0;
      score += r.booleanFeatures.hasBlockingRules ? 0.2 : 0;
      score += r.booleanFeatures.hasManualReviewReasons ? 0.15 : 0;
      score += r.booleanFeatures.hasParserRiskReasons ? 0.1 : 0;
      score += r.booleanFeatures.isUnreadable ? 0.15 : 0;
      score -= r.booleanFeatures.isPublished ? 0.15 : 0;
    } else if (target === "corrected") {
      score = 0.1;
      score += r.numericFeatures.reviewedFactCount > 0 ? 0.25 : 0;
      score += r.booleanFeatures.hasCorrections ? 0.25 : 0;
      score += r.booleanFeatures.hasBlockingRules ? 0.15 : 0;
    } else if (target === "unreadable") {
      score = 0.05;
      score += r.booleanFeatures.isUnreadable ? 0.4 : 0;
      score += r.categoricalFeatures.qualityRisk === "HIGH" ? 0.2 : 0;
      score += r.booleanFeatures.hasParserRiskReasons ? 0.1 : 0;
    } else if (target === "published") {
      score = 0.5;
      score += r.booleanFeatures.isPublished ? 0.3 : 0;
      score +=
        r.numericFeatures.confidenceScore != null && r.numericFeatures.confidenceScore >= 0.75
          ? 0.1
          : 0;
      score -= r.booleanFeatures.hasBlockingRules ? 0.2 : 0;
      score -= r.booleanFeatures.isUnreadable ? 0.3 : 0;
    }
    return Math.max(0, Math.min(1, score));
  });
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
}

function logisticRegressionSgd(
  trainFeatures: number[][],
  trainActuals: (0 | 1)[],
  featureCount: number,
  maxEpochs: number,
  learningRate: number,
  seed: string,
): { weights: number[]; intercept: number } {
  const weights = new Array<number>(featureCount).fill(0);
  let intercept = 0;
  const n = trainFeatures.length;
  if (n === 0) return { weights, intercept };

  // Seeded order — derive a simple permutation from seed string hash
  const seedHash = Array.from(seed).reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 0);
  const l2 = 1e-4;

  for (let epoch = 0; epoch < maxEpochs; epoch++) {
    // Fixed order (deterministic — no shuffle to keep simple and reproducible)
    for (let i = 0; i < n; i++) {
      // Rotate index by seed-derived offset for slight diversity across calls
      const idx = (i + epoch * seedHash) % n;
      const x = trainFeatures[idx];
      const y = trainActuals[idx];
      const dot = x.reduce((sum, xj, j) => sum + xj * weights[j], 0) + intercept;
      const pred = sigmoid(dot);
      const error = pred - y;
      for (let j = 0; j < featureCount; j++) {
        weights[j] -= learningRate * (error * x[j] + l2 * weights[j]);
      }
      intercept -= learningRate * error;
    }
  }

  return { weights, intercept };
}

function logisticPredict(
  features: number[][],
  weights: number[],
  intercept: number,
): number[] {
  return features.map((x) => {
    const dot = x.reduce((sum, xj, j) => sum + xj * weights[j], 0) + intercept;
    return sigmoid(dot);
  });
}

// ---- Main training function ----

export function trainPdfDecisionOfflineModel(
  input: PdfDecisionOfflineTrainingInput,
): PdfDecisionOfflineModelCard {
  const {
    dataset,
    target,
    algorithm,
    maxEpochs = 50,
    learningRate = 0.05,
    seed = "default",
  } = input;

  const warnings: string[] = [];
  const featureNames = FEATURE_NAMES;

  // Partition by split
  const trainRecords = dataset.records.filter((r) => r.split === "train");
  const validationRecords = dataset.records.filter((r) => r.split === "validation");
  const testRecords = dataset.records.filter((r) => r.split === "test");

  // Fall back: if no splits present, treat all records as train
  const allRecords = dataset.records;
  const effectiveTrain = trainRecords.length > 0 ? trainRecords : allRecords;
  if (trainRecords.length === 0 && allRecords.length > 0) {
    warnings.push("No 'train' split found; all records treated as training data.");
  }

  const recordCounts = {
    train: effectiveTrain.length,
    validation: validationRecords.length,
    test: testRecords.length,
    total: dataset.records.length,
  };

  if (effectiveTrain.length === 0) {
    warnings.push("No training records available. Metrics will be null.");
    return {
      version: "pdf-decision-offline-model-card-v1",
      generatedAt: new Date().toISOString(),
      featureSchemaVersion: PDF_DECISION_ML_FEATURE_SCHEMA_VERSION,
      target,
      algorithm,
      trainingConfig: { maxEpochs, learningRate, seed },
      recordCounts,
      metrics: {},
      featureNames,
      warnings,
    };
  }

  const trainActuals = effectiveTrain.map((r) => getLabel(r, target));
  const validationActuals = validationRecords.map((r) => getLabel(r, target));
  const testActuals = testRecords.map((r) => getLabel(r, target));

  let trainPreds: number[];
  let validationPreds: number[];
  let testPreds: number[];
  let coefficients: Record<string, number> | undefined;
  let intercept: number | undefined;

  if (algorithm === "MAJORITY_BASELINE") {
    trainPreds = majorityBaselinePredict(trainActuals, effectiveTrain);
    validationPreds = majorityBaselinePredict(trainActuals, validationRecords);
    testPreds = majorityBaselinePredict(trainActuals, testRecords);
  } else if (algorithm === "RULE_SCORE_BASELINE") {
    trainPreds = ruleScorePredict(target, effectiveTrain);
    validationPreds = ruleScorePredict(target, validationRecords);
    testPreds = ruleScorePredict(target, testRecords);
  } else {
    // LOGISTIC_REGRESSION_SGD
    const trainFeatures = effectiveTrain.map((r) => vectorizePdfDecisionMlFeatureRecord(r).values);
    const { weights, intercept: b } = logisticRegressionSgd(
      trainFeatures,
      trainActuals,
      featureNames.length,
      maxEpochs,
      learningRate,
      seed,
    );
    intercept = Number(b.toFixed(6));
    coefficients = Object.fromEntries(
      featureNames.map((name, i) => [name, Number(weights[i].toFixed(6))]),
    );
    trainPreds = logisticPredict(trainFeatures, weights, b);
    validationPreds = logisticPredict(
      validationRecords.map((r) => vectorizePdfDecisionMlFeatureRecord(r).values),
      weights,
      b,
    );
    testPreds = logisticPredict(
      testRecords.map((r) => vectorizePdfDecisionMlFeatureRecord(r).values),
      weights,
      b,
    );
  }

  const trainMetrics = computeBinaryMetrics(trainPreds, trainActuals);
  const validationMetrics =
    validationActuals.length > 0
      ? computeBinaryMetrics(validationPreds, validationActuals)
      : undefined;
  const testMetrics =
    testActuals.length > 0
      ? computeBinaryMetrics(testPreds, testActuals)
      : undefined;

  return {
    version: "pdf-decision-offline-model-card-v1",
    generatedAt: new Date().toISOString(),
    featureSchemaVersion: PDF_DECISION_ML_FEATURE_SCHEMA_VERSION,
    target,
    algorithm,
    trainingConfig: { maxEpochs, learningRate, seed },
    recordCounts,
    metrics: {
      train: trainMetrics,
      ...(validationMetrics ? { validation: validationMetrics } : {}),
      ...(testMetrics ? { test: testMetrics } : {}),
    },
    featureNames,
    ...(coefficients ? { coefficients } : {}),
    ...(intercept != null ? { intercept } : {}),
    warnings,
  };
}
