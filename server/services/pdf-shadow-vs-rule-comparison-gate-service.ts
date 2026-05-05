import {
  evaluatePdfDecisionShadowModel,
  type PdfDecisionShadowModelPrediction,
  type PdfDecisionShadowModelEvaluation,
} from "@/server/services/pdf-decision-shadow-model-service";
import { buildPdfDecisionMlFeatureDataset } from "@/server/services/pdf-decision-ml-feature-schema-service";
import {
  validatePdfDecisionModelRegistryManifest,
  assertPdfDecisionModelManifestSafeForShadowEvaluation,
  type PdfDecisionModelRegistryManifest,
} from "@/server/services/pdf-decision-model-registry-contract-service";

export type PdfShadowVsRuleGateStatus =
  | "PASS"
  | "WARN"
  | "FAIL"
  | "INSUFFICIENT_DATA";

export type PdfShadowVsRuleGateCheckCode =
  | "MIN_RECORD_COUNT"
  | "ROUTE_ACCURACY"
  | "MANUAL_REVIEW_RECALL"
  | "HIGH_RISK_NO_REGRESSION"
  | "UNREADABLE_RECALL"
  | "PUBLISH_SAFETY"
  | "GOLD_SET_COVERAGE"
  | "CALIBRATION_ERROR"
  | "RULE_BASELINE_COMPARISON";

export type PdfShadowVsRuleGateCheck = {
  code: PdfShadowVsRuleGateCheckCode;
  status: PdfShadowVsRuleGateStatus;
  message: string;
  observedValue?: number | null;
  threshold?: number | null;
};

export type PdfShadowVsRuleComparisonItem = {
  filingId: string;
  extractionRunId?: string | null;
  orgNumber?: string | null;
  fiscalYear?: number | null;
  split?: string | null;

  ruleRoute?: string | null;
  ruleRiskLevel?: string | null;
  ruleConfidenceScore?: number | null;

  shadowRoute: string;
  shadowManualReviewProbability: number;
  shadowUnreadableProbability: number;
  shadowPublishProbability: number;

  actualRouteLabel?: string | null;
  actualManualReviewRequired?: 0 | 1 | null;
  actualUnreadable?: 0 | 1 | null;
  actualPublished?: 0 | 1 | null;

  disagreementType:
    | "NONE"
    | "ROUTE_DISAGREEMENT"
    | "SHADOW_MORE_CONSERVATIVE"
    | "SHADOW_LESS_CONSERVATIVE"
    | "PUBLISH_SAFETY_CONCERN"
    | "MANUAL_REVIEW_SAFETY_CONCERN"
    | "UNREADABLE_SAFETY_CONCERN";

  severity: "LOW" | "MEDIUM" | "HIGH";
  notes: string[];
};

export type PdfShadowVsRuleComparisonGateReport = {
  version: "pdf-shadow-vs-rule-comparison-gate-v1";
  generatedAt: string;
  input: {
    limit: number;
    fiscalYear?: number;
    orgNumber?: string;
    split?: "train" | "validation" | "test" | "all";
    minRecordCount: number;
  };

  model?: {
    modelId?: string | null;
    modelVersion?: string | null;
    featureSchemaVersion?: string | null;
    lifecycleStage?: string | null;
  };

  status: PdfShadowVsRuleGateStatus;
  checks: PdfShadowVsRuleGateCheck[];

  summary: {
    recordCount: number;
    disagreementCount: number;
    highSeverityDisagreementCount: number;
    shadowMoreConservativeCount: number;
    shadowLessConservativeCount: number;
    publishSafetyConcernCount: number;
    manualReviewSafetyConcernCount: number;
    unreadableSafetyConcernCount: number;
  };

  metrics: {
    shadowRouteAccuracy?: number | null;
    shadowManualReviewRecall?: number | null;
    shadowUnreadableRecall?: number | null;
    shadowPublishPrecision?: number | null;
    calibrationErrorApprox?: number | null;
  };

  items: PdfShadowVsRuleComparisonItem[];
};

// ---- Gate check builders ----

function safeDiv(a: number, b: number): number | null {
  return b === 0 ? null : Number((a / b).toFixed(4));
}

