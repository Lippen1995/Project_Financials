import {
  evaluatePdfOcrOdlRouteCandidates,
  type PdfExtractionRouteCandidate,
  type PdfOcrOdlRouteEvaluationItem,
  type PdfOcrOdlRouteEvaluationResult,
} from "@/server/services/pdf-ocr-odl-route-evaluation-service";

export type PdfRouteExperimentRecommendationType =
  | "KEEP_TEXT_LAYER"
  | "TRY_OPENDATALOADER"
  | "TRY_OCR"
  | "TRY_HYBRID"
  | "MANUAL_REVIEW_REQUIRED"
  | "INSUFFICIENT_EVIDENCE";

export type PdfRouteExperimentOutcomeBand =
  | "LIKELY_IMPROVEMENT"
  | "POSSIBLE_IMPROVEMENT"
  | "NO_CHANGE"
  | "POSSIBLE_REGRESSION"
  | "INSUFFICIENT_EVIDENCE";

export type PdfRouteRecommendationExperimentItem = {
  filingId: string;
  extractionRunId?: string | null;
  orgNumber?: string | null;
  fiscalYear?: number | null;
  currentRoute?: string | null;
  evaluatedRecommendedRoute: string;
  experimentRecommendation: PdfRouteExperimentRecommendationType;
  outcomeBand: PdfRouteExperimentOutcomeBand;
  currentOutcome?: string | null;
  currentRiskLevel?: string | null;
  currentConfidenceScore?: number | null;
  recommendationStrength: "LOW" | "MEDIUM" | "HIGH";
  samplePriority: number;
  evidence: string[];
  risks: string[];
  suggestedExperiment:
    | "NO_EXPERIMENT"
    | "SHADOW_RUN_OPENDATALOADER"
    | "SHADOW_RUN_OCR"
    | "SHADOW_RUN_HYBRID"
    | "MANUAL_REVIEW_BEFORE_ROUTE_CHANGE";
  safeToExperiment: boolean;
};

export type PdfRouteRecommendationExperimentReport = {
  version: "pdf-route-recommendation-experiment-v1";
  generatedAt: string;
  input: {
    limit: number;
    fiscalYear?: number;
    orgNumber?: string;
    includeLowPriority: boolean;
  };
  totalDocuments: number;
  experimentCandidateCount: number;
  recommendationDistribution: Record<PdfRouteExperimentRecommendationType, number>;
  outcomeBandDistribution: Record<PdfRouteExperimentOutcomeBand, number>;
  suggestedExperimentDistribution: Record<string, number>;
  items: PdfRouteRecommendationExperimentItem[];
};

const RECOMMENDATIONS: PdfRouteExperimentRecommendationType[] = [
  "KEEP_TEXT_LAYER",
  "TRY_OPENDATALOADER",
  "TRY_OCR",
  "TRY_HYBRID",
  "MANUAL_REVIEW_REQUIRED",
  "INSUFFICIENT_EVIDENCE",
];

const OUTCOME_BANDS: PdfRouteExperimentOutcomeBand[] = [
  "LIKELY_IMPROVEMENT",
  "POSSIBLE_IMPROVEMENT",
  "NO_CHANGE",
  "POSSIBLE_REGRESSION",
  "INSUFFICIENT_EVIDENCE",
];

function emptyCounts<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

function isStableTextLayer(item: PdfOcrOdlRouteEvaluationItem) {
  return (
    item.recommendedRoute === "TEXT_LAYER" &&
    (item.currentOutcome === "PUBLISHED" || item.currentOutcome === "MANUAL_REVIEW_ACCEPTED") &&
    (item.currentConfidenceScore ?? 0) >= 0.65 &&
    item.signals.every((signal) => signal === "OTHER")
  );
}

function hasStrongOcrEvidence(item: PdfOcrOdlRouteEvaluationItem) {
  return item.signals.includes("UNREADABLE") || item.signals.includes("IMAGE_ONLY_OR_LOW_TEXT_DENSITY");
}

