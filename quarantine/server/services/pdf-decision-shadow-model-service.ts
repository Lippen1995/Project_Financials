import {
  buildPdfDecisionMlFeatureDataset,
  type PdfDecisionMlFeatureRecord,
  type PdfDecisionMlRouteLabel,
} from "@/server/services/pdf-decision-ml-feature-schema-service";

export type PdfDecisionShadowModelVersion = "pdf-decision-shadow-baseline-v1";

export type PdfDecisionShadowModelPrediction = {
  filingId: string;
  extractionRunId?: string | null;
  orgNumber?: string | null;
  fiscalYear?: number | null;
  modelVersion: PdfDecisionShadowModelVersion;
  featureSchemaVersion: string;
  predictions: {
    routeRecommendation: PdfDecisionMlRouteLabel;
    manualReviewProbability: number;
    correctionProbability: number;
    unreadableProbability: number;
    reprocessProbability: number;
    publishProbability: number;
  };
  confidence: {
    overall: number;
    route: number;
    manualReview: number;
  };
  explanations: string[];
  comparison?: {
    actualRouteLabel?: string | null;
    actualManualReviewRequired?: 0 | 1 | null;
    actualCorrected?: 0 | 1 | null;
    actualUnreadable?: 0 | 1 | null;
    actualPublished?: 0 | 1 | null;
    routeMatch?: boolean | null;
    manualReviewMatch?: boolean | null;
  };
};

export type PdfDecisionShadowModelEvaluation = {
  version: "pdf-decision-shadow-model-evaluation-v1";
  generatedAt: string;
  modelVersion: PdfDecisionShadowModelVersion;
  featureSchemaVersion: string;
  input: {
    limit: number;
    fiscalYear?: number;
    orgNumber?: string;
    split?: "train" | "validation" | "test" | "all";
  };
  recordCount: number;
  metrics: {
    routeAccuracy?: number | null;
    manualReviewAccuracy?: number | null;
    correctionBrierApprox?: number | null;
    unreadableBrierApprox?: number | null;
    publishBrierApprox?: number | null;
  };
  routePredictionDistribution: Record<string, number>;
  predictions: PdfDecisionShadowModelPrediction[];
};

export const PDF_DECISION_SHADOW_MODEL_VERSION =
  "pdf-decision-shadow-baseline-v1" satisfies PdfDecisionShadowModelVersion;

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}

function bool(record: PdfDecisionMlFeatureRecord, key: keyof PdfDecisionMlFeatureRecord["booleanFeatures"]) {
  return record.booleanFeatures[key];
}

function hasAny(values: string[], pattern: RegExp) {
  return values.some((value) => pattern.test(value));
}

function hasOcrSignal(record: PdfDecisionMlFeatureRecord) {
  return (
    bool(record, "isUnreadable") ||
    record.categoricalFeatures.qualityRisk === "HIGH" ||
    hasAny(
      [
        ...record.multiCategoricalFeatures.parserRiskReasons,
        ...record.multiCategoricalFeatures.manualReviewReasons,
        record.categoricalFeatures.recommendedRouteHint ?? "",
      ],
      /ocr|image|scan|low text|unreadable/i,
    )
  );
}

function hasOdlSignal(record: PdfDecisionMlFeatureRecord) {
  return hasAny(
    [
      ...record.multiCategoricalFeatures.parserRiskReasons,
      ...record.multiCategoricalFeatures.manualReviewReasons,
    ],
    /reading order|table|section|page hint|missing financial|balance section/i,
  );
}

function explain(explanations: string[], condition: boolean, text: string) {
  if (condition) explanations.push(text);
}

function probabilitySummary(values: number[]) {
  const spread = Math.max(...values) - Math.min(...values);
  return clamp01(0.55 + spread * 0.35);
}

function routeRecommendation(
  record: PdfDecisionMlFeatureRecord,
  probabilities: {
    manualReviewProbability: number;
    unreadableProbability: number;
    publishProbability: number;
  },
): PdfDecisionMlRouteLabel {
  const ocrSignal = hasOcrSignal(record);
  const odlSignal = hasOdlSignal(record);
  if (ocrSignal && odlSignal) return "HYBRID";
  if (probabilities.unreadableProbability >= 0.5 && ocrSignal) return "OCR";
  if (odlSignal && bool(record, "hasParserRiskReasons")) return "OPENDATALOADER_LOCAL";
  if (probabilities.manualReviewProbability >= 0.75) return "MANUAL_REVIEW";
  if (
    probabilities.publishProbability >= 0.6 &&
    record.categoricalFeatures.riskLevel !== "HIGH"
  ) {
    return "TEXT_LAYER";
  }
  if (probabilities.manualReviewProbability >= 0.6) return "MANUAL_REVIEW";
  return "UNKNOWN";
}

