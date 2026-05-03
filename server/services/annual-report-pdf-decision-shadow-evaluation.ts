import type { AnnualReportDecisionShadowRow } from "@/server/persistence/annual-report-decision-shadow-repository";
import { listAnnualReportDecisionShadowRows } from "@/server/persistence/annual-report-decision-shadow-repository";
import {
  listPdfDecisionGoldSetItemsByFilingIds,
  type PdfDecisionGoldSetItemRecord,
} from "@/server/persistence/pdf-decision-gold-set-repository";

export type PdfDecisionShadowOutcome =
  | "PUBLISHED"
  | "MANUAL_REVIEW_PENDING"
  | "MANUAL_REVIEW_ACCEPTED"
  | "MANUAL_REVIEW_CORRECTED"
  | "MANUAL_REVIEW_REJECTED"
  | "MANUAL_REVIEW_UNREADABLE"
  | "REPROCESS_REQUESTED"
  | "FAILED"
  | "UNKNOWN";

export type PdfDecisionShadowDocument = {
  filingId: string;
  extractionRunId?: string | null;
  orgNumber?: string | null;
  fiscalYear?: number | null;

  decisionPhase?: "pre_extraction" | "post_validation" | string | null;
  decisionRoute?: string | null;
  riskLevel?: string | null;
  confidenceScore?: number | null;
  manualReviewReasons: string[];
  reasons: string[];

  qualityRisk?: string | null;
  recommendedRouteHint?: string | null;
  parserRiskReasons: string[];
  extractionWarnings: string[];

  hasStructuredDocument: boolean;
  hasPdfDecision: boolean;
  hasPostValidationDecision: boolean;

  filingStatus?: string | null;
  extractionRunStatus?: string | null;
  validationScore?: number | null;
  blockingRuleCodes: string[];
  warningRuleCodes: string[];

  reviewStatus?: string | null;
  latestReviewDecisionType?: string | null;
  reviewDecisionCount: number;
  trainingLabelCount: number;

  outcome: PdfDecisionShadowOutcome;
  goldSet?: {
    status: "CANDIDATE" | "APPROVED" | "EXCLUDED";
    reason: string;
    note?: string | null;
    updatedAt?: string;
  } | null;
};

export type PdfDecisionShadowMetrics = {
  totalDocuments: number;

  routeDistribution: Record<string, number>;
  riskDistribution: Record<string, number>;
  outcomeDistribution: Record<string, number>;

  manualReviewRateByRisk: Record<string, number>;
  correctionRateByRisk: Record<string, number>;
  publishRateByRisk: Record<string, number>;
  unreadableRateByRoute: Record<string, number>;

  averageConfidenceByRisk: Record<string, number>;

  goldSetDistribution: Record<string, number>;
  approvedGoldSetCount: number;
  candidateGoldSetCount: number;
  excludedGoldSetCount: number;

  topManualReviewReasons: Array<{ reason: string; count: number }>;
  topBlockingRuleCodes: Array<{ ruleCode: string; count: number }>;
  topParserRiskReasons: Array<{ reason: string; count: number }>;

  candidateGoldSet: Array<{
    filingId: string;
    extractionRunId?: string | null;
    orgNumber?: string | null;
    fiscalYear?: number | null;
    decisionRoute?: string | null;
    riskLevel?: string | null;
    confidenceScore?: number | null;
    outcome: PdfDecisionShadowOutcome;
    reason: string;
    goldSet?: PdfDecisionShadowDocument["goldSet"];
  }>;
};

export type PdfDecisionShadowEvaluationResult = {
  version: "pdf-decision-shadow-evaluation-v1";
  generatedAt: string;
  input: {
    limit: number;
    fiscalYear?: number;
    orgNumber?: string;
  };
  documents: PdfDecisionShadowDocument[];
  metrics: PdfDecisionShadowMetrics;
};

// ---------------------------------------------------------------------------
// PR-#17 artifact wrapper type
// ---------------------------------------------------------------------------

