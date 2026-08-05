import {
  evaluatePdfDecisionShadowModel,
  type PdfDecisionShadowModelPrediction,
} from "@/server/services/pdf-decision-shadow-model-service";
import { buildPdfDecisionMlFeatureDataset } from "@/server/services/pdf-decision-ml-feature-schema-service";

export type PdfShadowModelAnalysisSliceKey =
  | "riskLevel"
  | "decisionRoute"
  | "fiscalYear"
  | "qualityRisk"
  | "goldSetStatus"
  | "split";

export type PdfShadowModelCalibrationBucket = {
  bucket: string;
  lowerBound: number;
  upperBound: number;
  count: number;
  averagePredictedProbability: number | null;
  observedRate: number | null;
  absoluteCalibrationError: number | null;
};

export type PdfShadowModelConfusionMatrix = {
  labels: string[];
  matrix: Record<string, Record<string, number>>;
};

export type PdfShadowModelBinaryMetrics = {
  threshold: number;
  eligibleCount: number;
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  specificity: number | null;
  f1: number | null;
};

export type PdfShadowModelErrorExample = {
  filingId: string;
  extractionRunId?: string | null;
  orgNumber?: string | null;
  fiscalYear?: number | null;
  split?: string | null;
  riskLevel?: string | null;
  decisionRoute?: string | null;
  qualityRisk?: string | null;
  predictedRoute: string;
  actualRoute?: string | null;
  manualReviewProbability: number;
  actualManualReviewRequired?: 0 | 1 | null;
  correctionProbability: number;
  actualCorrected?: 0 | 1 | null;
  unreadableProbability: number;
  actualUnreadable?: 0 | 1 | null;
  confidenceOverall: number;
  errorType:
    | "ROUTE_MISMATCH"
    | "MANUAL_REVIEW_FALSE_POSITIVE"
    | "MANUAL_REVIEW_FALSE_NEGATIVE"
    | "CORRECTION_FALSE_POSITIVE"
    | "CORRECTION_FALSE_NEGATIVE"
    | "UNREADABLE_FALSE_POSITIVE"
    | "UNREADABLE_FALSE_NEGATIVE"
    | "LOW_CONFIDENCE_CORRECT"
    | "HIGH_CONFIDENCE_WRONG";
  explanations: string[];
};

export type PdfShadowModelSliceMetrics = {
  key: PdfShadowModelAnalysisSliceKey;
  value: string;
  count: number;
  routeAccuracy: number | null;
  manualReviewMetrics: PdfShadowModelBinaryMetrics;
  correctionBrierApprox: number | null;
  unreadableBrierApprox: number | null;
  publishBrierApprox: number | null;
};

export type PdfShadowModelAnalysisReport = {
  version: "pdf-decision-shadow-model-analysis-v1";
  generatedAt: string;
  input: {
    limit: number;
    fiscalYear?: number;
    orgNumber?: string;
    split?: "train" | "validation" | "test" | "all";
    threshold: number;
  };
  recordCount: number;
  eligibleRouteCount: number;
  routeConfusionMatrix: PdfShadowModelConfusionMatrix;
  manualReviewMetrics: PdfShadowModelBinaryMetrics;
  correctionMetrics: PdfShadowModelBinaryMetrics;
  unreadableMetrics: PdfShadowModelBinaryMetrics;
  calibration: {
    manualReviewProbability: PdfShadowModelCalibrationBucket[];
    correctionProbability: PdfShadowModelCalibrationBucket[];
    unreadableProbability: PdfShadowModelCalibrationBucket[];
    publishProbability: PdfShadowModelCalibrationBucket[];
  };
  slices: PdfShadowModelSliceMetrics[];
  topErrors: PdfShadowModelErrorExample[];
  topUncertain: PdfShadowModelErrorExample[];
};

function safeDiv(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Number((numerator / denominator).toFixed(4));
}