export function predictPdfDecisionShadowModel(
  record: PdfDecisionMlFeatureRecord,
): PdfDecisionShadowModelPrediction {
  const explanations: string[] = [];
  const highRisk = record.categoricalFeatures.riskLevel === "HIGH";
  const lowOrMissingConfidence =
    record.numericFeatures.confidenceScore === null ||
    record.numericFeatures.confidenceScore < 0.45;
  const highConfidence =
    record.numericFeatures.confidenceScore !== null &&
    record.numericFeatures.confidenceScore >= 0.75;

  let manualReviewProbability = 0.15;
  manualReviewProbability += highRisk ? 0.25 : 0;
  manualReviewProbability += bool(record, "hasBlockingRules") ? 0.2 : 0;
  manualReviewProbability += bool(record, "hasManualReviewReasons") ? 0.15 : 0;
  manualReviewProbability += bool(record, "hasParserRiskReasons") ? 0.15 : 0;
  manualReviewProbability +=
    bool(record, "isUnreadable") || bool(record, "isReprocessRequested") ? 0.2 : 0;
  manualReviewProbability -= bool(record, "isPublished") && !highRisk ? 0.2 : 0;
  manualReviewProbability = clamp01(manualReviewProbability);

  let correctionProbability = 0.1;
  correctionProbability += record.numericFeatures.reviewedFactCount > 0 ? 0.25 : 0;
  correctionProbability += record.numericFeatures.trainingLabelCount > 0 ? 0.2 : 0;
  correctionProbability += bool(record, "hasBlockingRules") ? 0.15 : 0;
  correctionProbability += bool(record, "hasCorrections") ? 0.15 : 0;
  correctionProbability = clamp01(correctionProbability);

  let unreadableProbability = 0.05;
  unreadableProbability += bool(record, "isUnreadable") ? 0.35 : 0;
  unreadableProbability += record.categoricalFeatures.qualityRisk === "HIGH" ? 0.2 : 0;
  unreadableProbability += bool(record, "hasParserRiskReasons") ? 0.15 : 0;
  unreadableProbability += lowOrMissingConfidence ? 0.15 : 0;
  unreadableProbability = clamp01(unreadableProbability);

  let reprocessProbability = 0.05;
  reprocessProbability += bool(record, "isReprocessRequested") ? 0.45 : 0;
  reprocessProbability += bool(record, "hasParserRiskReasons") ? 0.15 : 0;
  reprocessProbability += bool(record, "hasBlockingRules") ? 0.15 : 0;
  reprocessProbability = clamp01(reprocessProbability);

  let publishProbability = 0.5;
  publishProbability += bool(record, "isPublished") ? 0.25 : 0;
  publishProbability += highConfidence ? 0.1 : 0;
  publishProbability -= manualReviewProbability * 0.25;
  publishProbability -= unreadableProbability * 0.2;
  publishProbability = clamp01(publishProbability);

  explain(explanations, highRisk, "HIGH risk level increases manual review probability.");
  explain(explanations, bool(record, "hasBlockingRules"), "Blocking validation rules increase review and correction probability.");
  explain(explanations, bool(record, "hasParserRiskReasons"), "Parser risk reasons increase review and route uncertainty.");
  explain(explanations, bool(record, "isUnreadable"), "Unreadable label increases OCR/unreadable probability.");
  explain(explanations, bool(record, "isPublished"), "Published outcome increases publish probability.");
  explain(explanations, lowOrMissingConfidence, "Low or missing confidence increases unreadable/review probability.");
  if (explanations.length === 0) explanations.push("No strong risk signals; baseline remains conservative.");

  const route = routeRecommendation(record, {
    manualReviewProbability,
    unreadableProbability,
    publishProbability,
  });
  const routeConfidence = route === "UNKNOWN" ? 0.35 : probabilitySummary([
    manualReviewProbability,
    correctionProbability,
    unreadableProbability,
    reprocessProbability,
    publishProbability,
  ]);
  const manualReviewPrediction = manualReviewProbability >= 0.5 ? 1 : 0;

  return {
    filingId: record.ids.filingId,
    extractionRunId: record.ids.extractionRunId ?? null,
    orgNumber: record.ids.orgNumber ?? null,
    fiscalYear: record.ids.fiscalYear ?? null,
    modelVersion: PDF_DECISION_SHADOW_MODEL_VERSION,
    featureSchemaVersion: record.version,
    predictions: {
      routeRecommendation: route,
      manualReviewProbability,
      correctionProbability,
      unreadableProbability,
      reprocessProbability,
      publishProbability,
    },
    confidence: {
      overall: probabilitySummary([routeConfidence, 1 - Math.abs(manualReviewProbability - 0.5)]),
      route: routeConfidence,
      manualReview: clamp01(Math.abs(manualReviewProbability - 0.5) * 2),
    },
    explanations,
    comparison: {
      actualRouteLabel: record.labels.routeLabel,
      actualManualReviewRequired: record.labels.manualReviewRequired,
      actualCorrected: record.labels.corrected,
      actualUnreadable: record.labels.unreadable,
      actualPublished: record.labels.published,
      routeMatch: record.labels.routeLabel === "UNKNOWN" ? null : route === record.labels.routeLabel,
      manualReviewMatch: manualReviewPrediction === record.labels.manualReviewRequired,
    },
  };
}

function safeRate(matches: number, count: number) {
  if (count === 0) return null;
  return Number((matches / count).toFixed(4));
}