function recommendationFor(item: PdfOcrOdlRouteEvaluationItem): {
  experimentRecommendation: PdfRouteExperimentRecommendationType;
  outcomeBand: PdfRouteExperimentOutcomeBand;
  suggestedExperiment: PdfRouteRecommendationExperimentItem["suggestedExperiment"];
} {
  if (isStableTextLayer(item)) {
    return {
      experimentRecommendation: "KEEP_TEXT_LAYER",
      outcomeBand: "NO_CHANGE",
      suggestedExperiment: "NO_EXPERIMENT",
    };
  }

  if (item.recommendedRoute === "TEXT_LAYER") {
    return {
      experimentRecommendation: "KEEP_TEXT_LAYER",
      outcomeBand: "NO_CHANGE",
      suggestedExperiment: "NO_EXPERIMENT",
    };
  }
  if (item.recommendedRoute === "OPENDATALOADER_LOCAL") {
    return {
      experimentRecommendation: "TRY_OPENDATALOADER",
      outcomeBand: "POSSIBLE_IMPROVEMENT",
      suggestedExperiment: "SHADOW_RUN_OPENDATALOADER",
    };
  }
  if (item.recommendedRoute === "OCR") {
    return {
      experimentRecommendation: "TRY_OCR",
      outcomeBand: hasStrongOcrEvidence(item) ? "LIKELY_IMPROVEMENT" : "POSSIBLE_IMPROVEMENT",
      suggestedExperiment: "SHADOW_RUN_OCR",
    };
  }
  if (item.recommendedRoute === "HYBRID") {
    return {
      experimentRecommendation: "TRY_HYBRID",
      outcomeBand: "POSSIBLE_IMPROVEMENT",
      suggestedExperiment: "SHADOW_RUN_HYBRID",
    };
  }
  if (item.recommendedRoute === "MANUAL_REVIEW") {
    return {
      experimentRecommendation: "MANUAL_REVIEW_REQUIRED",
      outcomeBand:
        item.signals.includes("UNREADABLE") || item.signals.includes("VALIDATION_BLOCKER")
          ? "POSSIBLE_IMPROVEMENT"
          : "INSUFFICIENT_EVIDENCE",
      suggestedExperiment: "MANUAL_REVIEW_BEFORE_ROUTE_CHANGE",
    };
  }
  return {
    experimentRecommendation: "INSUFFICIENT_EVIDENCE",
    outcomeBand: "INSUFFICIENT_EVIDENCE",
    suggestedExperiment: "NO_EXPERIMENT",
  };
}

function evidenceFor(item: PdfOcrOdlRouteEvaluationItem) {
  const evidence = [
    `Evaluated route: ${item.recommendedRoute} (${item.recommendationStrength}).`,
    `Signals: ${item.signals.join(", ")}.`,
  ];
  for (const detail of item.signalDetails.slice(0, 4)) evidence.push(detail);
  if (item.parserClusterIds.length > 0) {
    evidence.push(`Parser clusters: ${item.parserClusterIds.slice(0, 4).join(", ")}.`);
  }
  if (item.remediationWorkstreams.length > 0) {
    evidence.push(`Remediation workstreams: ${item.remediationWorkstreams.join(", ")}.`);
  }
  return evidence;
}

function risksFor(item: PdfOcrOdlRouteEvaluationItem) {
  const risks: string[] = [];
  if (item.recommendedRoute !== "TEXT_LAYER") risks.push("Possible over-routing from heuristic signals.");
  if (item.recommendedRoute === "OCR" || item.recommendedRoute === "HYBRID") {
    risks.push("OCR may add cost and OCR noise.");
  }
  if (item.recommendedRoute === "OPENDATALOADER_LOCAL" || item.recommendedRoute === "HYBRID") {
    risks.push("Alternative table parsing may degrade existing text-layer structure.");
  }
  if (item.recommendedRoute === "MANUAL_REVIEW") risks.push("Manual review is required before any route change.");
  if (item.recommendationStrength === "LOW") risks.push("Recommendation strength is low.");
  return risks.length > 0 ? risks : ["No material route experiment risk detected."];
}

function safeToExperiment(
  item: PdfOcrOdlRouteEvaluationItem,
  suggestedExperiment: PdfRouteRecommendationExperimentItem["suggestedExperiment"],
) {
  if (suggestedExperiment === "NO_EXPERIMENT" || suggestedExperiment === "MANUAL_REVIEW_BEFORE_ROUTE_CHANGE") {
    return false;
  }
  if (item.recommendationStrength === "LOW") return false;
  if (isStableTextLayer(item)) return false;
  return ["OCR", "OPENDATALOADER_LOCAL", "HYBRID"].includes(item.recommendedRoute);
}

function buildItem(item: PdfOcrOdlRouteEvaluationItem): PdfRouteRecommendationExperimentItem {
  const mapped = recommendationFor(item);
  return {
    filingId: item.filingId,
    extractionRunId: item.extractionRunId ?? null,
    orgNumber: item.orgNumber ?? null,
    fiscalYear: item.fiscalYear ?? null,
    currentRoute: item.currentDecisionRoute ?? null,
    evaluatedRecommendedRoute: item.recommendedRoute,
    experimentRecommendation: mapped.experimentRecommendation,
    outcomeBand: mapped.outcomeBand,
    currentOutcome: item.currentOutcome ?? null,
    currentRiskLevel: item.currentRiskLevel ?? null,
    currentConfidenceScore: item.currentConfidenceScore ?? null,
    recommendationStrength: item.recommendationStrength,
    samplePriority: item.samplePriority,
    evidence: evidenceFor(item),
    risks: risksFor(item),
    suggestedExperiment: mapped.suggestedExperiment,
    safeToExperiment: safeToExperiment(item, mapped.suggestedExperiment),
  };
}

