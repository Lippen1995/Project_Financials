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
  suggestedAction:
    | "REVIEW"
    | "MARK_CANDIDATE"
    | "APPROVE_GOLD_SET"
    | "EXCLUDE"
    | "NO_ACTION";
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

function buildQueueItem(
  doc: PdfDecisionShadowDocument,
  ruleConfig: PdfDecisionRuleConfig,
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

  const priorityScore = clampScore(score);
  const alreadyCurated = Boolean(doc.goldSet);
  const band = priorityBand(priorityScore);
  const needsManualReview =
    doc.reviewStatus == null &&
    (doc.riskLevel === "HIGH" ||
      (doc.confidenceScore !== null &&
        doc.confidenceScore !== undefined &&
        doc.confidenceScore <
          (ruleConfig.activeLearning?.lowConfidenceThreshold ?? 0.45)));
  const action =
    doc.goldSet?.status === "EXCLUDED"
      ? "EXCLUDE"
      : doc.goldSet?.status === "CANDIDATE" && priorityScore >= 60
        ? "APPROVE_GOLD_SET"
        : needsManualReview && priorityScore >= 60
          ? "REVIEW"
        : !alreadyCurated && priorityScore >= 30
          ? "MARK_CANDIDATE"
          : "NO_ACTION";

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
  };
}

export async function listPdfDecisionActiveLearningQueue(
  input?: {
    limit?: number;
    fiscalYear?: number;
    orgNumber?: string;
    includeCurated?: boolean;
    ruleConfig?: PdfDecisionRuleConfigOverrides | PdfDecisionRuleConfig;
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

  const allItems = shadow.documents
    .map((doc) => buildQueueItem(doc, ruleConfig))
    .filter((item) => {
      if (includeCurated) return true;
      return item.goldSetStatus !== "APPROVED" && item.goldSetStatus !== "EXCLUDED";
    })
    .filter((item) => item.priorityScore > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore || a.filingId.localeCompare(b.filingId));

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
  };
}