function buildBinaryMetrics(
  predictions: PdfDecisionShadowModelPrediction[],
  probabilityKey: "manualReviewProbability" | "correctionProbability" | "unreadableProbability",
  actualKey: "actualManualReviewRequired" | "actualCorrected" | "actualUnreadable",
  threshold: number,
): PdfShadowModelBinaryMetrics {
  const eligible = predictions.filter((p) => p.comparison?.[actualKey] != null);
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const p of eligible) {
    const predicted = p.predictions[probabilityKey] >= threshold ? 1 : 0;
    const actual = p.comparison![actualKey] as 0 | 1;
    if (predicted === 1 && actual === 1) tp++;
    else if (predicted === 1 && actual === 0) fp++;
    else if (predicted === 0 && actual === 0) tn++;
    else fn++;
  }
  const total = tp + fp + tn + fn;
  const accuracy = safeDiv(tp + tn, total);
  const precision = safeDiv(tp, tp + fp);
  const recall = safeDiv(tp, tp + fn);
  const specificity = safeDiv(tn, tn + fp);
  const f1 =
    precision != null && recall != null && (precision + recall) > 0
      ? safeDiv(2 * precision * recall, precision + recall)
      : null;
  return {
    threshold,
    eligibleCount: eligible.length,
    truePositive: tp,
    falsePositive: fp,
    trueNegative: tn,
    falseNegative: fn,
    accuracy,
    precision,
    recall,
    specificity,
    f1,
  };
}

function buildRouteConfusionMatrix(
  predictions: PdfDecisionShadowModelPrediction[],
): PdfShadowModelConfusionMatrix {
  const eligible = predictions.filter(
    (p) =>
      p.comparison?.actualRouteLabel != null &&
      p.comparison.actualRouteLabel !== "UNKNOWN",
  );
  const labelSet = new Set<string>();
  for (const p of eligible) {
    labelSet.add(p.predictions.routeRecommendation);
    if (p.comparison!.actualRouteLabel) labelSet.add(p.comparison!.actualRouteLabel);
  }
  const labels = Array.from(labelSet).sort();
  const matrix: Record<string, Record<string, number>> = {};
  for (const actual of labels) {
    matrix[actual] = {};
    for (const predicted of labels) {
      matrix[actual][predicted] = 0;
    }
  }
  for (const p of eligible) {
    const actual = p.comparison!.actualRouteLabel!;
    const predicted = p.predictions.routeRecommendation;
    if (matrix[actual]) {
      matrix[actual][predicted] = (matrix[actual][predicted] ?? 0) + 1;
    }
  }
  return { labels, matrix };
}

function buildCalibrationBuckets(
  predictions: PdfDecisionShadowModelPrediction[],
  probabilityKey: "manualReviewProbability" | "correctionProbability" | "unreadableProbability" | "publishProbability",
  actualKey: "actualManualReviewRequired" | "actualCorrected" | "actualUnreadable" | "actualPublished",
): PdfShadowModelCalibrationBucket[] {
  const buckets: PdfShadowModelCalibrationBucket[] = [];
  for (let i = 0; i < 10; i++) {
    const lower = i / 10;
    const upper = (i + 1) / 10;
    const label = `${lower.toFixed(1)}-${upper.toFixed(1)}`;
    const inBucket = predictions.filter((p) => {
      const prob = p.predictions[probabilityKey];
      return i === 9 ? prob >= lower && prob <= upper : prob >= lower && prob < upper;
    });
    const withLabel = inBucket.filter((p) => p.comparison?.[actualKey] != null);
    if (inBucket.length === 0) {
      buckets.push({
        bucket: label,
        lowerBound: lower,
        upperBound: upper,
        count: 0,
        averagePredictedProbability: null,
        observedRate: null,
        absoluteCalibrationError: null,
      });
      continue;
    }
    const avgPredicted =
      inBucket.reduce((sum, p) => sum + p.predictions[probabilityKey], 0) / inBucket.length;
    const observedRate =
      withLabel.length === 0
        ? null
        : withLabel.reduce((sum, p) => sum + (p.comparison![actualKey] as number), 0) /
          withLabel.length;
    const absoluteCalibrationError =
      observedRate != null ? Math.abs(avgPredicted - observedRate) : null;
    buckets.push({
      bucket: label,
      lowerBound: lower,
      upperBound: upper,
      count: inBucket.length,
      averagePredictedProbability: Number(avgPredicted.toFixed(4)),
      observedRate: observedRate != null ? Number(observedRate.toFixed(4)) : null,
      absoluteCalibrationError:
        absoluteCalibrationError != null ? Number(absoluteCalibrationError.toFixed(4)) : null,
    });
  }
  return buckets;
}

