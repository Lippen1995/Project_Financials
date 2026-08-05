import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { DEFAULT_PDF_DECISION_RULE_CONFIG } from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-config";
import {
  evaluatePdfDecisionShadow,
  type PdfDecisionShadowDocument,
  type PdfDecisionShadowEvaluationResult,
} from "@/server/services/annual-report-pdf-decision-shadow-evaluation";
import {
  clusterPdfParserFailures,
  type PdfParserFailureCluster,
  type PdfParserFailureClusteringResult,
} from "@/server/services/pdf-parser-failure-clustering-service";
import {
  buildPdfParserRemediationReport,
  type PdfParserRemediationReport,
} from "@/server/services/pdf-parser-remediation-report-service";

export type PdfExtractionRouteCandidate =
  | "TEXT_LAYER"
  | "OPENDATALOADER_LOCAL"
  | "OCR"
  | "HYBRID"
  | "MANUAL_REVIEW";

export type PdfOcrOdlEvaluationSignal =
  | "UNRELIABLE_TEXT_LAYER"
  | "IMAGE_ONLY_OR_LOW_TEXT_DENSITY"
  | "WEAK_PAGE_HINTS"
  | "MISSING_FINANCIAL_SECTIONS"
  | "SUSPICIOUS_READING_ORDER"
  | "PARSER_RISK"
  | "UNREADABLE"
  | "REPROCESS_REQUESTED"
  | "MANUAL_CORRECTION"
  | "VALIDATION_BLOCKER"
  | "LOW_CONFIDENCE"
  | "HIGH_QUALITY_RISK"
  | "OCR_ODL_REMEDIATION_ITEM"
  | "GOLD_SET_FAILURE"
  | "OTHER";

export type PdfOcrOdlRouteEvaluationItem = {
  filingId: string;
  extractionRunId?: string | null;
  orgNumber?: string | null;
  fiscalYear?: number | null;
  currentDecisionRoute?: string | null;
  currentRiskLevel?: string | null;
  currentConfidenceScore?: number | null;
  currentOutcome?: string | null;
  qualityRisk?: string | null;
  recommendedRouteHint?: string | null;
  goldSetStatus?: string | null;
  latestReviewDecisionType?: string | null;
  signals: PdfOcrOdlEvaluationSignal[];
  signalDetails: string[];
  routeScores: Record<PdfExtractionRouteCandidate, number>;
  recommendedRoute: PdfExtractionRouteCandidate;
  recommendationStrength: "LOW" | "MEDIUM" | "HIGH";
  evaluationReason: string;
  shouldSampleForOcrOdl: boolean;
  samplePriority: number;
  parserClusterIds: string[];
  remediationWorkstreams: string[];
};

export type PdfOcrOdlRouteEvaluationSummary = {
  totalDocuments: number;
  sampleCandidateCount: number;
  recommendedRouteDistribution: Record<PdfExtractionRouteCandidate, number>;
  signalDistribution: Record<PdfOcrOdlEvaluationSignal, number>;
  strengthDistribution: Record<string, number>;
};

export type PdfOcrOdlRouteEvaluationResult = {
  version: "pdf-ocr-odl-route-evaluation-v1";
  generatedAt: string;
  input: {
    limit: number;
    fiscalYear?: number;
    orgNumber?: string;
    includeLowPriority: boolean;
  };
  summary: PdfOcrOdlRouteEvaluationSummary;
  items: PdfOcrOdlRouteEvaluationItem[];
};

const ROUTES: PdfExtractionRouteCandidate[] = [
  "TEXT_LAYER",
  "OPENDATALOADER_LOCAL",
  "OCR",
  "HYBRID",
  "MANUAL_REVIEW",
];

const SIGNALS: PdfOcrOdlEvaluationSignal[] = [
  "UNRELIABLE_TEXT_LAYER",
  "IMAGE_ONLY_OR_LOW_TEXT_DENSITY",
  "WEAK_PAGE_HINTS",
  "MISSING_FINANCIAL_SECTIONS",
  "SUSPICIOUS_READING_ORDER",
  "PARSER_RISK",
  "UNREADABLE",
  "REPROCESS_REQUESTED",
  "MANUAL_CORRECTION",
  "VALIDATION_BLOCKER",
  "LOW_CONFIDENCE",
  "HIGH_QUALITY_RISK",
  "OCR_ODL_REMEDIATION_ITEM",
  "GOLD_SET_FAILURE",
  "OTHER",
];

