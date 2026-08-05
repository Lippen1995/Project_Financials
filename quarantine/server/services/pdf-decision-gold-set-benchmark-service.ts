import { PdfDecisionGoldSetStatus } from "@prisma/client";

import { LocalAnnualReportArtifactStorage } from "@/server/financials/artifact-storage";
import { listAnnualReportDecisionShadowRows } from "@/server/persistence/annual-report-decision-shadow-repository";
import {
  listPdfDecisionGoldSetItemsByFilingIds,
  listPdfDecisionGoldSetItemsForBenchmark,
  type PdfDecisionGoldSetItemRecord,
} from "@/server/persistence/pdf-decision-gold-set-repository";
import {
  evaluatePdfDecisionShadow,
  type PdfDecisionShadowDocument,
} from "@/server/services/annual-report-pdf-decision-shadow-evaluation";

export type PdfDecisionGoldSetBenchmarkOutcome =
  | "MATCH"
  | "ROUTE_MISMATCH"
  | "RISK_MISMATCH"
  | "CONFIDENCE_OUT_OF_RANGE"
  | "OUTCOME_MISMATCH"
  | "MANUAL_REVIEW_REASON_MISSING"
  | "REGRESSION_CANDIDATE"
  | "INSUFFICIENT_DATA";

export type PdfDecisionGoldSetBenchmarkItem = {
  goldSetItemId: string;
  filingId: string;
  extractionRunId?: string | null;
  orgNumber?: string | null;
  fiscalYear?: number | null;
  goldSetStatus: "APPROVED" | "CANDIDATE" | "EXCLUDED";
  goldSetReason: string;
  goldSetNote?: string | null;
  curatedOutcome?: string | null;
  curatedDecisionRoute?: string | null;
  curatedRiskLevel?: string | null;
  curatedConfidenceScore?: number | null;
  currentDecisionRoute?: string | null;
  currentRiskLevel?: string | null;
  currentConfidenceScore?: number | null;
  currentOutcome?: string | null;
  currentManualReviewReasons: string[];
  currentReasons: string[];
  benchmarkOutcome: PdfDecisionGoldSetBenchmarkOutcome;
  failures: string[];
  severity: "INFO" | "WARNING" | "ERROR";
};

export type PdfDecisionGoldSetBenchmarkMetrics = {
  totalItems: number;
  matchCount: number;
  mismatchCount: number;
  errorCount: number;
  routeMismatchCount: number;
  riskMismatchCount: number;
  outcomeMismatchCount: number;
  confidenceOutOfRangeCount: number;
  insufficientDataCount: number;
  matchRate: number;
  mismatchRate: number;
  mismatchesByReason: Record<string, number>;
  mismatchesByRoute: Record<string, number>;
  mismatchesByRisk: Record<string, number>;
};

export type PdfDecisionGoldSetBenchmarkResult = {
  version: "pdf-decision-gold-set-benchmark-v1";
  generatedAt: string;
  input: {
    limit: number;
    status: "APPROVED" | "CANDIDATE" | "ALL";
    fiscalYear?: number;
    orgNumber?: string;
  };
  metrics: PdfDecisionGoldSetBenchmarkMetrics;
  items: PdfDecisionGoldSetBenchmarkItem[];
};

const IMPORTANT_REASONS = new Set([
  "LOW_RISK_FAILED",
  "HIGH_RISK_SUCCEEDED",
  "MANUAL_CORRECTION",
  "UNREADABLE",
  "ROUTE_MISMATCH",
  "BALANCE_MISMATCH",
]);

function safeRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

function increment(record: Record<string, number>, key?: string | null) {
  const normalized = key || "UNKNOWN";
  record[normalized] = (record[normalized] ?? 0) + 1;
}

function chooseOutcome(failures: string[]): PdfDecisionGoldSetBenchmarkOutcome {
  if (failures.some((f) => f.startsWith("Missing current"))) return "INSUFFICIENT_DATA";
  if (failures.some((f) => f.startsWith("Route mismatch"))) return "ROUTE_MISMATCH";
  if (failures.some((f) => f.startsWith("Risk mismatch"))) return "RISK_MISMATCH";
  if (failures.some((f) => f.startsWith("Outcome mismatch"))) return "OUTCOME_MISMATCH";
  if (failures.some((f) => f.startsWith("Confidence"))) return "CONFIDENCE_OUT_OF_RANGE";
  if (failures.some((f) => f.startsWith("Missing manual"))) return "MANUAL_REVIEW_REASON_MISSING";
  if (failures.some((f) => f.startsWith("Regression"))) return "REGRESSION_CANDIDATE";
  return "MATCH";
}