function brier(predictions: PdfDecisionShadowModelPrediction[], key: "correctionProbability" | "unreadableProbability" | "publishProbability") {
  const labelKey =
    key === "correctionProbability"
      ? "actualCorrected"
      : key === "unreadableProbability"
        ? "actualUnreadable"
        : "actualPublished";
  const eligible = predictions.filter((prediction) => prediction.comparison?.[labelKey] != null);
  if (eligible.length === 0) return null;
  const sum = eligible.reduce((acc, prediction) => {
    const actual = prediction.comparison?.[labelKey] ?? 0;
    const predicted = prediction.predictions[key];
    return acc + (predicted - actual) ** 2;
  }, 0);
  return Number((sum / eligible.length).toFixed(4));
}

export async function evaluatePdfDecisionShadowModel(
  input?: {
    limit?: number;
    fiscalYear?: number;
    orgNumber?: string;
    split?: "train" | "validation" | "test" | "all";
  },
  deps?: {
    buildFeatureDataset?: typeof buildPdfDecisionMlFeatureDataset;
  },
): Promise<PdfDecisionShadowModelEvaluation> {
  const limit = input?.limit ?? 100;
  const split = input?.split ?? "all";
  const dataset = await (deps?.buildFeatureDataset ?? buildPdfDecisionMlFeatureDataset)({
    limit,
    fiscalYear: input?.fiscalYear,
    orgNumber: input?.orgNumber,
    includeSplits: true,
  });
  const records = split === "all" ? dataset.records : dataset.records.filter((record) => record.split === split);
  const predictions = records.map(predictPdfDecisionShadowModel);
  const routeEligible = predictions.filter((prediction) => prediction.comparison?.routeMatch != null);
  const manualEligible = predictions.filter((prediction) => prediction.comparison?.manualReviewMatch != null);
  const routeMatches = routeEligible.filter((prediction) => prediction.comparison?.routeMatch).length;
  const manualMatches = manualEligible.filter((prediction) => prediction.comparison?.manualReviewMatch).length;
  const routePredictionDistribution: Record<string, number> = {};
  for (const prediction of predictions) {
    const route = prediction.predictions.routeRecommendation;
    routePredictionDistribution[route] = (routePredictionDistribution[route] ?? 0) + 1;
  }

  return {
    version: "pdf-decision-shadow-model-evaluation-v1",
    generatedAt: new Date().toISOString(),
    modelVersion: PDF_DECISION_SHADOW_MODEL_VERSION,
    featureSchemaVersion: dataset.schemaVersion,
    input: {
      limit,
      fiscalYear: input?.fiscalYear,
      orgNumber: input?.orgNumber,
      split,
    },
    recordCount: predictions.length,
    metrics: {
      routeAccuracy: safeRate(routeMatches, routeEligible.length),
      manualReviewAccuracy: safeRate(manualMatches, manualEligible.length),
      correctionBrierApprox: brier(predictions, "correctionProbability"),
      unreadableBrierApprox: brier(predictions, "unreadableProbability"),
      publishBrierApprox: brier(predictions, "publishProbability"),
    },
    routePredictionDistribution,
    predictions,
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

function validProbability(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validatePdfDecisionShadowModelPrediction(
  prediction: PdfDecisionShadowModelPrediction,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (prediction.modelVersion !== PDF_DECISION_SHADOW_MODEL_VERSION) issues.push("Invalid model version.");
  if (!prediction.filingId) issues.push("filingId is required.");
  for (const [key, value] of Object.entries(prediction.predictions)) {
    if (key === "routeRecommendation") continue;
    if (!validProbability(value as number)) issues.push(`${key} must be 0-1.`);
  }
  for (const [key, value] of Object.entries(prediction.confidence)) {
    if (!validProbability(value)) issues.push(`${key} confidence must be 0-1.`);
  }
  if (hasInvalidNumber(prediction)) issues.push("Prediction contains NaN or Infinity.");
  if (hasRawPayloadKey(prediction)) issues.push("Prediction contains raw PDF/text payload keys.");
  return { valid: issues.length === 0, issues };
}

export function validatePdfDecisionShadowModelEvaluation(
  evaluation: PdfDecisionShadowModelEvaluation,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (evaluation.version !== "pdf-decision-shadow-model-evaluation-v1") issues.push("Invalid evaluation version.");
  if (hasInvalidNumber(evaluation)) issues.push("Evaluation contains NaN or Infinity.");
  if (hasRawPayloadKey(evaluation)) issues.push("Evaluation contains raw PDF/text payload keys.");
  for (const prediction of evaluation.predictions) {
    const validation = validatePdfDecisionShadowModelPrediction(prediction);
    for (const issue of validation.issues) issues.push(`${prediction.filingId || "unknown"}: ${issue}`);
  }
  try {
    JSON.stringify(evaluation);
  } catch {
    issues.push("Evaluation is not JSON-safe.");
  }
  return { valid: issues.length === 0, issues };
}

export function serializePdfDecisionShadowModelEvaluationAsJson(
  evaluation: PdfDecisionShadowModelEvaluation,
): string {
  return JSON.stringify(evaluation, null, 2);
}
