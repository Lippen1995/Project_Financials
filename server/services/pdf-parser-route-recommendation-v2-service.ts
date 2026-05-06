import {
  buildPdfParserRouteQualityComparisonReport,
} from "@/server/services/pdf-parser-route-quality-comparison-service";
import type {
  DocumentComparison,
  PdfParserRouteQualityComparisonReport,
  PdfParserRouteQualityComparisonInput,
} from "@/server/services/pdf-parser-route-quality-comparison-service";

// ---- Domain types -----------------------------------------------------------

export type PdfParserRouteRecommendationV2Route =
  | "TEXT_LAYER"
  | "OCR"
  | "OPENDATALOADER_LOCAL"
  | "HYBRID"
  | "MANUAL_REVIEW";

export type PdfParserRouteRecommendationV2Confidence =
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "INSUFFICIENT_DATA";

export type PdfParserRouteRecommendationV2Risk = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export type PdfParserRouteRecommendationV2QualityBand =
  | "EXCELLENT"
  | "GOOD"
  | "MARGINAL"
  | "POOR"
  | "NO_DATA";

export interface PdfParserRouteRecommendationV2Evidence {
  bestShadowRoute: string | null;
  qualityBand: PdfParserRouteRecommendationV2QualityBand;
  completedRouteCount: number;
  unavailableRouteCount: number;
  failedRouteCount: number;
  textLayerQualityScore: number | null;
  ocrQualityScore: number | null;
  odlQualityScore: number | null;
  hybridQualityScore: number | null;
  hasFinancialCoverage: boolean;
  hasBoardReportCoverage: boolean;
  hasAuditorReportCoverage: boolean;
  hasTableCoverage: boolean;
  warningCount: number;
  errorCount: number;
}

export interface PdfParserRouteRecommendationV2Guardrails {
  canUseForProductionRouting: false;
  requiresManualReview: boolean;
  requiresMoreShadowEvidence: boolean;
  blockedReasons: string[];
}

export interface PdfParserRouteRecommendationV2Decision {
  filingId: string;
  extractionRunId?: string | null;
  orgNumber: string | null;
  fiscalYear: number | null;
  recommendedRoute: PdfParserRouteRecommendationV2Route;
  fallbackRoute: PdfParserRouteRecommendationV2Route;
  confidence: PdfParserRouteRecommendationV2Confidence;
  risk: PdfParserRouteRecommendationV2Risk;
  evidence: PdfParserRouteRecommendationV2Evidence;
  guardrails: PdfParserRouteRecommendationV2Guardrails;
  reasons: string[];
}

export interface PdfParserRouteRecommendationV2Summary {
  totalDocuments: number;
  textLayerRecommended: number;
  ocrRecommended: number;
  odlRecommended: number;
  hybridRecommended: number;
  manualReviewRequired: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  insufficientData: number;
  highRisk: number;
}

export interface PdfParserRouteRecommendationV2Report {
  schemaVersion: 1;
  generatedAt: string;
  filters: PdfParserRouteQualityComparisonInput;
  corpus: PdfParserRouteQualityComparisonReport["corpus"];
  decisions: PdfParserRouteRecommendationV2Decision[];
  summary: PdfParserRouteRecommendationV2Summary;
  safety: {
    readOnly: true;
    productionRoutingChanged: false;
    productionFactsMutated: false;
    publishAffected: false;
    shadowOnly: true;
    canUseForProductionRouting: false;
  };
}

export type PdfParserRouteRecommendationV2Input = PdfParserRouteQualityComparisonInput;

// ---- Scoring helpers ---------------------------------------------------------

const QUALITY_BAND_EXCELLENT = 70;
const QUALITY_BAND_GOOD = 45;
const QUALITY_BAND_MARGINAL = 20;

function qualityBand(
  score: number | null,
): PdfParserRouteRecommendationV2QualityBand {
  if (score === null) return "NO_DATA";
  if (score >= QUALITY_BAND_EXCELLENT) return "EXCELLENT";
  if (score >= QUALITY_BAND_GOOD) return "GOOD";
  if (score >= QUALITY_BAND_MARGINAL) return "MARGINAL";
  return "POOR";
}

// A route is "clearly better" if it exceeds the baseline by more than this margin.
const CLEAR_WIN_DELTA = 10;

// Within this margin two alternatives are considered "tied".
const TIE_THRESHOLD = 5;

// ---- Decision builder -------------------------------------------------------