function emptyRouteScores(): Record<PdfExtractionRouteCandidate, number> {
  return {
    TEXT_LAYER: 0,
    OPENDATALOADER_LOCAL: 0,
    OCR: 0,
    HYBRID: 0,
    MANUAL_REVIEW: 0,
  };
}

function emptyCounts<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

function addSignal(
  signals: Set<PdfOcrOdlEvaluationSignal>,
  details: string[],
  signal: PdfOcrOdlEvaluationSignal,
  detail: string,
) {
  signals.add(signal);
  details.push(detail);
}

function includesAny(values: string[], pattern: RegExp) {
  return values.some((value) => pattern.test(value));
}

function isPublishedOrAccepted(outcome?: string | null) {
  return outcome === "PUBLISHED" || outcome === "MANUAL_REVIEW_ACCEPTED";
}

function isUnreliableText(doc: PdfDecisionShadowDocument) {
  return (
    doc.qualityRisk === "HIGH" ||
    /ocr|image|text layer|unreliable|low text/i.test(doc.recommendedRouteHint ?? "") ||
    includesAny([...doc.parserRiskReasons, ...doc.manualReviewReasons], /image|low text|no text|text layer|unreliable/i)
  );
}

function isImageOnly(doc: PdfDecisionShadowDocument) {
  return includesAny(
    [...doc.parserRiskReasons, ...doc.manualReviewReasons, doc.recommendedRouteHint ?? ""],
    /image.only|image only|low text density|no text|scanned/i,
  );
}

function hasWeakPageHints(doc: PdfDecisionShadowDocument) {
  return includesAny([...doc.manualReviewReasons, ...doc.parserRiskReasons], /weak page|page hint|unreliable hint/i);
}

function hasMissingFinancialSections(doc: PdfDecisionShadowDocument) {
  return includesAny(
    [...doc.manualReviewReasons, ...doc.parserRiskReasons],
    /missing financial|no financial|income statement|balance section|financial sections|section segmentation/i,
  );
}

function hasReadingOrderIssue(doc: PdfDecisionShadowDocument) {
  return includesAny(doc.parserRiskReasons, /reading order|suspicious order|table order|layout order/i);
}

function hasGoldSetFailure(doc: PdfDecisionShadowDocument) {
  return doc.goldSet?.status === "APPROVED" && !isPublishedOrAccepted(doc.outcome);
}

