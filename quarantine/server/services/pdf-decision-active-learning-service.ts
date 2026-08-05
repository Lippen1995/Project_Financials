import { PdfDecisionGoldSetReason } from "@prisma/client";

import {
  normalizePdfDecisionRuleConfig,
  type PdfDecisionRuleConfig,
  type PdfDecisionRuleConfigOverrides,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-config";
import { LocalAnnualReportArtifactStorage } from "@/server/financials/artifact-storage";
import { listAnnualReportDecisionShadowRows } from "@/server/persistence/annual-report-decision-shadow-repository";
import { listPdfDecisionGoldSetItemsByFilingIds } from "@/server/persistence/pdf-decision-gold-set-repository";
import {
  evaluatePdfDecisionShadow,
  type PdfDecisionShadowDocument,
  type PdfDecisionShadowEvaluationResult,
} from "@/server/services/annual-report-pdf-decision-shadow-evaluation";

export type PdfDecisionActiveLearningReason =
  | "LOW_CONFIDENCE"
  | "HIGH_RISK"
  | "LOW_RISK_FAILED"
  | "HIGH_RISK_SUCCEEDED"
  | "MANUAL_CORRECTION"
  | "UNREADABLE"
  | "REPROCESS_REQUESTED"
  | "ROUTE_MISMATCH"
  | "RISK_MISMATCH"
  | "BALANCE_MISMATCH"
  | "MISSING_FINANCIAL_SECTIONS"
  | "WEAK_PAGE_HINTS"
  | "PARSER_RISK"
  | "NOT_IN_GOLD_SET"
  | "OTHER";

export type PdfDecisionActiveLearningCoverageSignal =
  | "UNDERREPRESENTED_ROUTE"
  | "UNDERREPRESENTED_RISK"
  | "UNDERREPRESENTED_OUTCOME"
  | "UNDERREPRESENTED_YEAR"
  | "UNDERREPRESENTED_ROUTE_RISK_COMBO"
  | "REPEATED_PARSER_FAILURE"
  | "REPEATED_BLOCKING_RULE"
  | "MISSING_FROM_GOLD_SET"
  | "DIVERSE_SAMPLE";

export type PdfDecisionActiveLearningSuggestedAction =
  | "REVIEW"
  | "MARK_CANDIDATE"
  | "APPROVE_GOLD_SET"
  | "EXCLUDE"
  | "SEND_TO_REVIEW"
  | "PARSER_INVESTIGATION"
  | "NOT_USEFUL"
  | "NO_ACTION";

export type PdfDecisionActiveLearningQueueItem = {
  filingId: string;
  extractionRunId?: string | null;
  orgNumber?: string | null;
  fiscalYear?: number | null;
  priorityScore: number;
  priorityBand: "HIGH" | "MEDIUM" | "LOW";
  reasons: PdfDecisionActiveLearningReason[];
  reasonDetails: string[];
  decisionRoute?: string | null;
  riskLevel?: string | null;
  confidenceScore?: number | null;
  outcome?: string | null;
  manualReviewReasons: string[];
  blockingRuleCodes: string[];
  parserRiskReasons: string[];
  goldSetStatus?: "CANDIDATE" | "APPROVED" | "EXCLUDED" | null;
  alreadyCurated: boolean;
  suggestedGoldSetReason?: string | null;
  suggestedAction: PdfDecisionActiveLearningSuggestedAction;
  coverageSignals: PdfDecisionActiveLearningCoverageSignal[];
  clusterKey?: string | null;
  clusterLabel?: string | null;
  diversityScore: number;
  investigationArea?: "PARSER" | "OCR_ODL" | "VALIDATION" | "REVIEW_LABELS" | "NONE";
  usefulForGoldSet: boolean;
};

export type PdfDecisionActiveLearningCoverageSummary = {
  routeCounts: Record<string, number>;
  riskCounts: Record<string, number>;
  outcomeCounts: Record<string, number>;
  routeRiskCounts: Record<string, number>;
  fiscalYearCounts: Record<string, number>;
};

export type PdfDecisionActiveLearningClusterSummaryItem = {
  clusterKey: string;
  label: string;
  count: number;
};

export type PdfDecisionActiveLearningQueueResult = {
  version: "pdf-decision-active-learning-queue-v1";
  generatedAt: string;
  input: {
    limit: number;
    fiscalYear?: number;
    orgNumber?: string;
    includeCurated: boolean;
    ruleConfigVersion: string;
  };
  totalCandidates: number;
  items: PdfDecisionActiveLearningQueueItem[];
  coverageSummary: PdfDecisionActiveLearningCoverageSummary;
  clusterSummary: PdfDecisionActiveLearningClusterSummaryItem[];
};

function addReason(
  reasons: Set<PdfDecisionActiveLearningReason>,
  details: string[],
  reason: PdfDecisionActiveLearningReason,
  detail: string,
) {
  reasons.add(reason);
  details.push(detail);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function priorityBand(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 60) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

function suggestedReason(doc: PdfDecisionShadowDocument): PdfDecisionGoldSetReason {
  if (doc.outcome === "MANUAL_REVIEW_UNREADABLE") return PdfDecisionGoldSetReason.UNREADABLE;
  if (doc.outcome === "REPROCESS_REQUESTED") return PdfDecisionGoldSetReason.REPROCESS_REQUESTED;
  if (doc.blockingRuleCodes.some((code) => code.includes("BALANCE"))) {
    return PdfDecisionGoldSetReason.BALANCE_MISMATCH;
  }
  if (doc.riskLevel === "LOW" && doc.outcome !== "PUBLISHED") {
    return PdfDecisionGoldSetReason.LOW_RISK_FAILED;
  }
  if (
    doc.riskLevel === "HIGH" &&
    (doc.outcome === "PUBLISHED" || doc.outcome === "MANUAL_REVIEW_ACCEPTED")
  ) {
    return PdfDecisionGoldSetReason.HIGH_RISK_SUCCEEDED;
  }
  if (doc.outcome === "MANUAL_REVIEW_CORRECTED") return PdfDecisionGoldSetReason.MANUAL_CORRECTION;
  if (doc.parserRiskReasons.length > 0) return PdfDecisionGoldSetReason.OCR_RISK;
  return PdfDecisionGoldSetReason.REPRESENTATIVE_SAMPLE;
}

function normalizeReason(reason: string): string {
  return reason
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function buildClusterKey(doc: PdfDecisionShadowDocument): string | null {
  if (doc.blockingRuleCodes.length > 0) {
    return `blocking:${doc.blockingRuleCodes[0]}`;
  }
  if (doc.parserRiskReasons.length > 0) {
    return `parser:${normalizeReason(doc.parserRiskReasons[0])}`;
  }
  if (doc.manualReviewReasons.length > 0) {
    return `manual:${normalizeReason(doc.manualReviewReasons[0])}`;
  }
  const route = doc.decisionRoute ?? "UNKNOWN";
  const risk = doc.riskLevel ?? "UNKNOWN";
  return `route-risk:${route}:${risk}`;
}

function buildClusterLabel(clusterKey: string): string {
  if (clusterKey.startsWith("blocking:")) {
    const code = clusterKey.slice("blocking:".length);
    return `Blocking rule: ${code}`;
  }
  if (clusterKey.startsWith("parser:")) {
    const reason = clusterKey.slice("parser:".length).replace(/_/g, " ");
    return `Parser risk: ${reason}`;
  }
  if (clusterKey.startsWith("manual:")) {
    const reason = clusterKey.slice("manual:".length).replace(/_/g, " ");
    return `Manual review: ${reason}`;
  }
  if (clusterKey.startsWith("route-risk:")) {
    const parts = clusterKey.slice("route-risk:".length).split(":");
    return `Route ${parts[0] ?? "?"} / Risk ${parts[1] ?? "?"}`;
  }
  return clusterKey;
}

type CoverageCounts = {
  routeCounts: Record<string, number>;
  riskCounts: Record<string, number>;
  outcomeCounts: Record<string, number>;
  routeRiskCounts: Record<string, number>;
  fiscalYearCounts: Record<string, number>;
  parserReasonCounts: Record<string, number>;
  blockingCodeCounts: Record<string, number>;
};

function buildCoverageCounts(docs: PdfDecisionShadowDocument[]): CoverageCounts {
  const routeCounts: Record<string, number> = {};
  const riskCounts: Record<string, number> = {};
  const outcomeCounts: Record<string, number> = {};
  const routeRiskCounts: Record<string, number> = {};
  const fiscalYearCounts: Record<string, number> = {};
  const parserReasonCounts: Record<string, number> = {};
  const blockingCodeCounts: Record<string, number> = {};

  for (const doc of docs) {
    const route = doc.decisionRoute ?? "UNKNOWN";
    const risk = doc.riskLevel ?? "UNKNOWN";
    const outcome = doc.outcome ?? "UNKNOWN";
    const year = String(doc.fiscalYear ?? "UNKNOWN");
    const routeRiskKey = `${route}:${risk}`;

    routeCounts[route] = (routeCounts[route] ?? 0) + 1;
    riskCounts[risk] = (riskCounts[risk] ?? 0) + 1;
    outcomeCounts[outcome] = (outcomeCounts[outcome] ?? 0) + 1;
    routeRiskCounts[routeRiskKey] = (routeRiskCounts[routeRiskKey] ?? 0) + 1;
    fiscalYearCounts[year] = (fiscalYearCounts[year] ?? 0) + 1;

    for (const reason of doc.parserRiskReasons) {
      const key = normalizeReason(reason);
      parserReasonCounts[key] = (parserReasonCounts[key] ?? 0) + 1;
    }
    for (const code of doc.blockingRuleCodes) {
      blockingCodeCounts[code] = (blockingCodeCounts[code] ?? 0) + 1;
    }
  }

  return {
    routeCounts,
    riskCounts,
    outcomeCounts,
    routeRiskCounts,
    fiscalYearCounts,
    parserReasonCounts,
    blockingCodeCounts,
  };
}

const UNDERREPRESENTED_THRESHOLD = 2;

function isUnderrepresented(count: number, total: number): boolean {
  if (count <= UNDERREPRESENTED_THRESHOLD) return true;
  const share = count / total;
  return share < 0.05;
}

function buildDiversityScore(
  doc: PdfDecisionShadowDocument,
  counts: CoverageCounts,
  total: number,
): { score: number; signals: PdfDecisionActiveLearningCoverageSignal[] } {
  let score = 0;
  const signals: PdfDecisionActiveLearningCoverageSignal[] = [];

  if (!doc.goldSet) {
    score += 20;
    signals.push("MISSING_FROM_GOLD_SET");
  }

  const route = doc.decisionRoute ?? "UNKNOWN";
  const risk = doc.riskLevel ?? "UNKNOWN";
  const outcome = doc.outcome ?? "UNKNOWN";
  const year = String(doc.fiscalYear ?? "UNKNOWN");
  const routeRiskKey = `${route}:${risk}`;

  if (isUnderrepresented(counts.routeCounts[route] ?? 0, total)) {
    score += 15;
    signals.push("UNDERREPRESENTED_ROUTE");
  }
  if (isUnderrepresented(counts.riskCounts[risk] ?? 0, total)) {
    score += 15;
    signals.push("UNDERREPRESENTED_RISK");
  }
  if (isUnderrepresented(counts.outcomeCounts[outcome] ?? 0, total)) {
    score += 15;
    signals.push("UNDERREPRESENTED_OUTCOME");
  }
  if (isUnderrepresented(counts.routeRiskCounts[routeRiskKey] ?? 0, total)) {
    score += 15;
    signals.push("UNDERREPRESENTED_ROUTE_RISK_COMBO");
  }
  if (isUnderrepresented(counts.fiscalYearCounts[year] ?? 0, total)) {
    score += 10;
    signals.push("UNDERREPRESENTED_YEAR");
  }

  const hasRepeatedParser = doc.parserRiskReasons.some(
    (r) => (counts.parserReasonCounts[normalizeReason(r)] ?? 0) > 1,
  );
  const hasRepeatedBlocking = doc.blockingRuleCodes.some(
    (c) => (counts.blockingCodeCounts[c] ?? 0) > 1,
  );

  if (hasRepeatedParser) {
    score += 10;
    signals.push("REPEATED_PARSER_FAILURE");
  }
  if (hasRepeatedBlocking) {
    score += 10;
    signals.push("REPEATED_BLOCKING_RULE");
  }

  if (signals.length === 0 && score === 0) {
    signals.push("DIVERSE_SAMPLE");
  }

  return { score: Math.min(score, 100), signals };
}

function buildInvestigationArea(
  doc: PdfDecisionShadowDocument,
  signals: PdfDecisionActiveLearningCoverageSignal[],
): "PARSER" | "OCR_ODL" | "VALIDATION" | "REVIEW_LABELS" | "NONE" {
  if (signals.includes("REPEATED_PARSER_FAILURE") || doc.parserRiskReasons.length > 0) {
    return "PARSER";
  }
  if (doc.outcome === "MANUAL_REVIEW_UNREADABLE") {
    return "OCR_ODL";
  }
  if (doc.blockingRuleCodes.length > 0) {
    return "VALIDATION";
  }
  if (doc.latestReviewDecisionType === "CORRECTED" || doc.outcome === "MANUAL_REVIEW_CORRECTED") {
    return "REVIEW_LABELS";
  }
  return "NONE";
}

function buildSuggestedAction(
  doc: PdfDecisionShadowDocument,
  priorityScore: number,
  investigationArea: "PARSER" | "OCR_ODL" | "VALIDATION" | "REVIEW_LABELS" | "NONE",
  signals: PdfDecisionActiveLearningCoverageSignal[],
): PdfDecisionActiveLearningSuggestedAction {
  if (doc.goldSet?.status === "EXCLUDED") return "EXCLUDE";

  if (signals.includes("REPEATED_PARSER_FAILURE") || investigationArea === "PARSER") {
    return "PARSER_INVESTIGATION";
  }

  if (doc.goldSet?.status === "CANDIDATE" && priorityScore >= 60) {
    return "APPROVE_GOLD_SET";
  }

  const needsReview =
    doc.reviewStatus == null &&
    (doc.riskLevel === "HIGH" ||
      (doc.confidenceScore !== null &&
        doc.confidenceScore !== undefined &&
        doc.confidenceScore < 0.45));
  if (needsReview && priorityScore >= 60) {
    return "SEND_TO_REVIEW";
  }

  if (!doc.goldSet && priorityScore >= 30) {
    return "MARK_CANDIDATE";
  }

  return "NO_ACTION";
}

function buildQueueItem(
  doc: PdfDecisionShadowDocument,
  ruleConfig: PdfDecisionRuleConfig,
  counts: CoverageCounts,
  total: number,
): PdfDecisionActiveLearningQueueItem {
  let score = 0;
  const reasons = new Set<PdfDecisionActiveLearningReason>();
  const reasonDetails: string[] = [];

  if (doc.riskLevel === "LOW" && doc.outcome !== "PUBLISHED" && doc.outcome !== "UNKNOWN") {
    score += 35;
    addReason(reasons, reasonDetails, "LOW_RISK_FAILED", "LOW risk document did not publish cleanly.");
  }
  if (doc.riskLevel === "HIGH") {
    score += 10;
    addReason(reasons, reasonDetails, "HIGH_RISK", "HIGH risk document.");
  }
  if (
    doc.riskLevel === "HIGH" &&
    (doc.outcome === "PUBLISHED" || doc.outcome === "MANUAL_REVIEW_ACCEPTED")
  ) {
    score += 30;
    addReason(reasons, reasonDetails, "HIGH_RISK_SUCCEEDED", "HIGH risk document was accepted or published.");
  }
  if (doc.latestReviewDecisionType === "CORRECTED" || doc.outcome === "MANUAL_REVIEW_CORRECTED") {
    score += 30;
    addReason(reasons, reasonDetails, "MANUAL_CORRECTION", "Reviewer correction exists.");
  }
  if (doc.outcome === "MANUAL_REVIEW_UNREADABLE") {
    score += 25;
    addReason(reasons, reasonDetails, "UNREADABLE", "Reviewer marked the document unreadable.");
  }
  if (doc.outcome === "REPROCESS_REQUESTED") {
    score += 20;
    addReason(reasons, reasonDetails, "REPROCESS_REQUESTED", "Reviewer requested reprocessing.");
  }
  if (doc.blockingRuleCodes.length > 0) {
    score += 20;
    const hasBalance = doc.blockingRuleCodes.some((code) => code.includes("BALANCE"));
    addReason(
      reasons,
      reasonDetails,
      hasBalance ? "BALANCE_MISMATCH" : "OTHER",
      `Blocking rule code(s): ${doc.blockingRuleCodes.slice(0, 3).join(", ")}.`,
    );
  }
  if (doc.confidenceScore !== null && doc.confidenceScore !== undefined) {
    const lowThreshold = ruleConfig.activeLearning?.lowConfidenceThreshold ?? 0.45;
    const mediumThreshold = ruleConfig.activeLearning?.mediumConfidenceThreshold ?? 0.65;
    if (doc.confidenceScore < lowThreshold) {
      score += 15;
      addReason(
        reasons,
        reasonDetails,
        "LOW_CONFIDENCE",
        `Decision confidence is below ${Math.round(lowThreshold * 100)}%.`,
      );
    } else if (doc.confidenceScore <= mediumThreshold) {
      score += 10;
      addReason(
        reasons,
        reasonDetails,
        "LOW_CONFIDENCE",
        `Decision confidence is between ${Math.round(lowThreshold * 100)}% and ${Math.round(mediumThreshold * 100)}%.`,
      );
    }
  }
  if (doc.parserRiskReasons.length > 0) {
    score += 15;
    addReason(reasons, reasonDetails, "PARSER_RISK", "Parser risk reasons are present.");
  }
  if (
    doc.manualReviewReasons.some((reason) =>
      /missing financial|no financial|weak page|page hint/i.test(reason),
    )
  ) {
    score += 15;
    addReason(
      reasons,
      reasonDetails,
      doc.manualReviewReasons.some((reason) => /weak page|page hint/i.test(reason))
        ? "WEAK_PAGE_HINTS"
        : "MISSING_FINANCIAL_SECTIONS",
      "Decision manual-review reasons mention weak hints or missing financial sections.",
    );
  }
  if (!doc.goldSet) {
    score += 10;
    addReason(reasons, reasonDetails, "NOT_IN_GOLD_SET", "Not currently curated into the gold set.");
  }
  if (doc.goldSet?.status === "APPROVED") score -= 25;
  if (doc.goldSet?.status === "EXCLUDED") score -= 50;

  const { score: diversityScore, signals: coverageSignals } = buildDiversityScore(doc, counts, total);

  // Add diversity contribution (+0.25 * diversityScore) on top of base priority
  const rawScore = score + Math.round(0.25 * diversityScore);
  const priorityScore = clampScore(rawScore);

  const alreadyCurated = Boolean(doc.goldSet);
  const band = priorityBand(priorityScore);
  const clusterKey = buildClusterKey(doc);
  const clusterLabel = clusterKey ? buildClusterLabel(clusterKey) : null;
  const investigationArea = buildInvestigationArea(doc, coverageSignals);
  const usefulForGoldSet =
    !doc.goldSet || doc.goldSet.status === "CANDIDATE";

  const action = buildSuggestedAction(doc, priorityScore, investigationArea, coverageSignals);

  return {
    filingId: doc.filingId,
    extractionRunId: doc.extractionRunId,
    orgNumber: doc.orgNumber,
    fiscalYear: doc.fiscalYear,
    priorityScore,
    priorityBand: band,
    reasons: [...reasons],
    reasonDetails,
    decisionRoute: doc.decisionRoute,
    riskLevel: doc.riskLevel,
    confidenceScore: doc.confidenceScore,
    outcome: doc.outcome,
    manualReviewReasons: doc.manualReviewReasons,
    blockingRuleCodes: doc.blockingRuleCodes,
    parserRiskReasons: doc.parserRiskReasons,
    goldSetStatus: doc.goldSet?.status ?? null,
    alreadyCurated,
    suggestedGoldSetReason: suggestedReason(doc),
    suggestedAction: action,
    coverageSignals,
    clusterKey,
    clusterLabel,
    diversityScore,
    investigationArea,
    usefulForGoldSet,
  };
}

function buildCoverageSummary(counts: CoverageCounts): PdfDecisionActiveLearningCoverageSummary {
  return {
    routeCounts: counts.routeCounts,
    riskCounts: counts.riskCounts,
    outcomeCounts: counts.outcomeCounts,
    routeRiskCounts: counts.routeRiskCounts,
    fiscalYearCounts: counts.fiscalYearCounts,
  };
}

function buildClusterSummary(
  items: PdfDecisionActiveLearningQueueItem[],
): PdfDecisionActiveLearningClusterSummaryItem[] {
  const clusterCounts: Record<string, { label: string; count: number }> = {};
  for (const item of items) {
    if (!item.clusterKey) continue;
    const existing = clusterCounts[item.clusterKey];
    if (existing) {
      existing.count += 1;
    } else {
      clusterCounts[item.clusterKey] = {
        label: item.clusterLabel ?? item.clusterKey,
        count: 1,
      };
    }
  }
  return Object.entries(clusterCounts)
    .map(([clusterKey, { label, count }]) => ({ clusterKey, label, count }))
    .sort((a, b) => b.count - a.count || a.clusterKey.localeCompare(b.clusterKey));
}

export async function listPdfDecisionActiveLearningQueue(
  input?: {
    limit?: number;
    fiscalYear?: number;
    orgNumber?: string;
    includeCurated?: boolean;
    ruleConfig?: PdfDecisionRuleConfigOverrides | PdfDecisionRuleConfig;
    minPriority?: number;
    priorityBand?: "HIGH" | "MEDIUM" | "LOW";
    investigationArea?: "PARSER" | "OCR_ODL" | "VALIDATION" | "REVIEW_LABELS" | "NONE";
  },
  deps?: {
    evaluateShadow?: (params: {
      limit: number;
      fiscalYear?: number;
      orgNumber?: string;
    }) => Promise<PdfDecisionShadowEvaluationResult>;
  },
): Promise<PdfDecisionActiveLearningQueueResult> {
  const limit = input?.limit ?? 100;
  const includeCurated = input?.includeCurated ?? false;
  const ruleConfig = normalizePdfDecisionRuleConfig(input?.ruleConfig);
  const evaluateShadow =
    deps?.evaluateShadow ??
    (async (params: { limit: number; fiscalYear?: number; orgNumber?: string }) => {
      const storage = new LocalAnnualReportArtifactStorage();
      return evaluatePdfDecisionShadow(params, {
        listRows: listAnnualReportDecisionShadowRows,
        listGoldSetItems: listPdfDecisionGoldSetItemsByFilingIds,
        readArtifact: async (key) => {
          try {
            return await storage.getArtifactBuffer(key);
          } catch {
            return null;
          }
        },
      });
    });

  const shadow = await evaluateShadow({
    limit: Math.max(limit * 3, limit),
    fiscalYear: input?.fiscalYear,
    orgNumber: input?.orgNumber,
  });

  const counts = buildCoverageCounts(shadow.documents);
  const total = shadow.documents.length || 1;

  const allItems = shadow.documents
    .map((doc) => buildQueueItem(doc, ruleConfig, counts, total))
    .filter((item) => {
      if (includeCurated) return true;
      return item.goldSetStatus !== "APPROVED" && item.goldSetStatus !== "EXCLUDED";
    })
    .filter((item) => item.priorityScore > 0)
    .filter((item) => {
      if (input?.minPriority !== undefined) return item.priorityScore >= input.minPriority;
      return true;
    })
    .filter((item) => {
      if (input?.priorityBand !== undefined) return item.priorityBand === input.priorityBand;
      return true;
    })
    .filter((item) => {
      if (input?.investigationArea !== undefined) return item.investigationArea === input.investigationArea;
      return true;
    })
    .sort(
      (a, b) =>
        b.priorityScore - a.priorityScore ||
        b.diversityScore - a.diversityScore ||
        a.filingId.localeCompare(b.filingId),
    );

  const coverageSummary = buildCoverageSummary(counts);
  const clusterSummary = buildClusterSummary(allItems);

  return {
    version: "pdf-decision-active-learning-queue-v1",
    generatedAt: new Date().toISOString(),
    input: {
      limit,
      fiscalYear: input?.fiscalYear,
      orgNumber: input?.orgNumber,
      includeCurated,
      ruleConfigVersion: ruleConfig.version,
    },
    totalCandidates: allItems.length,
    items: allItems.slice(0, limit),
    coverageSummary,
    clusterSummary,
  };
}