function checkMinRecordCount(
  recordCount: number,
  minRecordCount: number,
): PdfShadowVsRuleGateCheck {
  if (recordCount === 0) {
    return {
      code: "MIN_RECORD_COUNT",
      status: "INSUFFICIENT_DATA",
      message: "No records available for comparison.",
      observedValue: 0,
      threshold: minRecordCount,
    };
  }
  if (recordCount < minRecordCount) {
    return {
      code: "MIN_RECORD_COUNT",
      status: "WARN",
      message: `Record count ${recordCount} is below minimum threshold ${minRecordCount}.`,
      observedValue: recordCount,
      threshold: minRecordCount,
    };
  }
  return {
    code: "MIN_RECORD_COUNT",
    status: "PASS",
    message: `Record count ${recordCount} meets minimum threshold.`,
    observedValue: recordCount,
    threshold: minRecordCount,
  };
}

function checkRouteAccuracy(
  predictions: PdfDecisionShadowModelPrediction[],
): PdfShadowVsRuleGateCheck {
  const eligible = predictions.filter(
    (p) => p.comparison?.routeMatch != null,
  );
  if (eligible.length === 0) {
    return {
      code: "ROUTE_ACCURACY",
      status: "INSUFFICIENT_DATA",
      message: "No route labels available to evaluate route accuracy.",
      observedValue: null,
      threshold: 0.7,
    };
  }
  const matched = eligible.filter((p) => p.comparison!.routeMatch).length;
  const accuracy = matched / eligible.length;
  if (accuracy >= 0.7) {
    return {
      code: "ROUTE_ACCURACY",
      status: "PASS",
      message: `Shadow route accuracy ${(accuracy * 100).toFixed(1)}% meets threshold (70%).`,
      observedValue: Number(accuracy.toFixed(4)),
      threshold: 0.7,
    };
  }
  if (accuracy >= 0.55) {
    return {
      code: "ROUTE_ACCURACY",
      status: "WARN",
      message: `Shadow route accuracy ${(accuracy * 100).toFixed(1)}% is below 70% but above 55%.`,
      observedValue: Number(accuracy.toFixed(4)),
      threshold: 0.7,
    };
  }
  return {
    code: "ROUTE_ACCURACY",
    status: "FAIL",
    message: `Shadow route accuracy ${(accuracy * 100).toFixed(1)}% is below 55% threshold.`,
    observedValue: Number(accuracy.toFixed(4)),
    threshold: 0.55,
  };
}

function checkManualReviewRecall(
  predictions: PdfDecisionShadowModelPrediction[],
  threshold = 0.5,
): PdfShadowVsRuleGateCheck {
  const eligible = predictions.filter(
    (p) => p.comparison?.actualManualReviewRequired != null,
  );
  const positives = eligible.filter((p) => p.comparison!.actualManualReviewRequired === 1);
  if (positives.length === 0) {
    return {
      code: "MANUAL_REVIEW_RECALL",
      status: "INSUFFICIENT_DATA",
      message: "No actual manual-review positive labels available.",
      observedValue: null,
      threshold: 0.9,
    };
  }
  const truePositives = positives.filter(
    (p) => p.predictions.manualReviewProbability >= threshold,
  ).length;
  const recall = truePositives / positives.length;
  if (recall >= 0.9) {
    return {
      code: "MANUAL_REVIEW_RECALL",
      status: "PASS",
      message: `Manual review recall ${(recall * 100).toFixed(1)}% meets threshold (90%).`,
      observedValue: Number(recall.toFixed(4)),
      threshold: 0.9,
    };
  }
  if (recall >= 0.8) {
    return {
      code: "MANUAL_REVIEW_RECALL",
      status: "WARN",
      message: `Manual review recall ${(recall * 100).toFixed(1)}% is below 90% but above 80%.`,
      observedValue: Number(recall.toFixed(4)),
      threshold: 0.9,
    };
  }
  return {
    code: "MANUAL_REVIEW_RECALL",
    status: "FAIL",
    message: `Manual review recall ${(recall * 100).toFixed(1)}% is below 80% — shadow model misses too many manual review cases.`,
    observedValue: Number(recall.toFixed(4)),
    threshold: 0.8,
  };
}