function clampPriority(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function deriveSignals(
  doc: PdfDecisionShadowDocument,
  clusters: PdfParserFailureCluster[],
  remediationWorkstreams: string[],
): { signals: Set<PdfOcrOdlEvaluationSignal>; details: string[] } {
  const signals = new Set<PdfOcrOdlEvaluationSignal>();
  const details: string[] = [];

  if (isUnreliableText(doc)) {
    addSignal(signals, details, "UNRELIABLE_TEXT_LAYER", "Text-layer quality is unreliable or high risk.");
  }
  if (isImageOnly(doc)) {
    addSignal(signals, details, "IMAGE_ONLY_OR_LOW_TEXT_DENSITY", "Diagnostics suggest image-only or low text density PDF.");
  }
  if (hasWeakPageHints(doc)) {
    addSignal(signals, details, "WEAK_PAGE_HINTS", "Page hint or page targeting diagnostics are weak.");
  }
  if (hasMissingFinancialSections(doc)) {
    addSignal(signals, details, "MISSING_FINANCIAL_SECTIONS", "Financial statement sections appear missing.");
  }
  if (hasReadingOrderIssue(doc)) {
    addSignal(signals, details, "SUSPICIOUS_READING_ORDER", "Parser risk points to reading-order or layout-order issues.");
  }
  if (doc.parserRiskReasons.length > 0) {
    addSignal(signals, details, "PARSER_RISK", `Parser risk reason(s): ${doc.parserRiskReasons.slice(0, 3).join(", ")}.`);
  }
  if (doc.outcome === "MANUAL_REVIEW_UNREADABLE" || doc.latestReviewDecisionType === "UNREADABLE") {
    addSignal(signals, details, "UNREADABLE", "Reviewer marked the document unreadable.");
  }
  if (doc.outcome === "REPROCESS_REQUESTED" || doc.latestReviewDecisionType === "REPROCESS_REQUESTED") {
    addSignal(signals, details, "REPROCESS_REQUESTED", "Reviewer requested reprocessing.");
  }
  if (doc.outcome === "MANUAL_REVIEW_CORRECTED" || doc.latestReviewDecisionType === "CORRECTED") {
    addSignal(signals, details, "MANUAL_CORRECTION", "Reviewer correction exists.");
  }
  if (doc.blockingRuleCodes.length > 0) {
    addSignal(signals, details, "VALIDATION_BLOCKER", `Blocking rule(s): ${doc.blockingRuleCodes.slice(0, 3).join(", ")}.`);
  }
  if (
    doc.confidenceScore !== null &&
    doc.confidenceScore !== undefined &&
    doc.confidenceScore < DEFAULT_PDF_DECISION_RULE_CONFIG.activeLearning!.lowConfidenceThreshold
  ) {
    addSignal(signals, details, "LOW_CONFIDENCE", "Decision confidence is below the active-learning low threshold.");
  }
  if (doc.qualityRisk === "HIGH") {
    addSignal(signals, details, "HIGH_QUALITY_RISK", "Decision diagnostics mark quality risk as HIGH.");
  }
  if (remediationWorkstreams.includes("OCR_ODL_ROUTING") || remediationWorkstreams.includes("TEXT_LAYER")) {
    addSignal(
      signals,
      details,
      "OCR_ODL_REMEDIATION_ITEM",
      `Remediation workstream(s): ${remediationWorkstreams.join(", ")}.`,
    );
  }
  if (hasGoldSetFailure(doc)) {
    addSignal(signals, details, "GOLD_SET_FAILURE", "Approved gold-set item has a non-success outcome.");
  }
  if (clusters.some((cluster) => cluster.kind === "OCR_ODL_CANDIDATE")) {
    addSignal(signals, details, "OCR_ODL_REMEDIATION_ITEM", "Parser failure cluster marks this as an OCR/ODL candidate.");
  }
  if (signals.size === 0) {
    addSignal(signals, details, "OTHER", "No specific OCR/OpenDataLoader signal detected.");
  }

  return { signals, details };
}

function scoreRoutes(
  doc: PdfDecisionShadowDocument,
  signals: Set<PdfOcrOdlEvaluationSignal>,
  remediationWorkstreams: string[],
): Record<PdfExtractionRouteCandidate, number> {
  const scores = emptyRouteScores();
  const parserRisk = signals.has("PARSER_RISK");
  const imageOnly = signals.has("IMAGE_ONLY_OR_LOW_TEXT_DENSITY");
  const weakOrMissing =
    signals.has("WEAK_PAGE_HINTS") || signals.has("MISSING_FINANCIAL_SECTIONS");
  const readingOrder = signals.has("SUSPICIOUS_READING_ORDER");
  const reliableText =
    !signals.has("UNRELIABLE_TEXT_LAYER") &&
    !imageOnly &&
    (doc.confidenceScore ?? 0) >= DEFAULT_PDF_DECISION_RULE_CONFIG.activeLearning!.mediumConfidenceThreshold;
  const mixedSignals = !imageOnly && (parserRisk || weakOrMissing || signals.has("VALIDATION_BLOCKER"));

  if (isPublishedOrAccepted(doc.outcome)) scores.TEXT_LAYER += 30;
  if ((doc.confidenceScore ?? 0) >= 0.75 && !parserRisk) scores.TEXT_LAYER += 20;
  if (signals.has("UNRELIABLE_TEXT_LAYER") || imageOnly) scores.TEXT_LAYER -= 30;
  if (signals.has("MISSING_FINANCIAL_SECTIONS")) scores.TEXT_LAYER -= 20;
  if (readingOrder) scores.TEXT_LAYER -= 20;

  if (readingOrder || signals.has("MISSING_FINANCIAL_SECTIONS")) scores.OPENDATALOADER_LOCAL += 25;
  if (parserRisk && !imageOnly) scores.OPENDATALOADER_LOCAL += 20;
  if (weakOrMissing) scores.OPENDATALOADER_LOCAL += 15;
  if (imageOnly) scores.OPENDATALOADER_LOCAL -= 10;

  if (imageOnly) scores.OCR += 35;
  if (signals.has("UNREADABLE")) scores.OCR += 25;
  if (doc.qualityRisk === "HIGH" && !isPublishedOrAccepted(doc.outcome)) scores.OCR += 20;
  if (reliableText) scores.OCR -= 15;

  if (mixedSignals) scores.HYBRID += 25;
  if (signals.has("LOW_CONFIDENCE") && parserRisk) scores.HYBRID += 20;
  if (signals.has("MANUAL_CORRECTION") && parserRisk) scores.HYBRID += 20;
  if (remediationWorkstreams.includes("OCR_ODL_ROUTING") || remediationWorkstreams.includes("TEXT_LAYER")) {
    scores.HYBRID += 15;
  }

  if (doc.riskLevel === "HIGH" || signals.has("UNREADABLE") || signals.has("REPROCESS_REQUESTED")) {
    scores.MANUAL_REVIEW += 25;
  }
  if (signals.has("VALIDATION_BLOCKER")) scores.MANUAL_REVIEW += 20;
  if ((doc.confidenceScore ?? 1) < 0.3) scores.MANUAL_REVIEW += 20;
  if (signals.has("GOLD_SET_FAILURE")) scores.MANUAL_REVIEW += 15;

  return scores;
}

function routeRank(route: PdfExtractionRouteCandidate, signals: Set<PdfOcrOdlEvaluationSignal>): number {
  const severe =
    signals.has("UNREADABLE") ||
    signals.has("REPROCESS_REQUESTED") ||
    signals.has("HIGH_QUALITY_RISK");
  if (route === "MANUAL_REVIEW" && severe) return 0;
  if (route === "HYBRID" && (signals.has("PARSER_RISK") || signals.has("VALIDATION_BLOCKER"))) return 1;
  if (route === "OCR" && signals.has("IMAGE_ONLY_OR_LOW_TEXT_DENSITY")) return 2;
  if (route === "OPENDATALOADER_LOCAL" && signals.has("SUSPICIOUS_READING_ORDER")) return 3;
  if (route === "TEXT_LAYER") return 4;
  return 5 + ROUTES.indexOf(route);
}

function chooseRoute(
  scores: Record<PdfExtractionRouteCandidate, number>,
  signals: Set<PdfOcrOdlEvaluationSignal>,
): PdfExtractionRouteCandidate {
  return [...ROUTES].sort(
    (left, right) =>
      scores[right] - scores[left] ||
      routeRank(left, signals) - routeRank(right, signals) ||
      left.localeCompare(right),
  )[0];
}

function strengthFor(scores: Record<PdfExtractionRouteCandidate, number>, route: PdfExtractionRouteCandidate) {
  const sorted = ROUTES.map((r) => scores[r]).sort((a, b) => b - a);
  const top = scores[route];
  const margin = top - (sorted[1] ?? 0);
  if (top >= 60 && margin >= 15) return "HIGH";
  if (top >= 35) return "MEDIUM";
  return "LOW";
}

function shouldSample(
  route: PdfExtractionRouteCandidate,
  strength: "LOW" | "MEDIUM" | "HIGH",
  signals: Set<PdfOcrOdlEvaluationSignal>,
  includeLowPriority: boolean,
) {
  if (route === "TEXT_LAYER") return includeLowPriority;
  if (["OCR", "OPENDATALOADER_LOCAL", "HYBRID"].includes(route)) {
    return strength === "MEDIUM" || strength === "HIGH";
  }
  if (route === "MANUAL_REVIEW") {
    return (
      signals.has("UNRELIABLE_TEXT_LAYER") ||
      signals.has("IMAGE_ONLY_OR_LOW_TEXT_DENSITY") ||
      signals.has("OCR_ODL_REMEDIATION_ITEM")
    );
  }
  return false;
}

function priorityFor(
  scores: Record<PdfExtractionRouteCandidate, number>,
  route: PdfExtractionRouteCandidate,
  signals: Set<PdfOcrOdlEvaluationSignal>,
  clusterCount: number,
  remediationCount: number,
) {
  let score = scores[route];
  if (signals.has("OCR_ODL_REMEDIATION_ITEM")) score += 10;
  if (signals.has("GOLD_SET_FAILURE")) score += 10;
  if (signals.has("UNREADABLE") || signals.has("REPROCESS_REQUESTED")) score += 10;
  score += Math.min(clusterCount * 3, 9);
  score += Math.min(remediationCount * 4, 12);
  return clampPriority(score);
}

function reasonFor(route: PdfExtractionRouteCandidate, signals: Set<PdfOcrOdlEvaluationSignal>) {
  const signalList = [...signals].filter((signal) => signal !== "OTHER").slice(0, 3);
  if (route === "TEXT_LAYER") return "Current text-layer extraction appears stable.";
  if (signalList.length === 0) return `${route} has the highest deterministic route score.`;
  return `${route} has the highest deterministic route score due to ${signalList.join(", ")}.`;
}

function buildIndexes(
  clusters: PdfParserFailureClusteringResult,
  remediation: PdfParserRemediationReport,
) {
  const clustersByFiling = new Map<string, PdfParserFailureCluster[]>();
  for (const cluster of clusters.clusters) {
    for (const example of cluster.examples) {
      clustersByFiling.set(example.filingId, [
        ...(clustersByFiling.get(example.filingId) ?? []),
        cluster,
      ]);
    }
  }

  const workstreamsByFiling = new Map<string, Set<string>>();
  for (const item of remediation.items) {
    for (const evidence of item.evidence) {
      for (const filingId of evidence.exampleFilingIds) {
        const existing = workstreamsByFiling.get(filingId) ?? new Set<string>();
        existing.add(item.workstream);
        workstreamsByFiling.set(filingId, existing);
      }
    }
  }
  return { clustersByFiling, workstreamsByFiling };
}

function buildItem(
  doc: PdfDecisionShadowDocument,
  clusters: PdfParserFailureCluster[],
  remediationWorkstreams: string[],
  includeLowPriority: boolean,
): PdfOcrOdlRouteEvaluationItem {
  const { signals, details } = deriveSignals(doc, clusters, remediationWorkstreams);
  const routeScores = scoreRoutes(doc, signals, remediationWorkstreams);
  const recommendedRoute = chooseRoute(routeScores, signals);
  const recommendationStrength = strengthFor(routeScores, recommendedRoute);
  const samplePriority = priorityFor(
    routeScores,
    recommendedRoute,
    signals,
    clusters.length,
    remediationWorkstreams.length,
  );

  return {
    filingId: doc.filingId,
    extractionRunId: doc.extractionRunId ?? null,
    orgNumber: doc.orgNumber ?? null,
    fiscalYear: doc.fiscalYear ?? null,
    currentDecisionRoute: doc.decisionRoute ?? null,
    currentRiskLevel: doc.riskLevel ?? null,
    currentConfidenceScore: doc.confidenceScore ?? null,
    currentOutcome: doc.outcome ?? null,
    qualityRisk: doc.qualityRisk ?? null,
    recommendedRouteHint: doc.recommendedRouteHint ?? null,
    goldSetStatus: doc.goldSet?.status ?? null,
    latestReviewDecisionType: doc.latestReviewDecisionType ?? null,
    signals: [...signals],
    signalDetails: details,
    routeScores,
    recommendedRoute,
    recommendationStrength,
    evaluationReason: reasonFor(recommendedRoute, signals),
    shouldSampleForOcrOdl: shouldSample(recommendedRoute, recommendationStrength, signals, includeLowPriority),
    samplePriority,
    parserClusterIds: clusters.map((cluster) => cluster.clusterId).sort(),
    remediationWorkstreams: [...remediationWorkstreams].sort(),
  };
}

function summarize(items: PdfOcrOdlRouteEvaluationItem[]): PdfOcrOdlRouteEvaluationSummary {
  const recommendedRouteDistribution = emptyCounts(ROUTES);
  const signalDistribution = emptyCounts(SIGNALS);
  const strengthDistribution: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const item of items) {
    recommendedRouteDistribution[item.recommendedRoute] += 1;
    strengthDistribution[item.recommendationStrength] =
      (strengthDistribution[item.recommendationStrength] ?? 0) + 1;
    for (const signal of item.signals) signalDistribution[signal] += 1;
  }
  return {
    totalDocuments: items.length,
    sampleCandidateCount: items.filter((item) => item.shouldSampleForOcrOdl).length,
    recommendedRouteDistribution,
    signalDistribution,
    strengthDistribution,
  };
}