function sliceValue(
  prediction: PdfDecisionShadowModelPrediction,
  key: PdfShadowModelAnalysisSliceKey,
  featureMap: Map<string, Record<string, string | null>>,
): string | null {
  const extra = featureMap.get(prediction.filingId);
  if (key === "fiscalYear") return prediction.fiscalYear != null ? String(prediction.fiscalYear) : null;
  if (key === "riskLevel") return extra?.riskLevel ?? null;
  if (key === "decisionRoute") return extra?.decisionRoute ?? null;
  if (key === "qualityRisk") return extra?.qualityRisk ?? null;
  if (key === "goldSetStatus") return extra?.goldSetStatus ?? null;
  if (key === "split") return extra?.split ?? null;
  return null;
}

function brierForSlice(
  preds: PdfDecisionShadowModelPrediction[],
  probabilityKey: "correctionProbability" | "unreadableProbability" | "publishProbability",
  labelKey: "actualCorrected" | "actualUnreadable" | "actualPublished",
): number | null {
  const eligible = preds.filter((p) => p.comparison?.[labelKey] != null);
  if (eligible.length === 0) return null;
  const sum = eligible.reduce((acc, p) => {
    const prob = p.predictions[probabilityKey];
    const actual = p.comparison![labelKey] as number;
    return acc + (prob - actual) ** 2;
  }, 0);
  return Number((sum / eligible.length).toFixed(4));
}