function checkHighRiskNoRegression(
  predictions: PdfDecisionShadowModelPrediction[],
): PdfShadowVsRuleGateCheck {
  // Find high-risk actual manual review cases where shadow suggests high publish probability
  const highRiskManualReview = predictions.filter(
    (p) =>
      p.comparison?.actualManualReviewRequired === 1 &&
      p.predictions.publishProbability >= 0.7,
  );
  if (highRiskManualReview.length === 0) {
    return {
      code: "HIGH_RISK_NO_REGRESSION",
      status: "PASS",
      message: "No high-risk manual-review cases predicted as publishable by shadow model.",
      observedValue: 0,
      threshold: 0,
    };
  }
  const eligible = predictions.filter(
    (p) => p.comparison?.actualManualReviewRequired != null,
  );
  return {
    code: "HIGH_RISK_NO_REGRESSION",
    status: "FAIL",
    message: `Shadow model assigns high publish probability (≥70%) to ${highRiskManualReview.length} actual manual-review cases — safety regression.`,
    observedValue: highRiskManualReview.length,
    threshold: 0,
  };
}

function checkUnreadableRecall(
  predictions: PdfDecisionShadowModelPrediction[],
  threshold = 0.5,
): PdfShadowVsRuleGateCheck {
  const positives = predictions.filter(
    (p) => p.comparison?.actualUnreadable === 1,
  );
  if (positives.length === 0) {
    return {
      code: "UNREADABLE_RECALL",
      status: "INSUFFICIENT_DATA",
      message: "No actual unreadable positive labels available.",
      observedValue: null,
      threshold: 0.9,
    };
  }
  const truePositives = positives.filter(
    (p) => p.predictions.unreadableProbability >= threshold,
  ).length;
  const recall = truePositives / positives.length;
  if (recall >= 0.9) {
    return {
      code: "UNREADABLE_RECALL",
      status: "PASS",
      message: `Unreadable recall ${(recall * 100).toFixed(1)}% meets threshold (90%).`,
      observedValue: Number(recall.toFixed(4)),
      threshold: 0.9,
    };
  }
  return {
    code: "UNREADABLE_RECALL",
    status: "WARN",
    message: `Unreadable recall ${(recall * 100).toFixed(1)}% — insufficient labels or below threshold.`,
    observedValue: Number(recall.toFixed(4)),
    threshold: 0.9,
  };
}

function checkPublishSafety(
  predictions: PdfDecisionShadowModelPrediction[],
): PdfShadowVsRuleGateCheck {
  // Shadow assigns high publishProbability (>=0.7) to records that are actually
  // manual review required, unreadable, or failed
  const unsafe = predictions.filter(
    (p) =>
      p.predictions.publishProbability >= 0.7 &&
      (p.comparison?.actualManualReviewRequired === 1 ||
        p.comparison?.actualUnreadable === 1),
  );
  if (unsafe.length === 0) {
    return {
      code: "PUBLISH_SAFETY",
      status: "PASS",
      message: "No publish-safety concerns detected.",
      observedValue: 0,
      threshold: 0,
    };
  }
  return {
    code: "PUBLISH_SAFETY",
    status: "FAIL",
    message: `Shadow assigns high publish probability to ${unsafe.length} actual bad-outcome record(s) — publish safety concern.`,
    observedValue: unsafe.length,
    threshold: 0,
  };
}

function checkGoldSetCoverage(
  predictions: PdfDecisionShadowModelPrediction[],
): PdfShadowVsRuleGateCheck {
  // Gold-set info isn't directly on predictions in the current schema.
  // We approximate by checking if there are any comparison labels at all
  // (as a proxy for gold-set / labelled records coverage).
  const withLabels = predictions.filter(
    (p) =>
      p.comparison?.actualRouteLabel != null ||
      p.comparison?.actualManualReviewRequired != null,
  );
  if (withLabels.length === 0) {
    return {
      code: "GOLD_SET_COVERAGE",
      status: "WARN",
      message: "No labelled records found in evaluation — gold-set coverage unknown.",
      observedValue: 0,
      threshold: null,
    };
  }
  const coverageRate = withLabels.length / predictions.length;
  return {
    code: "GOLD_SET_COVERAGE",
    status: coverageRate >= 0.1 ? "PASS" : "WARN",
    message: `${withLabels.length}/${predictions.length} records have labels (${(coverageRate * 100).toFixed(1)}%).`,
    observedValue: Number(coverageRate.toFixed(4)),
    threshold: 0.1,
  };
}