function buildBenchmarkItem(
  goldSetItem: PdfDecisionGoldSetItemRecord,
  current: PdfDecisionShadowDocument | undefined,
  confidenceTolerance: number,
): PdfDecisionGoldSetBenchmarkItem {
  const failures: string[] = [];

  if (!current?.hasPdfDecision || !current.decisionRoute) {
    failures.push("Missing current PDF decision artifact.");
  }

  if (
    goldSetItem.decisionRoute &&
    current?.decisionRoute &&
    goldSetItem.decisionRoute !== current.decisionRoute
  ) {
    failures.push(
      `Route mismatch: curated ${goldSetItem.decisionRoute}, current ${current.decisionRoute}.`,
    );
  }

  if (
    goldSetItem.riskLevel &&
    current?.riskLevel &&
    goldSetItem.riskLevel !== current.riskLevel
  ) {
    failures.push(`Risk mismatch: curated ${goldSetItem.riskLevel}, current ${current.riskLevel}.`);
  }

  if (goldSetItem.outcome && current?.outcome && goldSetItem.outcome !== current.outcome) {
    failures.push(`Outcome mismatch: curated ${goldSetItem.outcome}, current ${current.outcome}.`);
  }

  if (
    goldSetItem.confidenceScore !== null &&
    current?.confidenceScore !== null &&
    current?.confidenceScore !== undefined &&
    Math.abs(goldSetItem.confidenceScore - current.confidenceScore) > confidenceTolerance
  ) {
    failures.push(
      `Confidence out of range: curated ${goldSetItem.confidenceScore.toFixed(2)}, current ${current.confidenceScore.toFixed(2)}.`,
    );
  }

  if (failures.length > 0 && IMPORTANT_REASONS.has(goldSetItem.reason)) {
    failures.push(`Regression candidate for important gold-set reason ${goldSetItem.reason}.`);
  }

  const benchmarkOutcome = chooseOutcome(failures);
  const isApproved = goldSetItem.status === PdfDecisionGoldSetStatus.APPROVED;
  const severity =
    goldSetItem.status === PdfDecisionGoldSetStatus.EXCLUDED || benchmarkOutcome === "MATCH"
      ? "INFO"
      : isApproved && benchmarkOutcome !== "CONFIDENCE_OUT_OF_RANGE"
        ? "ERROR"
        : "WARNING";

  return {
    goldSetItemId: goldSetItem.id,
    filingId: goldSetItem.filingId,
    extractionRunId: goldSetItem.extractionRunId,
    orgNumber: goldSetItem.orgNumber,
    fiscalYear: goldSetItem.fiscalYear,
    goldSetStatus: goldSetItem.status,
    goldSetReason: goldSetItem.reason,
    goldSetNote: goldSetItem.note,
    curatedOutcome: goldSetItem.outcome,
    curatedDecisionRoute: goldSetItem.decisionRoute,
    curatedRiskLevel: goldSetItem.riskLevel,
    curatedConfidenceScore: goldSetItem.confidenceScore,
    currentDecisionRoute: current?.decisionRoute ?? null,
    currentRiskLevel: current?.riskLevel ?? null,
    currentConfidenceScore: current?.confidenceScore ?? null,
    currentOutcome: current?.outcome ?? null,
    currentManualReviewReasons: current?.manualReviewReasons ?? [],
    currentReasons: current?.reasons ?? [],
    benchmarkOutcome,
    failures,
    severity,
  };
}