export async function evaluatePdfOcrOdlRouteCandidates(
  input?: {
    limit?: number;
    fiscalYear?: number;
    orgNumber?: string;
    includeLowPriority?: boolean;
  },
  deps?: {
    evaluateShadow?: (params: {
      limit: number;
      fiscalYear?: number;
      orgNumber?: string;
    }) => Promise<PdfDecisionShadowEvaluationResult>;
    clusterFailures?: (params: {
      limit?: number;
      fiscalYear?: number;
      orgNumber?: string;
      maxExamplesPerCluster?: number;
    }) => Promise<PdfParserFailureClusteringResult>;
    buildRemediationReport?: (params: {
      limit?: number;
      fiscalYear?: number;
      orgNumber?: string;
      maxExamplesPerCluster?: number;
    }) => Promise<PdfParserRemediationReport>;
  },
): Promise<PdfOcrOdlRouteEvaluationResult> {
  const limit = input?.limit ?? 100;
  const includeLowPriority = input?.includeLowPriority ?? false;
  const query = { limit, fiscalYear: input?.fiscalYear, orgNumber: input?.orgNumber };
  const [shadow, clusters, remediation] = await Promise.all([
    (deps?.evaluateShadow ?? evaluatePdfDecisionShadow)(query),
    (deps?.clusterFailures ?? clusterPdfParserFailures)({
      ...query,
      maxExamplesPerCluster: Math.max(10, limit),
    }),
    (deps?.buildRemediationReport ?? buildPdfParserRemediationReport)({
      ...query,
      maxExamplesPerCluster: Math.max(10, limit),
    }),
  ]);
  const { clustersByFiling, workstreamsByFiling } = buildIndexes(clusters, remediation);
  const allItems = shadow.documents.map((doc) =>
    buildItem(
      doc,
      clustersByFiling.get(doc.filingId) ?? [],
      [...(workstreamsByFiling.get(doc.filingId) ?? new Set<string>())],
      includeLowPriority,
    ),
  );
  const items = allItems
    .filter((item) => includeLowPriority || item.shouldSampleForOcrOdl || item.recommendedRoute !== "TEXT_LAYER")
    .sort(
      (left, right) =>
        right.samplePriority - left.samplePriority ||
        right.routeScores[right.recommendedRoute] - left.routeScores[left.recommendedRoute] ||
        left.filingId.localeCompare(right.filingId),
    )
    .slice(0, limit);

  return {
    version: "pdf-ocr-odl-route-evaluation-v1",
    generatedAt: new Date().toISOString(),
    input: {
      limit,
      fiscalYear: input?.fiscalYear,
      orgNumber: input?.orgNumber,
      includeLowPriority,
    },
    summary: summarize(items),
    items,
  };
}