function checkCalibrationError(
  predictions: PdfDecisionShadowModelPrediction[],
): PdfShadowVsRuleGateCheck {
  // Compute approximate calibration error for manual review
  const withLabel = predictions.filter(
    (p) => p.comparison?.actualManualReviewRequired != null,
  );
  if (withLabel.length < 5) {
    return {
      code: "CALIBRATION_ERROR",
      status: "INSUFFICIENT_DATA",
      message: "Insufficient labelled records for calibration check.",
      observedValue: null,
      threshold: 0.2,
    };
  }
  const sumSqErr = withLabel.reduce((acc, p) => {
    const actual = p.comparison!.actualManualReviewRequired as number;
    const pred = p.predictions.manualReviewProbability;
    return acc + (pred - actual) ** 2;
  }, 0);
  const brier = sumSqErr / withLabel.length;
  if (brier <= 0.15) {
    return {
      code: "CALIBRATION_ERROR",
      status: "PASS",
      message: `Manual review Brier score ${brier.toFixed(4)} ≤ 0.15.`,
      observedValue: Number(brier.toFixed(4)),
      threshold: 0.15,
    };
  }
  if (brier <= 0.25) {
    return {
      code: "CALIBRATION_ERROR",
      status: "WARN",
      message: `Manual review Brier score ${brier.toFixed(4)} is above 0.15 but ≤ 0.25.`,
      observedValue: Number(brier.toFixed(4)),
      threshold: 0.25,
    };
  }
  return {
    code: "CALIBRATION_ERROR",
    status: "FAIL",
    message: `Manual review Brier score ${brier.toFixed(4)} exceeds 0.25 — poor calibration.`,
    observedValue: Number(brier.toFixed(4)),
    threshold: 0.25,
  };
}

function checkRuleBaselineComparison(
  predictions: PdfDecisionShadowModelPrediction[],
): PdfShadowVsRuleGateCheck {
  // Count records where rule route is a conservative route (MANUAL_REVIEW, OCR, HYBRID)
  // but shadow gives high publish probability — shadow less conservative than rules
  const lessConservativeCount = predictions.filter((p) => {
    const ruleRoute = p.comparison?.actualRouteLabel;
    const isRuleConservative =
      ruleRoute === "MANUAL_REVIEW" || ruleRoute === "OCR" || ruleRoute === "HYBRID";
    return isRuleConservative && p.predictions.publishProbability >= 0.65;
  }).length;

  if (lessConservativeCount === 0) {
    return {
      code: "RULE_BASELINE_COMPARISON",
      status: "PASS",
      message: "Shadow model is not materially less conservative than rule baseline on high-risk cases.",
      observedValue: 0,
      threshold: 0,
    };
  }
  return {
    code: "RULE_BASELINE_COMPARISON",
    status: "WARN",
    message: `Shadow assigns high publish probability to ${lessConservativeCount} case(s) where rule baseline is conservative (MANUAL_REVIEW/OCR/HYBRID).`,
    observedValue: lessConservativeCount,
    threshold: 0,
  };
}

// ---- Overall gate status ----

function computeGateStatus(checks: PdfShadowVsRuleGateCheck[]): PdfShadowVsRuleGateStatus {
  // Zero records: MIN_RECORD_COUNT is INSUFFICIENT_DATA → force overall INSUFFICIENT_DATA
  const minCheck = checks.find((c) => c.code === "MIN_RECORD_COUNT");
  if (minCheck?.status === "INSUFFICIENT_DATA") return "INSUFFICIENT_DATA";
  if (checks.some((c) => c.status === "FAIL")) return "FAIL";
  if (checks.some((c) => c.status === "WARN")) return "WARN";
  // If every non-passing check is INSUFFICIENT_DATA and nothing passed, return INSUFFICIENT_DATA
  if (checks.every((c) => c.status === "INSUFFICIENT_DATA")) return "INSUFFICIENT_DATA";
  return "PASS";
}

// ---- Disagreement classification ----