function computeMetrics(items: PdfDecisionGoldSetBenchmarkItem[]): PdfDecisionGoldSetBenchmarkMetrics {
  const metrics: PdfDecisionGoldSetBenchmarkMetrics = {
    totalItems: items.length,
    matchCount: 0,
    mismatchCount: 0,
    errorCount: 0,
    routeMismatchCount: 0,
    riskMismatchCount: 0,
    outcomeMismatchCount: 0,
    confidenceOutOfRangeCount: 0,
    insufficientDataCount: 0,
    matchRate: 0,
    mismatchRate: 0,
    mismatchesByReason: {},
    mismatchesByRoute: {},
    mismatchesByRisk: {},
  };

  for (const item of items) {
    if (item.benchmarkOutcome === "MATCH") {
      metrics.matchCount += 1;
      continue;
    }
    metrics.mismatchCount += 1;
    if (item.severity === "ERROR") metrics.errorCount += 1;
    if (item.benchmarkOutcome === "ROUTE_MISMATCH") metrics.routeMismatchCount += 1;
    if (item.benchmarkOutcome === "RISK_MISMATCH") metrics.riskMismatchCount += 1;
    if (item.benchmarkOutcome === "OUTCOME_MISMATCH") metrics.outcomeMismatchCount += 1;
    if (item.benchmarkOutcome === "CONFIDENCE_OUT_OF_RANGE") metrics.confidenceOutOfRangeCount += 1;
    if (item.benchmarkOutcome === "INSUFFICIENT_DATA") metrics.insufficientDataCount += 1;
    increment(metrics.mismatchesByReason, item.goldSetReason);
    increment(metrics.mismatchesByRoute, item.curatedDecisionRoute ?? item.currentDecisionRoute);
    increment(metrics.mismatchesByRisk, item.curatedRiskLevel ?? item.currentRiskLevel);
  }

  metrics.matchRate = safeRate(metrics.matchCount, metrics.totalItems);
  metrics.mismatchRate = safeRate(metrics.mismatchCount, metrics.totalItems);
  return metrics;
}

export async function runPdfDecisionGoldSetBenchmark(
  input?: {
    limit?: number;
    status?: "APPROVED" | "CANDIDATE" | "ALL";
    fiscalYear?: number;
    orgNumber?: string;
    confidenceTolerance?: number;
  },
  deps?: {
    listGoldSetItems?: (params: {
      status?: PdfDecisionGoldSetStatus | "ALL";
      limit?: number;
      fiscalYear?: number;
      orgNumber?: string;
    }) => Promise<PdfDecisionGoldSetItemRecord[]>;
    evaluateShadow?: (params: {
      limit: number;
      fiscalYear?: number;
      orgNumber?: string;
      filingIds?: string[];
    }) => Promise<{ documents: PdfDecisionShadowDocument[] }>;
  },
): Promise<PdfDecisionGoldSetBenchmarkResult> {
  const limit = input?.limit ?? 100;
  const status = input?.status ?? "APPROVED";
  const queryInput = {
    limit,
    status,
    fiscalYear: input?.fiscalYear,
    orgNumber: input?.orgNumber,
  };

  const listGoldSetItems = deps?.listGoldSetItems ?? listPdfDecisionGoldSetItemsForBenchmark;
  const goldSetItems = await listGoldSetItems({
    status:
      status === "ALL"
        ? "ALL"
        : status === "APPROVED"
          ? PdfDecisionGoldSetStatus.APPROVED
          : PdfDecisionGoldSetStatus.CANDIDATE,
    limit,
    fiscalYear: input?.fiscalYear,
    orgNumber: input?.orgNumber,
  });

  const evaluateShadow =
    deps?.evaluateShadow ??
    (async (params: {
      limit: number;
      fiscalYear?: number;
      orgNumber?: string;
      filingIds?: string[];
    }) => {
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
    limit: Math.max(limit, goldSetItems.length),
    fiscalYear: input?.fiscalYear,
    orgNumber: input?.orgNumber,
    filingIds: goldSetItems.map((item) => item.filingId),
  });
  const documentsByFilingId = new Map(shadow.documents.map((doc) => [doc.filingId, doc]));
  const confidenceTolerance = input?.confidenceTolerance ?? 0.25;
  const items = goldSetItems.map((item) =>
    buildBenchmarkItem(item, documentsByFilingId.get(item.filingId), confidenceTolerance),
  );

  return {
    version: "pdf-decision-gold-set-benchmark-v1",
    generatedAt: new Date().toISOString(),
    input: queryInput,
    metrics: computeMetrics(items),
    items,
  };
}