function buildDecisionForComparison(
  comparison: DocumentComparison,
): PdfParserRouteRecommendationV2Decision {
  const { alternatives, baseline } = comparison;

  const textLayerScore = baseline.qualityScore;

  // Route scores from successful alternative runs only.
  function scoreFor(route: string): number | null {
    const alt = alternatives.find(
      (a) => a.route === route && a.status === "SUCCESS" && a.qualityScore !== null,
    );
    return alt?.qualityScore ?? null;
  }

  const ocrScore = scoreFor("OCR");
  const odlScore = scoreFor("OPENDATALOADER_LOCAL");
  const hybridScore = scoreFor("HYBRID");

  const completedRouteCount = alternatives.filter((a) => a.status === "SUCCESS").length;
  const unavailableRouteCount = alternatives.filter(
    (a) => a.status === "RUNTIME_UNAVAILABLE",
  ).length;
  const failedRouteCount = alternatives.filter((a) => a.status === "FAILED").length;

  // Best successful alternative by score.
  const successAlts = alternatives.filter(
    (a) => a.status === "SUCCESS" && a.qualityScore !== null,
  );
  const bestAlt =
    successAlts.length > 0
      ? successAlts.reduce((best, alt) =>
          (alt.qualityScore ?? 0) > (best.qualityScore ?? 0) ? alt : best,
        )
      : null;

  const baselineScore = textLayerScore ?? 0;
  const bestAltScore = bestAlt?.qualityScore ?? null;
  const delta = bestAltScore !== null ? bestAltScore - baselineScore : null;

  // Coverage evidence from the best performing alternative.
  const hasFinancialCoverage = bestAlt?.financialsDetected ?? false;
  const hasBoardReportCoverage = bestAlt?.boardReportDetected ?? false;
  const hasAuditorReportCoverage = bestAlt?.auditorReportDetected ?? false;
  const hasTableCoverage = (bestAlt?.tableCount ?? 0) > 0;

  const warningCount = successAlts.reduce((sum, a) => sum + a.warningsCount, 0);
  const errorCount = successAlts.reduce((sum, a) => sum + a.errorsCount, 0);

  const topBand = qualityBand(
    bestAltScore !== null ? Math.max(baselineScore, bestAltScore) : textLayerScore,
  );

  const evidence: PdfParserRouteRecommendationV2Evidence = {
    bestShadowRoute: comparison.bestRoute,
    qualityBand: topBand,
    completedRouteCount,
    unavailableRouteCount,
    failedRouteCount,
    textLayerQualityScore: textLayerScore,
    ocrQualityScore: ocrScore,
    odlQualityScore: odlScore,
    hybridQualityScore: hybridScore,
    hasFinancialCoverage,
    hasBoardReportCoverage,
    hasAuditorReportCoverage,
    hasTableCoverage,
    warningCount,
    errorCount,
  };

  // ---- Case 1: No successful shadow runs ------------------------------------

  if (completedRouteCount === 0 || bestAlt === null) {
    return {
      filingId: comparison.annualReportId,
      orgNumber: comparison.organizationNumber,
      fiscalYear: comparison.fiscalYear,
      recommendedRoute: "MANUAL_REVIEW",
      fallbackRoute: "TEXT_LAYER",
      confidence: "INSUFFICIENT_DATA",
      risk: "UNKNOWN",
      evidence: { ...evidence, qualityBand: "NO_DATA" },
      guardrails: {
        canUseForProductionRouting: false,
        requiresManualReview: true,
        requiresMoreShadowEvidence: true,
        blockedReasons: ["No successful shadow route runs available for this filing."],
      },
      reasons: [
        "No shadow execution results available — cannot recommend a route without evidence.",
      ],
    };
  }

  // ---- Case 2: Determine recommended route ----------------------------------

  let recommendedRoute: PdfParserRouteRecommendationV2Route;
  let fallbackRoute: PdfParserRouteRecommendationV2Route;
  const reasons: string[] = [];
  const blockedReasons: string[] = [];

  // TEXT_LAYER wins or no alternative beats it beyond the tie threshold.
  const textLayerWins = delta !== null && delta <= 2;
  const noAltBeatsBaseline =
    delta === null ||
    (ocrScore === null || ocrScore <= baselineScore + 2) &&
    (odlScore === null || odlScore <= baselineScore + 2) &&
    (hybridScore === null || hybridScore <= baselineScore + 2);

  if (textLayerWins || noAltBeatsBaseline) {
    recommendedRoute = "TEXT_LAYER";
    fallbackRoute = "MANUAL_REVIEW";
    reasons.push(
      `TEXT_LAYER baseline score ${baselineScore.toFixed(1)} — no alternative route outperforms within the tie threshold.`,
    );
  }
  // Both OCR and ODL beat TEXT_LAYER and are within TIE_THRESHOLD of each other.
  else if (
    ocrScore !== null &&
    odlScore !== null &&
    ocrScore > baselineScore + 2 &&
    odlScore > baselineScore + 2 &&
    Math.abs(ocrScore - odlScore) <= TIE_THRESHOLD
  ) {
    if (hybridScore !== null) {
      recommendedRoute = "HYBRID";
      fallbackRoute = ocrScore >= odlScore ? "OCR" : "OPENDATALOADER_LOCAL";
      reasons.push(
        `OCR (${ocrScore.toFixed(1)}) and OPENDATALOADER_LOCAL (${odlScore.toFixed(1)}) both outperform TEXT_LAYER (${baselineScore.toFixed(1)}) with similar margin — HYBRID preferred.`,
      );
    } else {
      // No hybrid run available; prefer whichever is higher.
      recommendedRoute = ocrScore >= odlScore ? "OCR" : "OPENDATALOADER_LOCAL";
      fallbackRoute = ocrScore >= odlScore ? "OPENDATALOADER_LOCAL" : "OCR";
      reasons.push(
        `OCR and OPENDATALOADER_LOCAL both outperform TEXT_LAYER; ${recommendedRoute} scores marginally higher. HYBRID was not run.`,
      );
    }
  }
  // Single route clearly dominates.
  else {
    recommendedRoute = bestAlt.route as PdfParserRouteRecommendationV2Route;
    fallbackRoute = "TEXT_LAYER";
    reasons.push(
      `${bestAlt.route} outperforms TEXT_LAYER baseline by +${(delta ?? 0).toFixed(1)} points (score: ${bestAltScore?.toFixed(1)}).`,
    );
  }

  // ---- Override to MANUAL_REVIEW if quality is uniformly poor ---------------

  if (topBand === "POOR" && !hasFinancialCoverage) {
    recommendedRoute = "MANUAL_REVIEW";
    fallbackRoute = "TEXT_LAYER";
    blockedReasons.push(
      "All routes produce poor-quality results without financial coverage — manual review required.",
    );
    reasons.push(
      "No route achieves sufficient financial data coverage to warrant an automatic recommendation.",
    );
  }

  // ---- Confidence -----------------------------------------------------------

  let confidence: PdfParserRouteRecommendationV2Confidence;

  if (recommendedRoute === "MANUAL_REVIEW") {
    confidence = topBand === "POOR" ? "LOW" : "INSUFFICIENT_DATA";
  } else if (recommendedRoute === "TEXT_LAYER") {
    if (topBand === "EXCELLENT" || topBand === "GOOD") {
      confidence = "MEDIUM";
    } else {
      confidence = "LOW";
    }
  } else {
    // Non-TEXT_LAYER recommendation
    if (delta !== null && delta > 20 && (topBand === "EXCELLENT" || topBand === "GOOD")) {
      confidence = "HIGH";
    } else if (delta !== null && delta > CLEAR_WIN_DELTA && topBand !== "POOR") {
      confidence = "MEDIUM";
    } else {
      confidence = "LOW";
    }
  }

  // ---- Risk -----------------------------------------------------------------

  let risk: PdfParserRouteRecommendationV2Risk;

  const isNonTextLayer =
    recommendedRoute !== "TEXT_LAYER" && recommendedRoute !== "MANUAL_REVIEW";

  if (!isNonTextLayer && (confidence === "HIGH" || confidence === "MEDIUM")) {
    risk = "LOW";
  } else if (
    isNonTextLayer &&
    confidence === "HIGH" &&
    hasFinancialCoverage &&
    warningCount <= 2 &&
    errorCount === 0
  ) {
    risk = "MEDIUM";
  } else if (
    isNonTextLayer &&
    (confidence === "LOW" || !hasFinancialCoverage || warningCount > 3 || errorCount > 0)
  ) {
    risk = "HIGH";
  } else {
    risk = "MEDIUM";
  }

  // ---- Guardrails -----------------------------------------------------------

  const requiresManualReview = recommendedRoute === "MANUAL_REVIEW";
  const requiresMoreShadowEvidence = completedRouteCount < 2;

  return {
    filingId: comparison.annualReportId,
    orgNumber: comparison.organizationNumber,
    fiscalYear: comparison.fiscalYear,
    recommendedRoute,
    fallbackRoute,
    confidence,
    risk,
    evidence,
    guardrails: {
      canUseForProductionRouting: false,
      requiresManualReview,
      requiresMoreShadowEvidence,
      blockedReasons,
    },
    reasons,
  };
}