function classifyDisagreement(
  p: PdfDecisionShadowModelPrediction,
): {
  disagreementType: PdfShadowVsRuleComparisonItem["disagreementType"];
  severity: PdfShadowVsRuleComparisonItem["severity"];
  notes: string[];
} {
  const notes: string[] = [];
  const shadowRoute = p.predictions.routeRecommendation;
  const actualRoute = p.comparison?.actualRouteLabel ?? null;
  const actualManualReview = p.comparison?.actualManualReviewRequired;
  const actualUnreadable = p.comparison?.actualUnreadable;

  // Publish safety concern — shadow says publishable but actual outcome is bad
  if (
    p.predictions.publishProbability >= 0.7 &&
    (actualManualReview === 1 || actualUnreadable === 1)
  ) {
    notes.push(
      `Shadow publish probability ${p.predictions.publishProbability.toFixed(3)} on actual bad outcome.`,
    );
    return { disagreementType: "PUBLISH_SAFETY_CONCERN", severity: "HIGH", notes };
  }

  // Manual review safety concern — actual requires review but shadow misses it
  if (actualManualReview === 1 && p.predictions.manualReviewProbability < 0.3) {
    notes.push(
      `Shadow manual review probability ${p.predictions.manualReviewProbability.toFixed(3)} on actual manual-review record.`,
    );
    return { disagreementType: "MANUAL_REVIEW_SAFETY_CONCERN", severity: "HIGH", notes };
  }

  // Unreadable safety concern
  if (actualUnreadable === 1 && p.predictions.unreadableProbability < 0.3) {
    notes.push(
      `Shadow unreadable probability ${p.predictions.unreadableProbability.toFixed(3)} on actual unreadable record.`,
    );
    return { disagreementType: "UNREADABLE_SAFETY_CONCERN", severity: "MEDIUM", notes };
  }

  // Route disagreement
  const conservativeRoutes = new Set(["MANUAL_REVIEW", "OCR", "HYBRID", "OPENDATALOADER_LOCAL"]);
  const shadowConservative = conservativeRoutes.has(shadowRoute);
  const ruleConservative = actualRoute ? conservativeRoutes.has(actualRoute) : false;

  if (actualRoute && actualRoute !== "UNKNOWN" && shadowRoute !== actualRoute) {
    if (shadowConservative && !ruleConservative) {
      notes.push(
        `Shadow recommends ${shadowRoute} where rules recommend ${actualRoute} — shadow more conservative.`,
      );
      return { disagreementType: "SHADOW_MORE_CONSERVATIVE", severity: "LOW", notes };
    }
    if (!shadowConservative && ruleConservative) {
      notes.push(
        `Shadow recommends ${shadowRoute} where rules recommend ${actualRoute} — shadow less conservative.`,
      );
      return { disagreementType: "SHADOW_LESS_CONSERVATIVE", severity: "MEDIUM", notes };
    }
    notes.push(`Route disagreement: shadow=${shadowRoute}, rule/actual=${actualRoute}.`);
    return { disagreementType: "ROUTE_DISAGREEMENT", severity: "LOW", notes };
  }

  return { disagreementType: "NONE", severity: "LOW", notes: [] };
}

function buildItems(
  predictions: PdfDecisionShadowModelPrediction[],
): PdfShadowVsRuleComparisonItem[] {
  return predictions.map((p) => {
    const { disagreementType, severity, notes } = classifyDisagreement(p);
    return {
      filingId: p.filingId,
      extractionRunId: p.extractionRunId ?? null,
      orgNumber: p.orgNumber ?? null,
      fiscalYear: p.fiscalYear ?? null,
      split: null,

      ruleRoute: p.comparison?.actualRouteLabel ?? null,
      ruleRiskLevel: null,
      ruleConfidenceScore: null,

      shadowRoute: p.predictions.routeRecommendation,
      shadowManualReviewProbability: p.predictions.manualReviewProbability,
      shadowUnreadableProbability: p.predictions.unreadableProbability,
      shadowPublishProbability: p.predictions.publishProbability,

      actualRouteLabel: p.comparison?.actualRouteLabel ?? null,
      actualManualReviewRequired: p.comparison?.actualManualReviewRequired ?? null,
      actualUnreadable: p.comparison?.actualUnreadable ?? null,
      actualPublished: p.comparison?.actualPublished ?? null,

      disagreementType,
      severity,
      notes,
    };
  });
}