export function serializePdfOcrOdlRouteEvaluationResult(
  result: PdfOcrOdlRouteEvaluationResult,
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

export function validatePdfOcrOdlRouteEvaluationResult(
  result: PdfOcrOdlRouteEvaluationResult,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (result.version !== "pdf-ocr-odl-route-evaluation-v1") issues.push("Invalid version.");
  if (hasInvalidNumber(result)) issues.push("Result contains NaN or Infinity.");
  if (hasRawPayloadKey(result)) issues.push("Result contains raw PDF/text payload keys.");
  for (const item of result.items ?? []) {
    if (!ROUTES.includes(item.recommendedRoute)) {
      issues.push(`${item.filingId || "unknown"} has invalid recommendedRoute.`);
    }
    if (!Number.isFinite(item.samplePriority) || item.samplePriority < 0 || item.samplePriority > 100) {
      issues.push(`${item.filingId || "unknown"} samplePriority must be 0-100.`);
    }
    for (const route of ROUTES) {
      if (!Number.isFinite(item.routeScores?.[route])) {
        issues.push(`${item.filingId || "unknown"} route score for ${route} is not finite.`);
      }
    }
  }
  try {
    JSON.stringify(result);
  } catch {
    issues.push("Result is not JSON-safe.");
  }
  return { valid: issues.length === 0, issues };
}

export function writePdfOcrOdlRouteEvaluationResult(
  result: PdfOcrOdlRouteEvaluationResult,
  outputPath: string,
) {
  writeFileSync(resolve(process.cwd(), outputPath), `${serializePdfOcrOdlRouteEvaluationResult(result)}\n`, "utf8");
}