// ---- Summary aggregator -----------------------------------------------------

function buildSummary(
  decisions: PdfParserRouteRecommendationV2Decision[],
): PdfParserRouteRecommendationV2Summary {
  return {
    totalDocuments: decisions.length,
    textLayerRecommended: decisions.filter((d) => d.recommendedRoute === "TEXT_LAYER").length,
    ocrRecommended: decisions.filter((d) => d.recommendedRoute === "OCR").length,
    odlRecommended: decisions.filter((d) => d.recommendedRoute === "OPENDATALOADER_LOCAL").length,
    hybridRecommended: decisions.filter((d) => d.recommendedRoute === "HYBRID").length,
    manualReviewRequired: decisions.filter((d) => d.recommendedRoute === "MANUAL_REVIEW").length,
    highConfidence: decisions.filter((d) => d.confidence === "HIGH").length,
    mediumConfidence: decisions.filter((d) => d.confidence === "MEDIUM").length,
    lowConfidence: decisions.filter((d) => d.confidence === "LOW").length,
    insufficientData: decisions.filter((d) => d.confidence === "INSUFFICIENT_DATA").length,
    highRisk: decisions.filter((d) => d.risk === "HIGH").length,
  };
}

// ---- Main service function --------------------------------------------------

export async function buildPdfParserRouteRecommendationV2Report(
  input?: PdfParserRouteRecommendationV2Input,
  deps?: {
    buildQualityReport?: typeof buildPdfParserRouteQualityComparisonReport;
  },
): Promise<PdfParserRouteRecommendationV2Report> {
  const buildQuality = deps?.buildQualityReport ?? buildPdfParserRouteQualityComparisonReport;

  const qualityReport = await buildQuality(input);

  const decisions = qualityReport.documentComparisons.map(buildDecisionForComparison);
  const summary = buildSummary(decisions);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    filters: qualityReport.filters,
    corpus: qualityReport.corpus,
    decisions,
    summary,
    safety: {
      readOnly: true,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
      shadowOnly: true,
      canUseForProductionRouting: false,
    },
  };
}