// ---- Main builder ----

export async function buildPdfShadowVsRuleComparisonGateReport(
  input?: {
    limit?: number;
    fiscalYear?: number;
    orgNumber?: string;
    split?: "train" | "validation" | "test" | "all";
    minRecordCount?: number;
    modelManifest?: PdfDecisionModelRegistryManifest;
  },
  deps?: {
    buildFeatureDataset?: typeof buildPdfDecisionMlFeatureDataset;
    evaluateShadowModel?: (
      input: Parameters<typeof evaluatePdfDecisionShadowModel>[0],
      deps?: Parameters<typeof evaluatePdfDecisionShadowModel>[1],
    ) => Promise<PdfDecisionShadowModelEvaluation>;
  },
): Promise<PdfShadowVsRuleComparisonGateReport> {
  const limit = input?.limit ?? 100;
  const minRecordCount = input?.minRecordCount ?? 10;
  const split = input?.split ?? "all";

  // Validate manifest if provided
  if (input?.modelManifest) {
    assertPdfDecisionModelManifestSafeForShadowEvaluation(input.modelManifest);
  }

  const evaluateFn = deps?.evaluateShadowModel ?? evaluatePdfDecisionShadowModel;
  const evaluation = await evaluateFn(
    { limit, fiscalYear: input?.fiscalYear, orgNumber: input?.orgNumber, split },
    { buildFeatureDataset: deps?.buildFeatureDataset },
  );

  const predictions = evaluation.predictions;

  const checks: PdfShadowVsRuleGateCheck[] = [
    checkMinRecordCount(predictions.length, minRecordCount),
    checkRouteAccuracy(predictions),
    checkManualReviewRecall(predictions),
    checkHighRiskNoRegression(predictions),
    checkUnreadableRecall(predictions),
    checkPublishSafety(predictions),
    checkGoldSetCoverage(predictions),
    checkCalibrationError(predictions),
    checkRuleBaselineComparison(predictions),
  ];

  const items = buildItems(predictions);

  const disagreements = items.filter((i) => i.disagreementType !== "NONE");
  const summary = {
    recordCount: predictions.length,
    disagreementCount: disagreements.length,
    highSeverityDisagreementCount: disagreements.filter((i) => i.severity === "HIGH").length,
    shadowMoreConservativeCount: items.filter(
      (i) => i.disagreementType === "SHADOW_MORE_CONSERVATIVE",
    ).length,
    shadowLessConservativeCount: items.filter(
      (i) => i.disagreementType === "SHADOW_LESS_CONSERVATIVE",
    ).length,
    publishSafetyConcernCount: items.filter(
      (i) => i.disagreementType === "PUBLISH_SAFETY_CONCERN",
    ).length,
    manualReviewSafetyConcernCount: items.filter(
      (i) => i.disagreementType === "MANUAL_REVIEW_SAFETY_CONCERN",
    ).length,
    unreadableSafetyConcernCount: items.filter(
      (i) => i.disagreementType === "UNREADABLE_SAFETY_CONCERN",
    ).length,
  };

  // Compute metrics
  const routeEligible = predictions.filter((p) => p.comparison?.routeMatch != null);
  const routeMatches = routeEligible.filter((p) => p.comparison?.routeMatch).length;
  const mrPositives = predictions.filter((p) => p.comparison?.actualManualReviewRequired === 1);
  const mrTp = mrPositives.filter((p) => p.predictions.manualReviewProbability >= 0.5).length;
  const unreadablePositives = predictions.filter((p) => p.comparison?.actualUnreadable === 1);
  const unreadableTp = unreadablePositives.filter(
    (p) => p.predictions.unreadableProbability >= 0.5,
  ).length;
  const publishPredicted = predictions.filter((p) => p.predictions.publishProbability >= 0.5);
  const publishTp = publishPredicted.filter((p) => p.comparison?.actualPublished === 1).length;

  const metrics = {
    shadowRouteAccuracy: safeDiv(routeMatches, routeEligible.length),
    shadowManualReviewRecall: safeDiv(mrTp, mrPositives.length),
    shadowUnreadableRecall: safeDiv(unreadableTp, unreadablePositives.length),
    shadowPublishPrecision: safeDiv(publishTp, publishPredicted.length),
    calibrationErrorApprox: (() => {
      const withLabel = predictions.filter(
        (p) => p.comparison?.actualManualReviewRequired != null,
      );
      if (withLabel.length === 0) return null;
      const sum = withLabel.reduce((acc, p) => {
        const actual = p.comparison!.actualManualReviewRequired as number;
        return acc + Math.abs(p.predictions.manualReviewProbability - actual);
      }, 0);
      return Number((sum / withLabel.length).toFixed(4));
    })(),
  };

  const modelBlock = input?.modelManifest
    ? {
        modelId: input.modelManifest.modelId,
        modelVersion: input.modelManifest.modelVersion,
        featureSchemaVersion: input.modelManifest.featureSchemaVersion,
        lifecycleStage: input.modelManifest.lifecycleStage,
      }
    : undefined;

  return {
    version: "pdf-shadow-vs-rule-comparison-gate-v1",
    generatedAt: new Date().toISOString(),
    input: {
      limit,
      fiscalYear: input?.fiscalYear,
      orgNumber: input?.orgNumber,
      split,
      minRecordCount,
    },
    ...(modelBlock ? { model: modelBlock } : {}),
    status: computeGateStatus(checks),
    checks,
    summary,
    metrics,
    items,
  };
}