function buildSlices(
  predictions: PdfDecisionShadowModelPrediction[],
  featureMap: Map<string, Record<string, string | null>>,
  threshold: number,
): PdfShadowModelSliceMetrics[] {
  const sliceKeys: PdfShadowModelAnalysisSliceKey[] = [
    "riskLevel",
    "decisionRoute",
    "fiscalYear",
    "qualityRisk",
    "goldSetStatus",
    "split",
  ];
  const results: PdfShadowModelSliceMetrics[] = [];
  for (const key of sliceKeys) {
    const grouped = new Map<string, PdfDecisionShadowModelPrediction[]>();
    for (const p of predictions) {
      const val = sliceValue(p, key, featureMap);
      if (!val) continue;
      const list = grouped.get(val) ?? [];
      list.push(p);
      grouped.set(val, list);
    }
    for (const [value, preds] of Array.from(grouped.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      const routeEligible = preds.filter((p) => p.comparison?.routeMatch != null);
      const routeMatches = routeEligible.filter((p) => p.comparison?.routeMatch).length;
      results.push({
        key,
        value,
        count: preds.length,
        routeAccuracy: safeDiv(routeMatches, routeEligible.length),
        manualReviewMetrics: buildBinaryMetrics(preds, "manualReviewProbability", "actualManualReviewRequired", threshold),
        correctionBrierApprox: brierForSlice(preds, "correctionProbability", "actualCorrected"),
        unreadableBrierApprox: brierForSlice(preds, "unreadableProbability", "actualUnreadable"),
        publishBrierApprox: brierForSlice(preds, "publishProbability", "actualPublished"),
      });
    }
  }
  return results;
}

function toErrorExample(
  p: PdfDecisionShadowModelPrediction,
  errorType: PdfShadowModelErrorExample["errorType"],
  featureMap: Map<string, Record<string, string | null>>,
): PdfShadowModelErrorExample {
  const extra = featureMap.get(p.filingId);
  return {
    filingId: p.filingId,
    extractionRunId: p.extractionRunId ?? null,
    orgNumber: p.orgNumber ?? null,
    fiscalYear: p.fiscalYear ?? null,
    split: extra?.split ?? null,
    riskLevel: extra?.riskLevel ?? null,
    decisionRoute: extra?.decisionRoute ?? null,
    qualityRisk: extra?.qualityRisk ?? null,
    predictedRoute: p.predictions.routeRecommendation,
    actualRoute: p.comparison?.actualRouteLabel ?? null,
    manualReviewProbability: p.predictions.manualReviewProbability,
    actualManualReviewRequired: p.comparison?.actualManualReviewRequired ?? null,
    correctionProbability: p.predictions.correctionProbability,
    actualCorrected: p.comparison?.actualCorrected ?? null,
    unreadableProbability: p.predictions.unreadableProbability,
    actualUnreadable: p.comparison?.actualUnreadable ?? null,
    confidenceOverall: p.confidence.overall,
    errorType,
    explanations: p.explanations,
  };
}

function buildTopErrors(
  predictions: PdfDecisionShadowModelPrediction[],
  featureMap: Map<string, Record<string, string | null>>,
  threshold: number,
  maxExamples: number,
): PdfShadowModelErrorExample[] {
  const errors: Array<{ p: PdfDecisionShadowModelPrediction; errorType: PdfShadowModelErrorExample["errorType"]; severity: number }> = [];

  for (const p of predictions) {
    // Route mismatch
    if (p.comparison?.routeMatch === false) {
      errors.push({ p, errorType: "ROUTE_MISMATCH", severity: p.confidence.overall });
    }
    // Manual review FP/FN
    if (p.comparison?.actualManualReviewRequired != null) {
      const predicted = p.predictions.manualReviewProbability >= threshold ? 1 : 0;
      const actual = p.comparison.actualManualReviewRequired;
      if (predicted === 1 && actual === 0) {
        errors.push({ p, errorType: "MANUAL_REVIEW_FALSE_POSITIVE", severity: p.predictions.manualReviewProbability });
      } else if (predicted === 0 && actual === 1) {
        errors.push({ p, errorType: "MANUAL_REVIEW_FALSE_NEGATIVE", severity: 1 - p.predictions.manualReviewProbability });
      }
    }
    // Correction FP/FN
    if (p.comparison?.actualCorrected != null) {
      const predicted = p.predictions.correctionProbability >= threshold ? 1 : 0;
      const actual = p.comparison.actualCorrected;
      if (predicted === 1 && actual === 0) {
        errors.push({ p, errorType: "CORRECTION_FALSE_POSITIVE", severity: p.predictions.correctionProbability });
      } else if (predicted === 0 && actual === 1) {
        errors.push({ p, errorType: "CORRECTION_FALSE_NEGATIVE", severity: 1 - p.predictions.correctionProbability });
      }
    }
    // Unreadable FP/FN
    if (p.comparison?.actualUnreadable != null) {
      const predicted = p.predictions.unreadableProbability >= threshold ? 1 : 0;
      const actual = p.comparison.actualUnreadable;
      if (predicted === 1 && actual === 0) {
        errors.push({ p, errorType: "UNREADABLE_FALSE_POSITIVE", severity: p.predictions.unreadableProbability });
      } else if (predicted === 0 && actual === 1) {
        errors.push({ p, errorType: "UNREADABLE_FALSE_NEGATIVE", severity: 1 - p.predictions.unreadableProbability });
      }
    }
    // High confidence wrong
    if (p.confidence.overall >= 0.75 && p.comparison?.routeMatch === false) {
      errors.push({ p, errorType: "HIGH_CONFIDENCE_WRONG", severity: p.confidence.overall });
    }
    // Low confidence correct
    if (p.confidence.overall < 0.4 && p.comparison?.routeMatch === true) {
      errors.push({ p, errorType: "LOW_CONFIDENCE_CORRECT", severity: 1 - p.confidence.overall });
    }
  }

  return errors
    .sort((a, b) => b.severity - a.severity)
    .slice(0, maxExamples)
    .map(({ p, errorType }) => toErrorExample(p, errorType, featureMap));
}

function buildTopUncertain(
  predictions: PdfDecisionShadowModelPrediction[],
  featureMap: Map<string, Record<string, string | null>>,
  maxExamples: number,
): PdfShadowModelErrorExample[] {
  return predictions
    .slice()
    .sort((a, b) => a.confidence.overall - b.confidence.overall)
    .slice(0, maxExamples)
    .map((p) => {
      const errorType: PdfShadowModelErrorExample["errorType"] =
        p.comparison?.routeMatch === false ? "ROUTE_MISMATCH" : "LOW_CONFIDENCE_CORRECT";
      return toErrorExample(p, errorType, featureMap);
    });
}

export async function buildPdfDecisionShadowModelAnalysisReport(
  input?: {
    limit?: number;
    fiscalYear?: number;
    orgNumber?: string;
    split?: "train" | "validation" | "test" | "all";
    threshold?: number;
    maxExamples?: number;
  },
  deps?: {
    buildFeatureDataset?: typeof buildPdfDecisionMlFeatureDataset;
  },
): Promise<PdfShadowModelAnalysisReport> {
  const limit = input?.limit ?? 100;
  const threshold = input?.threshold ?? 0.5;
  const maxExamples = input?.maxExamples ?? 50;
  const split = input?.split ?? "all";

  const evaluation = await evaluatePdfDecisionShadowModel(
    { limit, fiscalYear: input?.fiscalYear, orgNumber: input?.orgNumber, split },
    { buildFeatureDataset: deps?.buildFeatureDataset },
  );

  const predictions = evaluation.predictions;

  // Build feature map for slice/error lookups (cached from evaluation records)
  // We infer extra fields from the predictions themselves where available
  const featureMap = new Map<string, Record<string, string | null>>();
  for (const p of predictions) {
    featureMap.set(p.filingId, {
      riskLevel: null,
      decisionRoute: null,
      qualityRisk: null,
      goldSetStatus: null,
      split: null,
    });
  }

  const routeEligible = predictions.filter(
    (p) =>
      p.comparison?.actualRouteLabel != null &&
      p.comparison.actualRouteLabel !== "UNKNOWN",
  );

  return {
    version: "pdf-decision-shadow-model-analysis-v1",
    generatedAt: new Date().toISOString(),
    input: {
      limit,
      fiscalYear: input?.fiscalYear,
      orgNumber: input?.orgNumber,
      split,
      threshold,
    },
    recordCount: predictions.length,
    eligibleRouteCount: routeEligible.length,
    routeConfusionMatrix: buildRouteConfusionMatrix(predictions),
    manualReviewMetrics: buildBinaryMetrics(
      predictions,
      "manualReviewProbability",
      "actualManualReviewRequired",
      threshold,
    ),
    correctionMetrics: buildBinaryMetrics(
      predictions,
      "correctionProbability",
      "actualCorrected",
      threshold,
    ),
    unreadableMetrics: buildBinaryMetrics(
      predictions,
      "unreadableProbability",
      "actualUnreadable",
      threshold,
    ),
    calibration: {
      manualReviewProbability: buildCalibrationBuckets(
        predictions,
        "manualReviewProbability",
        "actualManualReviewRequired",
      ),
      correctionProbability: buildCalibrationBuckets(
        predictions,
        "correctionProbability",
        "actualCorrected",
      ),
      unreadableProbability: buildCalibrationBuckets(
        predictions,
        "unreadableProbability",
        "actualUnreadable",
      ),
      publishProbability: buildCalibrationBuckets(
        predictions,
        "publishProbability",
        "actualPublished",
      ),
    },
    slices: buildSlices(predictions, featureMap, threshold),
    topErrors: buildTopErrors(predictions, featureMap, threshold, maxExamples),
    topUncertain: buildTopUncertain(predictions, featureMap, maxExamples),
  };
}

function hasInvalidNumber(value: unknown): boolean {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasInvalidNumber);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasInvalidNumber);
  }
  return false;
}