type PdfDecisionArtifactWrapper = {
  version: string;
  phase: string;
  decision: {
    route?: string;
    riskLevel?: string;
    confidenceScore?: number;
    reasons?: string[];
    manualReviewReasons?: string[];
    diagnostics?: {
      qualityRisk?: string;
      recommendedRouteHint?: string;
      parserRiskReasons?: string[];
      extractionWarnings?: string[];
    };
  };
  inputSummary?: unknown;
  createdAt?: string;
  source?: string;
};

function isDecisionWrapper(value: unknown): value is PdfDecisionArtifactWrapper {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["phase"] === "string" &&
    v["decision"] !== null &&
    typeof v["decision"] === "object"
  );
}

function parseDecisionBuffer(buffer: Buffer): PdfDecisionArtifactWrapper | null {
  try {
    const parsed: unknown = JSON.parse(buffer.toString("utf8"));
    if (isDecisionWrapper(parsed)) return parsed;
    // Tolerate direct decision payload (legacy / pre-PR-17)
    if (parsed && typeof parsed === "object") {
      const p = parsed as Record<string, unknown>;
      if (typeof p["route"] === "string") {
        return {
          version: "unknown",
          phase: "pre_extraction",
          decision: p as PdfDecisionArtifactWrapper["decision"],
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Outcome derivation
// ---------------------------------------------------------------------------

function deriveOutcome(row: AnnualReportDecisionShadowRow): PdfDecisionShadowOutcome {
  const status = row.filingStatus;
  const review = row.latestReview;
  const latestDecision = review?.decisions[0]?.decisionType;

  // Review decisions take priority — they carry the reviewer's explicit verdict.
  if (latestDecision === "UNREADABLE") return "MANUAL_REVIEW_UNREADABLE";
  if (latestDecision === "REPROCESS_REQUESTED") return "REPROCESS_REQUESTED";
  if (latestDecision === "REJECTED") return "MANUAL_REVIEW_REJECTED";
  if (latestDecision === "CORRECTED") return "MANUAL_REVIEW_CORRECTED";
  if (latestDecision === "ACCEPTED" || latestDecision === "PUBLISHED_FROM_REVIEW")
    return "MANUAL_REVIEW_ACCEPTED";

  if (review?.status === "REPROCESS_REQUESTED") return "REPROCESS_REQUESTED";
  if (review?.status === "PENDING_REVIEW") return "MANUAL_REVIEW_PENDING";
  if (review?.status === "ACCEPTED") return "MANUAL_REVIEW_ACCEPTED";
  if (review?.status === "REJECTED") return "MANUAL_REVIEW_REJECTED";

  if (status === "PUBLISHED") return "PUBLISHED";
  if (status === "FAILED") return "FAILED";
  if (status === "MANUAL_REVIEW") return "MANUAL_REVIEW_PENDING";

  return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Row → document
// ---------------------------------------------------------------------------

function buildDocument(
  row: AnnualReportDecisionShadowRow,
  parsedDecisions: Map<string, PdfDecisionArtifactWrapper>,
  goldSetItem?: PdfDecisionGoldSetItemRecord | null,
): PdfDecisionShadowDocument {
  const outcome = deriveOutcome(row);

  // Pick best decision: prefer post_validation, then pre_extraction, then latest
  let chosenDecision: PdfDecisionArtifactWrapper | undefined;
  for (const artifact of row.pdfDecisionArtifacts) {
    const parsed = parsedDecisions.get(artifact.storageKey);
    if (!parsed) continue;
    if (!chosenDecision) {
      chosenDecision = parsed;
    } else if (
      parsed.phase === "post_validation" &&
      chosenDecision.phase !== "post_validation"
    ) {
      chosenDecision = parsed;
    }
  }

  const d = chosenDecision?.decision;
  const diagnostics = d?.diagnostics;

  return {
    filingId: row.filingId,
    extractionRunId: row.latestExtractionRun?.id ?? null,
    orgNumber: row.orgNumber,
    fiscalYear: row.fiscalYear,

    decisionPhase: chosenDecision?.phase ?? null,
    decisionRoute: d?.route ?? null,
    riskLevel: d?.riskLevel ?? null,
    confidenceScore: d?.confidenceScore ?? null,
    manualReviewReasons: d?.manualReviewReasons ?? [],
    reasons: d?.reasons ?? [],

    qualityRisk: diagnostics?.qualityRisk ?? null,
    recommendedRouteHint: diagnostics?.recommendedRouteHint ?? null,
    parserRiskReasons: diagnostics?.parserRiskReasons ?? [],
    extractionWarnings: diagnostics?.extractionWarnings ?? [],

    hasStructuredDocument: row.hasStructuredDocument,
    hasPdfDecision: row.pdfDecisionArtifacts.length > 0,
    hasPostValidationDecision: row.pdfDecisionArtifacts.some(
      (a) => parsedDecisions.get(a.storageKey)?.phase === "post_validation",
    ),

    filingStatus: row.filingStatus,
    extractionRunStatus: row.latestExtractionRun?.status ?? null,
    validationScore: row.latestExtractionRun?.validationScore ?? null,
    blockingRuleCodes: row.latestReview?.blockingRuleCodes ?? [],
    warningRuleCodes: [],

    reviewStatus: row.latestReview?.status ?? null,
    latestReviewDecisionType: row.latestReview?.decisions[0]?.decisionType ?? null,
    reviewDecisionCount: row.latestReview?.decisions.length ?? 0,
    trainingLabelCount: row.trainingLabelCount,

    outcome,
    goldSet: goldSetItem
      ? {
          status: goldSetItem.status,
          reason: goldSetItem.reason,
          note: goldSetItem.note,
          updatedAt: goldSetItem.updatedAt.toISOString(),
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

const MANUAL_REVIEW_OUTCOMES = new Set<PdfDecisionShadowOutcome>([
  "MANUAL_REVIEW_PENDING",
  "MANUAL_REVIEW_ACCEPTED",
  "MANUAL_REVIEW_CORRECTED",
  "MANUAL_REVIEW_REJECTED",
  "MANUAL_REVIEW_UNREADABLE",
]);

function safeRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

function topN<T extends { count: number }>(items: T[], n = 20): T[] {
  return items.sort((a, b) => b.count - a.count).slice(0, n);
}

function computeMetrics(documents: PdfDecisionShadowDocument[]): PdfDecisionShadowMetrics {
  const routeDist: Record<string, number> = {};
  const riskDist: Record<string, number> = {};
  const outcomeDist: Record<string, number> = {};

  const byRisk: Record<string, PdfDecisionShadowDocument[]> = {};
  const byRoute: Record<string, PdfDecisionShadowDocument[]> = {};

  const reviewReasonCounts: Record<string, number> = {};
  const blockingRuleCodeCounts: Record<string, number> = {};
  const parserRiskReasonCounts: Record<string, number> = {};
  const goldSetDistribution: Record<string, number> = {};

  for (const doc of documents) {
    const route = doc.decisionRoute ?? "UNKNOWN";
    const risk = doc.riskLevel ?? "UNKNOWN";

    routeDist[route] = (routeDist[route] ?? 0) + 1;
    riskDist[risk] = (riskDist[risk] ?? 0) + 1;
    outcomeDist[doc.outcome] = (outcomeDist[doc.outcome] ?? 0) + 1;

    (byRisk[risk] ??= []).push(doc);
    (byRoute[route] ??= []).push(doc);

    for (const reason of doc.manualReviewReasons) {
      reviewReasonCounts[reason] = (reviewReasonCounts[reason] ?? 0) + 1;
    }
    for (const code of doc.blockingRuleCodes) {
      blockingRuleCodeCounts[code] = (blockingRuleCodeCounts[code] ?? 0) + 1;
    }
    for (const reason of doc.parserRiskReasons) {
      parserRiskReasonCounts[reason] = (parserRiskReasonCounts[reason] ?? 0) + 1;
    }
    if (doc.goldSet) {
      goldSetDistribution[doc.goldSet.status] =
        (goldSetDistribution[doc.goldSet.status] ?? 0) + 1;
    }
  }

  const manualReviewRateByRisk: Record<string, number> = {};
  const correctionRateByRisk: Record<string, number> = {};
  const publishRateByRisk: Record<string, number> = {};
  const averageConfidenceByRisk: Record<string, number> = {};
  const unreadableRateByRoute: Record<string, number> = {};

  for (const [risk, docs] of Object.entries(byRisk)) {
    manualReviewRateByRisk[risk] = safeRate(
      docs.filter((d) => MANUAL_REVIEW_OUTCOMES.has(d.outcome)).length,
      docs.length,
    );
    correctionRateByRisk[risk] = safeRate(
      docs.filter((d) => d.outcome === "MANUAL_REVIEW_CORRECTED").length,
      docs.length,
    );
    publishRateByRisk[risk] = safeRate(
      docs.filter((d) => d.outcome === "PUBLISHED").length,
      docs.length,
    );
    const confidenceScores = docs
      .map((d) => d.confidenceScore)
      .filter((s): s is number => s !== null && s !== undefined);
    averageConfidenceByRisk[risk] =
      confidenceScores.length > 0
        ? Math.round(
            (confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length) * 10000,
          ) / 10000
        : 0;
  }

  for (const [route, docs] of Object.entries(byRoute)) {
    unreadableRateByRoute[route] = safeRate(
      docs.filter((d) => d.outcome === "MANUAL_REVIEW_UNREADABLE").length,
      docs.length,
    );
  }

  const topManualReviewReasons = topN(
    Object.entries(reviewReasonCounts).map(([reason, count]) => ({ reason, count })),
  );
  const topBlockingRuleCodes = topN(
    Object.entries(blockingRuleCodeCounts).map(([ruleCode, count]) => ({ ruleCode, count })),
  );
  const topParserRiskReasons = topN(
    Object.entries(parserRiskReasonCounts).map(([reason, count]) => ({ reason, count })),
  );

  const candidateGoldSet = selectGoldSetCandidates(documents);

  return {
    totalDocuments: documents.length,
    routeDistribution: routeDist,
    riskDistribution: riskDist,
    outcomeDistribution: outcomeDist,
    manualReviewRateByRisk,
    correctionRateByRisk,
    publishRateByRisk,
    unreadableRateByRoute,
    averageConfidenceByRisk,
    goldSetDistribution,
    approvedGoldSetCount: goldSetDistribution["APPROVED"] ?? 0,
    candidateGoldSetCount: goldSetDistribution["CANDIDATE"] ?? 0,
    excludedGoldSetCount: goldSetDistribution["EXCLUDED"] ?? 0,
    topManualReviewReasons,
    topBlockingRuleCodes,
    topParserRiskReasons,
    candidateGoldSet,
  };
}

// ---------------------------------------------------------------------------
// Gold set selection
// ---------------------------------------------------------------------------

const GOLD_SET_MAX = 25;

function selectGoldSetCandidates(
  documents: PdfDecisionShadowDocument[],
): PdfDecisionShadowMetrics["candidateGoldSet"] {
  const candidates: PdfDecisionShadowMetrics["candidateGoldSet"] = [];

  const add = (doc: PdfDecisionShadowDocument, reason: string) => {
    if (candidates.length >= GOLD_SET_MAX) return;
    if (candidates.some((c) => c.filingId === doc.filingId)) return;
    if (doc.goldSet?.status === "EXCLUDED") return;
    candidates.push({
      filingId: doc.filingId,
      extractionRunId: doc.extractionRunId,
      orgNumber: doc.orgNumber,
      fiscalYear: doc.fiscalYear,
      decisionRoute: doc.decisionRoute,
      riskLevel: doc.riskLevel,
      confidenceScore: doc.confidenceScore,
      outcome: doc.outcome,
      reason,
      goldSet: doc.goldSet ?? null,
    });
  };

  // LOW risk but not published — Decision Engine said OK but it wasn't
  for (const doc of documents) {
    if (doc.riskLevel === "LOW" && doc.outcome !== "PUBLISHED" && doc.outcome !== "UNKNOWN") {
      add(doc, "LOW risk but not published — potential engine over-confidence");
    }
  }

  // HIGH risk but accepted/published without correction
  for (const doc of documents) {
    if (
      doc.riskLevel === "HIGH" &&
      (doc.outcome === "PUBLISHED" || doc.outcome === "MANUAL_REVIEW_ACCEPTED")
    ) {
      add(doc, "HIGH risk accepted/published — potential engine over-caution");
    }
  }

  // MANUAL_REVIEW route with accepted or corrected outcome
  for (const doc of documents) {
    if (
      doc.decisionRoute === "MANUAL_REVIEW" &&
      (doc.outcome === "MANUAL_REVIEW_ACCEPTED" || doc.outcome === "MANUAL_REVIEW_CORRECTED")
    ) {
      add(doc, "MANUAL_REVIEW route with accepted/corrected — good training example");
    }
  }

  // UNREADABLE documents
  for (const doc of documents) {
    if (doc.outcome === "MANUAL_REVIEW_UNREADABLE") {
      add(doc, "Unreadable document — important failure case");
    }
  }

  // Documents with blocking rules that were later corrected
  for (const doc of documents) {
    if (
      doc.blockingRuleCodes.length > 0 &&
      (doc.outcome === "MANUAL_REVIEW_CORRECTED" || doc.outcome === "MANUAL_REVIEW_ACCEPTED")
    ) {
      add(
        doc,
        `Blocking rule(s) [${doc.blockingRuleCodes.slice(0, 2).join(", ")}] resolved via review`,
      );
    }
  }

  // HIGH confidence but bad outcome
  for (const doc of documents) {
    if (
      doc.confidenceScore !== null &&
      doc.confidenceScore !== undefined &&
      doc.confidenceScore >= 0.8 &&
      (doc.outcome === "FAILED" || doc.outcome === "MANUAL_REVIEW_REJECTED")
    ) {
      add(
        doc,
        `High confidence (${doc.confidenceScore.toFixed(2)}) but outcome ${doc.outcome}`,
      );
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function evaluatePdfDecisionShadow(
  input?: {
    limit?: number;
    fiscalYear?: number;
    orgNumber?: string;
  },
  deps?: {
    listRows?: (params: {
      limit: number;
      fiscalYear?: number;
      orgNumber?: string;
    }) => Promise<AnnualReportDecisionShadowRow[]>;
    readArtifact?: (storageKey: string) => Promise<Buffer | null>;
    listGoldSetItems?: (filingIds: string[]) => Promise<PdfDecisionGoldSetItemRecord[]>;
  },
): Promise<PdfDecisionShadowEvaluationResult> {
  const limit = input?.limit ?? 100;
  const queryInput = { limit, fiscalYear: input?.fiscalYear, orgNumber: input?.orgNumber };

  const listRows = deps?.listRows ?? listAnnualReportDecisionShadowRows;
  const readArtifact = deps?.readArtifact ?? null;
  const listGoldSetItems =
    deps?.listGoldSetItems ??
    (deps?.listRows ? async () => [] : listPdfDecisionGoldSetItemsByFilingIds);

  const rows = await listRows(queryInput);
  const goldSetItems = await listGoldSetItems(rows.map((row) => row.filingId));
  const goldSetByFilingId = new Map(
    goldSetItems.map((item) => [item.filingId, item]),
  );

  // Parse artifact payloads per storageKey
  const parsedDecisions = new Map<string, PdfDecisionArtifactWrapper>();
  if (readArtifact) {
    const allKeys = rows.flatMap((r) => r.pdfDecisionArtifacts.map((a) => a.storageKey));
    const uniqueKeys = [...new Set(allKeys)];
    await Promise.all(
      uniqueKeys.map(async (key) => {
        try {
          const buffer = await readArtifact(key);
          if (!buffer) return;
          const parsed = parseDecisionBuffer(buffer);
          if (parsed) parsedDecisions.set(key, parsed);
        } catch {
          // Malformed artifact — skip gracefully
        }
      }),
    );
  }

  const documents = rows.map((row) =>
    buildDocument(row, parsedDecisions, goldSetByFilingId.get(row.filingId) ?? null),
  );
  const metrics = computeMetrics(documents);

  return {
    version: "pdf-decision-shadow-evaluation-v1",
    generatedAt: new Date().toISOString(),
    input: queryInput,
    documents,
    metrics,
  };
}