// ---- Validation and serialization ----

function hasInvalidNumber(value: unknown): boolean {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasInvalidNumber);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasInvalidNumber);
  }
  return false;
}

function hasRawPayloadKey(value: unknown): boolean {
  const rawKeys = new Set([
    "rawPdf", "pdfBuffer", "rawText", "fullText", "structuredDocument", "pagesText",
  ]);
  if (Array.isArray(value)) return value.some(hasRawPayloadKey);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => rawKeys.has(key) || hasRawPayloadKey(nested),
    );
  }
  return false;
}

const VALID_STATUSES = new Set<PdfShadowVsRuleGateStatus>(["PASS", "WARN", "FAIL", "INSUFFICIENT_DATA"]);
const VALID_CHECK_CODES = new Set<PdfShadowVsRuleGateCheckCode>([
  "MIN_RECORD_COUNT", "ROUTE_ACCURACY", "MANUAL_REVIEW_RECALL",
  "HIGH_RISK_NO_REGRESSION", "UNREADABLE_RECALL", "PUBLISH_SAFETY",
  "GOLD_SET_COVERAGE", "CALIBRATION_ERROR", "RULE_BASELINE_COMPARISON",
]);

export function validatePdfShadowVsRuleComparisonGateReport(
  report: PdfShadowVsRuleComparisonGateReport,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (report.version !== "pdf-shadow-vs-rule-comparison-gate-v1") {
    issues.push("Invalid report version.");
  }
  if (!VALID_STATUSES.has(report.status)) {
    issues.push(`Invalid status: ${report.status}.`);
  }
  if (hasInvalidNumber(report)) {
    issues.push("Report contains NaN or Infinity.");
  }
  if (hasRawPayloadKey(report)) {
    issues.push("Report contains raw PDF/text payload keys.");
  }

  for (const check of report.checks) {
    if (!VALID_CHECK_CODES.has(check.code)) {
      issues.push(`Unknown check code: ${check.code}.`);
    }
    if (!VALID_STATUSES.has(check.status)) {
      issues.push(`Check ${check.code} has invalid status: ${check.status}.`);
    }
  }

  // Probabilities in items must be 0–1
  for (const item of report.items) {
    for (const key of [
      "shadowManualReviewProbability",
      "shadowUnreadableProbability",
      "shadowPublishProbability",
    ] as const) {
      const v = item[key];
      if (typeof v === "number" && (v < 0 || v > 1)) {
        issues.push(`Item ${item.filingId}.${key} out of range [0,1].`);
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

export function serializePdfShadowVsRuleComparisonGateReportAsJson(
  report: PdfShadowVsRuleComparisonGateReport,
): string {
  return JSON.stringify(report, null, 2);
}