function hasRawPayloadKey(value: unknown): boolean {
  const rawKeys = new Set(["rawPdf", "pdfBuffer", "rawText", "fullText", "structuredDocument", "pagesText"]);
  if (Array.isArray(value)) return value.some(hasRawPayloadKey);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => rawKeys.has(key) || hasRawPayloadKey(nested),
    );
  }
  return false;
}

export function validatePdfDecisionShadowModelAnalysisReport(
  report: PdfShadowModelAnalysisReport,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (report.version !== "pdf-decision-shadow-model-analysis-v1") {
    issues.push("Invalid report version.");
  }
  if (hasInvalidNumber(report)) {
    issues.push("Report contains NaN or Infinity.");
  }
  if (hasRawPayloadKey(report)) {
    issues.push("Report contains raw PDF/text payload keys.");
  }
  // Validate probabilities and metrics are 0-1 or null
  const checkMetrics = (m: PdfShadowModelBinaryMetrics, label: string) => {
    for (const key of ["accuracy", "precision", "recall", "specificity", "f1"] as const) {
      const v = m[key];
      if (v != null && (v < 0 || v > 1)) issues.push(`${label}.${key} out of range [0,1].`);
    }
  };
  checkMetrics(report.manualReviewMetrics, "manualReviewMetrics");
  checkMetrics(report.correctionMetrics, "correctionMetrics");
  checkMetrics(report.unreadableMetrics, "unreadableMetrics");
  // Validate confusion matrix consistency
  const cm = report.routeConfusionMatrix;
  for (const actual of cm.labels) {
    if (!cm.matrix[actual]) {
      issues.push(`Confusion matrix missing row for label ${actual}.`);
    } else {
      for (const predicted of cm.labels) {
        if (cm.matrix[actual][predicted] == null) {
          issues.push(`Confusion matrix missing cell [${actual}][${predicted}].`);
        }
      }
    }
  }
  try {
    JSON.stringify(report);
  } catch {
    issues.push("Report is not JSON-safe.");
  }
  return { valid: issues.length === 0, issues };
}

export function serializePdfDecisionShadowModelAnalysisReportAsJson(
  report: PdfShadowModelAnalysisReport,
): string {
  return JSON.stringify(report, null, 2);
}