// ---- Serialization / validation ---------------------------------------------

function hasInvalidNumber(v: unknown): boolean {
  if (typeof v === "number") return !Number.isFinite(v);
  if (Array.isArray(v)) return v.some(hasInvalidNumber);
  if (v && typeof v === "object")
    return Object.values(v as Record<string, unknown>).some(hasInvalidNumber);
  return false;
}

export function serializePdfParserRouteRecommendationV2Report(
  report: PdfParserRouteRecommendationV2Report,
): string {
  return JSON.stringify(report, null, 2);
}

export function validatePdfParserRouteRecommendationV2Report(
  report: PdfParserRouteRecommendationV2Report,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (report.schemaVersion !== 1) issues.push("schemaVersion must be 1.");
  if (report.safety.readOnly !== true) issues.push("safety.readOnly must be true.");
  if (report.safety.productionRoutingChanged !== false)
    issues.push("safety.productionRoutingChanged must be false.");
  if (report.safety.productionFactsMutated !== false)
    issues.push("safety.productionFactsMutated must be false.");
  if (report.safety.shadowOnly !== true) issues.push("safety.shadowOnly must be true.");
  if (report.safety.canUseForProductionRouting !== false)
    issues.push("safety.canUseForProductionRouting must be false.");

  for (const decision of report.decisions) {
    if (decision.guardrails.canUseForProductionRouting !== false) {
      issues.push(
        `Decision ${decision.filingId}: guardrails.canUseForProductionRouting must be false.`,
      );
    }
  }

  if (hasInvalidNumber(report)) issues.push("Report contains NaN or Infinity.");

  try {
    JSON.stringify(report);
  } catch {
    issues.push("Report is not JSON-safe.");
  }

  return { valid: issues.length === 0, issues };
}