function summarize(items: PdfRouteRecommendationExperimentItem[]) {
  const recommendationDistribution = emptyCounts(RECOMMENDATIONS);
  const outcomeBandDistribution = emptyCounts(OUTCOME_BANDS);
  const suggestedExperimentDistribution: Record<string, number> = {};
  for (const item of items) {
    recommendationDistribution[item.experimentRecommendation] += 1;
    outcomeBandDistribution[item.outcomeBand] += 1;
    suggestedExperimentDistribution[item.suggestedExperiment] =
      (suggestedExperimentDistribution[item.suggestedExperiment] ?? 0) + 1;
  }
  return { recommendationDistribution, outcomeBandDistribution, suggestedExperimentDistribution };
}

export async function buildPdfRouteRecommendationExperimentReport(
  input?: {
    limit?: number;
    fiscalYear?: number;
    orgNumber?: string;
    includeLowPriority?: boolean;
  },
  deps?: {
    evaluateRoutes?: (params: {
      limit?: number;
      fiscalYear?: number;
      orgNumber?: string;
      includeLowPriority?: boolean;
    }) => Promise<PdfOcrOdlRouteEvaluationResult>;
  },
): Promise<PdfRouteRecommendationExperimentReport> {
  const limit = input?.limit ?? 100;
  const includeLowPriority = input?.includeLowPriority ?? false;
  const routeEvaluation = await (deps?.evaluateRoutes ?? evaluatePdfOcrOdlRouteCandidates)({
    limit,
    fiscalYear: input?.fiscalYear,
    orgNumber: input?.orgNumber,
    includeLowPriority,
  });
  const items = routeEvaluation.items
    .map(buildItem)
    .sort(
      (left, right) =>
        Number(right.safeToExperiment) - Number(left.safeToExperiment) ||
        right.samplePriority - left.samplePriority ||
        left.filingId.localeCompare(right.filingId),
    );
  const summary = summarize(items);

  return {
    version: "pdf-route-recommendation-experiment-v1",
    generatedAt: new Date().toISOString(),
    input: {
      limit,
      fiscalYear: input?.fiscalYear,
      orgNumber: input?.orgNumber,
      includeLowPriority,
    },
    totalDocuments: routeEvaluation.summary.totalDocuments,
    experimentCandidateCount: items.filter((item) => item.safeToExperiment).length,
    recommendationDistribution: summary.recommendationDistribution,
    outcomeBandDistribution: summary.outcomeBandDistribution,
    suggestedExperimentDistribution: summary.suggestedExperimentDistribution,
    items,
  };
}

export function serializePdfRouteRecommendationExperimentReport(
  result: PdfRouteRecommendationExperimentReport,
): string {
  return JSON.stringify(result, null, 2);
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
  const rawKeys = new Set(["rawPdf", "pdfBuffer", "rawText", "fullText", "structuredDocument"]);
  if (Array.isArray(value)) return value.some(hasRawPayloadKey);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => rawKeys.has(key) || hasRawPayloadKey(nested),
    );
  }
  return false;
}

export function validatePdfRouteRecommendationExperimentReport(
  result: PdfRouteRecommendationExperimentReport,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (result.version !== "pdf-route-recommendation-experiment-v1") issues.push("Invalid version.");
  if (hasInvalidNumber(result)) issues.push("Report contains NaN or Infinity.");
  if (hasRawPayloadKey(result)) issues.push("Report contains raw PDF/text payload keys.");
  for (const item of result.items ?? []) {
    if (!RECOMMENDATIONS.includes(item.experimentRecommendation)) {
      issues.push(`${item.filingId || "unknown"} has invalid experimentRecommendation.`);
    }
    if (!OUTCOME_BANDS.includes(item.outcomeBand)) {
      issues.push(`${item.filingId || "unknown"} has invalid outcomeBand.`);
    }
    if (!Number.isFinite(item.samplePriority) || item.samplePriority < 0 || item.samplePriority > 100) {
      issues.push(`${item.filingId || "unknown"} samplePriority must be 0-100.`);
    }
  }
  try {
    JSON.stringify(result);
  } catch {
    issues.push("Report is not JSON-safe.");
  }
  return { valid: issues.length === 0, issues };
}

export function recommendationForRoute(route: PdfExtractionRouteCandidate): PdfRouteExperimentRecommendationType {
  if (route === "TEXT_LAYER") return "KEEP_TEXT_LAYER";
  if (route === "OPENDATALOADER_LOCAL") return "TRY_OPENDATALOADER";
  if (route === "OCR") return "TRY_OCR";
  if (route === "HYBRID") return "TRY_HYBRID";
  return "MANUAL_REVIEW_REQUIRED";
}
