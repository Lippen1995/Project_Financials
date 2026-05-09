import {
  PdfModelArtifactKind,
  type PdfModelArtifactSnapshot,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { listPersistedPdfModelArtifactSnapshots } from "@/server/services/pdf-model-artifact-snapshot-service";
import type {
  UnifiedExtractionConfidenceGateCheckCode,
  UnifiedExtractionConfidenceGateConfig,
  UnifiedExtractionConfidenceGateReport,
  UnifiedExtractionGateCheckResult,
  UnifiedExtractionGateOverallVerdict,
  UnifiedExtractionGateVerdict,
} from "@/server/services/annual-report-unified-extraction-confidence-gate-service";
import {
  DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG,
} from "@/server/services/annual-report-unified-extraction-confidence-gate-service";
import {
  UnifiedConfidenceReviewFeedbackActionValues,
  type UnifiedConfidenceReviewFeedbackRecord,
} from "@/server/services/annual-report-unified-confidence-review-feedback-service";

type ReviewOutcome = "ACCEPTED" | "REJECTED" | "NEEDS_REVIEW" | "UNREVIEWED";
type CalibrationConfidence = "LOW" | "MEDIUM" | "HIGH";

type FeedbackRow = {
  id: string;
  filingId: string;
  orgNumber: string | null;
  fiscalYear: number | null;
  reviewerUserId: string;
  confidenceGateArtifactId: string | null;
  sourceArtifactIds: unknown;
  action: string;
  targetType: string;
  targetRef: unknown;
  proposedValue: unknown;
  acceptedValue: unknown;
  reason: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type UnifiedConfidenceFeedbackReader = {
  findMany: (args?: {
    where?: {
      filingId?: { in?: string[] };
      orgNumber?: { in?: string[] };
      fiscalYear?: { gte?: number; lte?: number };
    };
  }) => Promise<FeedbackRow[]>;
};

type CalibrationCase = {
  filingId: string;
  orgNumber: string | null;
  fiscalYear: number | null;
  verdict: UnifiedExtractionGateOverallVerdict;
  checks: UnifiedExtractionGateCheckResult[];
  reviewOutcome: ReviewOutcome;
  correctionCount: number;
  gateArtifactId: string;
  generatedAt: string;
};

export type UnifiedConfidenceThresholdCalibrationInput = {
  fiscalYearFrom?: number;
  fiscalYearTo?: number;
  orgNumbers?: string[];
  verdicts?: UnifiedExtractionGateOverallVerdict[];
  minReviewedCases?: number;
  includeUnreviewed?: boolean;
  limit?: number;
  generatedBy?: string | null;
};

export type UnifiedConfidenceThresholdAdjustmentRecommendation =
  | "RELAX"
  | "TIGHTEN"
  | "KEEP"
  | "NEEDS_MORE_DATA";

export type UnifiedConfidenceThresholdCalibrationCheckPerformance = {
  checkCode: UnifiedExtractionConfidenceGateCheckCode;
  originatingVerdict: UnifiedExtractionGateVerdict;
  totalCases: number;
  reviewedCases: number;
  acceptedCount: number;
  rejectedCount: number;
  needsReviewCount: number;
  correctedCount: number;
  acceptanceRate: number | null;
  rejectionRate: number | null;
  correctionRate: number | null;
  interventionRate: number | null;
  recommendation: UnifiedConfidenceThresholdAdjustmentRecommendation;
  confidence: CalibrationConfidence;
  rationale: string;
};

export type UnifiedConfidenceThresholdCalibrationReport = {
  version: "unified-confidence-threshold-calibration-v1";
  generatedAt: string;
  input: {
    fiscalYearFrom: number | null;
    fiscalYearTo: number | null;
    orgNumbers: string[];
    verdicts: UnifiedExtractionGateOverallVerdict[];
    minReviewedCases: number;
    includeUnreviewed: boolean;
    limit: number | null;
    generatedBy: string | null;
  };
  sampleSummary: {
    totalGateArtifacts: number;
    includedCases: number;
    reviewedCases: number;
    unreviewedCases: number;
    acceptedCases: number;
    rejectedCases: number;
    needsReviewCases: number;
    correctedCases: number;
  };
  verdictPerformance: Array<{
    verdict: UnifiedExtractionGateOverallVerdict;
    totalCases: number;
    reviewedCases: number;
    acceptedCount: number;
    rejectedCount: number;
    needsReviewCount: number;
    correctedCount: number;
    acceptanceRate: number | null;
    rejectionRate: number | null;
    correctionRate: number | null;
    interventionRate: number | null;
  }>;
  checkPerformance: UnifiedConfidenceThresholdCalibrationCheckPerformance[];
  proposedThresholdAdjustments: Array<{
    checkCode: UnifiedExtractionConfidenceGateCheckCode;
    recommendation: UnifiedConfidenceThresholdAdjustmentRecommendation;
    configFields: Array<keyof UnifiedExtractionConfidenceGateConfig>;
    confidence: CalibrationConfidence;
    sampleSize: number;
    rationale: string;
  }>;
  risks: Array<{
    checkCode: UnifiedExtractionConfidenceGateCheckCode | "OVERALL";
    severity: "LOW" | "MEDIUM" | "HIGH";
    message: string;
  }>;
  safety: {
    canUseForProductionRouting: false;
    productionRoutingChanged: false;
    productionFactsMutated: false;
    publishAffected: false;
  };
};

export type UnifiedConfidenceCalibrationServiceDeps = {
  listGateArtifacts?: typeof listPersistedPdfModelArtifactSnapshots;
  listFeedback?: UnifiedConfidenceFeedbackReader["findMany"];
};

type ReviewFeedbackPrismaLike = {
  unifiedExtractionReviewFeedback: UnifiedConfidenceFeedbackReader;
};

const reviewFeedbackPrisma = prisma as unknown as ReviewFeedbackPrismaLike;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseGateArtifact(
  artifact: PdfModelArtifactSnapshot,
): UnifiedExtractionConfidenceGateReport | null {
  const payload = asRecord(artifact.payload);
  if (!payload || payload.version !== "unified-extraction-confidence-gate-v1") {
    return null;
  }

  const overallVerdict = payload.overallVerdict;
  if (
    overallVerdict !== "PASS" &&
    overallVerdict !== "WARN" &&
    overallVerdict !== "FAIL" &&
    overallVerdict !== "INSUFFICIENT_DATA"
  ) {
    return null;
  }

  if (!Array.isArray(payload.checks)) {
    return null;
  }

  return artifact.payload as UnifiedExtractionConfidenceGateReport;
}

function artifactFilingId(artifact: PdfModelArtifactSnapshot): string | null {
  const summary = asRecord(artifact.summary);
  const payload = asRecord(artifact.payload);
  const meta = asRecord(payload?.meta);
  return asString(meta?.filingId) ?? asString(summary?.filingId);
}

function latestArtifactsByFiling(
  artifacts: PdfModelArtifactSnapshot[],
): Map<string, PdfModelArtifactSnapshot> {
  const latest = new Map<string, PdfModelArtifactSnapshot>();
  const sorted = [...artifacts].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );

  for (const artifact of sorted) {
    const filingId = artifactFilingId(artifact);
    if (!filingId || latest.has(filingId)) {
      continue;
    }
    latest.set(filingId, artifact);
  }

  return latest;
}

function mapFeedbackRecord(row: FeedbackRow): UnifiedConfidenceReviewFeedbackRecord {
  return {
    id: row.id,
    filingId: row.filingId,
    orgNumber: row.orgNumber,
    fiscalYear: row.fiscalYear,
    reviewerUserId: row.reviewerUserId,
    confidenceGateArtifactId: row.confidenceGateArtifactId,
    sourceArtifactIds: asRecord(row.sourceArtifactIds),
    action: row.action as UnifiedConfidenceReviewFeedbackRecord["action"],
    targetType: row.targetType as UnifiedConfidenceReviewFeedbackRecord["targetType"],
    targetRef: asRecord(row.targetRef),
    proposedValue: asRecord(row.proposedValue),
    acceptedValue: asRecord(row.acceptedValue),
    reason: row.reason,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function reviewOutcomeForFeedback(records: UnifiedConfidenceReviewFeedbackRecord[]) {
  const sorted = [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const latestDecision =
    sorted.find((record) =>
      record.action === UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION ||
      record.action === UnifiedConfidenceReviewFeedbackActionValues.REJECT_MACHINE_EXTRACTION ||
      record.action === UnifiedConfidenceReviewFeedbackActionValues.MARK_NEEDS_REVIEW,
    ) ?? null;

  const correctionCount = sorted.filter((record) =>
    record.action === UnifiedConfidenceReviewFeedbackActionValues.CORRECT_LINE_ITEM ||
    record.action === UnifiedConfidenceReviewFeedbackActionValues.CORRECT_SECTION_CLASSIFICATION ||
    record.action === UnifiedConfidenceReviewFeedbackActionValues.CORRECT_UNIT_SCALE ||
    record.action === UnifiedConfidenceReviewFeedbackActionValues.CORRECT_CANONICAL_KEY ||
    record.action === UnifiedConfidenceReviewFeedbackActionValues.CORRECT_PROVENANCE,
  ).length;

  let outcome: ReviewOutcome = "UNREVIEWED";
  if (latestDecision?.action === UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION) {
    outcome = "ACCEPTED";
  } else if (latestDecision?.action === UnifiedConfidenceReviewFeedbackActionValues.REJECT_MACHINE_EXTRACTION) {
    outcome = "REJECTED";
  } else if (latestDecision?.action === UnifiedConfidenceReviewFeedbackActionValues.MARK_NEEDS_REVIEW) {
    outcome = "NEEDS_REVIEW";
  } else if (correctionCount > 0) {
    outcome = "ACCEPTED";
  }

  return { outcome, correctionCount };
}

function confidenceLevel(reviewedCases: number): CalibrationConfidence {
  if (reviewedCases >= 50) return "HIGH";
  if (reviewedCases >= 20) return "MEDIUM";
  return "LOW";
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

function buildCalibrationCases(
  artifacts: PdfModelArtifactSnapshot[],
  feedbackByFiling: Map<string, UnifiedConfidenceReviewFeedbackRecord[]>,
): CalibrationCase[] {
  const latestByFiling = latestArtifactsByFiling(artifacts);
  const cases: CalibrationCase[] = [];

  for (const [filingId, artifact] of latestByFiling.entries()) {
    const report = parseGateArtifact(artifact);
    if (!report) {
      continue;
    }

    const feedback = feedbackByFiling.get(filingId) ?? [];
    const { outcome, correctionCount } = reviewOutcomeForFeedback(feedback);
    cases.push({
      filingId,
      orgNumber: report.meta.orgNumber,
      fiscalYear: report.meta.fiscalYear,
      verdict: report.overallVerdict,
      checks: report.checks,
      reviewOutcome: outcome,
      correctionCount,
      gateArtifactId: artifact.id,
      generatedAt: report.generatedAt,
    });
  }

  return cases;
}

export function summarizeGateCheckPerformance(
  cases: CalibrationCase[],
  input: UnifiedConfidenceThresholdCalibrationInput = {},
): UnifiedConfidenceThresholdCalibrationCheckPerformance[] {
  const buckets = new Map<string, CalibrationCase[]>();
  const minReviewedCases = input.minReviewedCases ?? 20;

  for (const calibrationCase of cases) {
    for (const check of calibrationCase.checks) {
      const key = `${check.checkCode}:${check.verdict}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push({
        ...calibrationCase,
        checks: [check],
      });
      buckets.set(key, bucket);
    }
  }

  return Array.from(buckets.entries())
    .map(([key, bucket]) => {
      const [checkCode, originatingVerdict] = key.split(":") as [
        UnifiedExtractionConfidenceGateCheckCode,
        UnifiedExtractionGateVerdict,
      ];
      const reviewed = bucket.filter((entry) => entry.reviewOutcome !== "UNREVIEWED");
      const acceptedCount = reviewed.filter((entry) => entry.reviewOutcome === "ACCEPTED").length;
      const rejectedCount = reviewed.filter((entry) => entry.reviewOutcome === "REJECTED").length;
      const needsReviewCount = reviewed.filter((entry) => entry.reviewOutcome === "NEEDS_REVIEW").length;
      const correctedCount = reviewed.filter((entry) => entry.correctionCount > 0).length;
      const acceptanceRate = ratio(acceptedCount, reviewed.length);
      const rejectionRate = ratio(rejectedCount, reviewed.length);
      const correctionRate = ratio(correctedCount, reviewed.length);
      const interventionRate = ratio(rejectedCount + correctedCount, reviewed.length);

      let recommendation: UnifiedConfidenceThresholdAdjustmentRecommendation = "KEEP";
      let rationale = "Reviewed outcomes do not justify a threshold change.";

      if (originatingVerdict === "INSUFFICIENT_DATA") {
        recommendation = "NEEDS_MORE_DATA";
        rationale = "Insufficient-data checks stay conservative until more reviewed evidence exists.";
      } else if (reviewed.length < minReviewedCases) {
        recommendation = "NEEDS_MORE_DATA";
        rationale = `Only ${reviewed.length} reviewed cases are available; need at least ${minReviewedCases}.`;
      } else if (originatingVerdict === "FAIL" && (acceptanceRate ?? 0) >= 0.75) {
        recommendation = "RELAX";
        rationale = `FAIL cases are still accepted ${((acceptanceRate ?? 0) * 100).toFixed(0)}% of the time.`;
      } else if (originatingVerdict === "WARN" && (interventionRate ?? 0) >= 0.5) {
        recommendation = "TIGHTEN";
        rationale = `WARN cases are rejected or corrected ${((interventionRate ?? 0) * 100).toFixed(0)}% of the time.`;
      } else if (originatingVerdict === "PASS" && (interventionRate ?? 0) >= 0.3) {
        recommendation = "TIGHTEN";
        rationale = `PASS cases still see elevated reviewer intervention (${((interventionRate ?? 0) * 100).toFixed(0)}%).`;
      }

      return {
        checkCode,
        originatingVerdict,
        totalCases: bucket.length,
        reviewedCases: reviewed.length,
        acceptedCount,
        rejectedCount,
        needsReviewCount,
        correctedCount,
        acceptanceRate,
        rejectionRate,
        correctionRate,
        interventionRate,
        recommendation,
        confidence: confidenceLevel(reviewed.length),
        rationale,
      };
    })
    .sort(
      (left, right) =>
        right.reviewedCases - left.reviewedCases ||
        left.checkCode.localeCompare(right.checkCode) ||
        left.originatingVerdict.localeCompare(right.originatingVerdict),
    );
}

function configFieldsForCheck(
  checkCode: UnifiedExtractionConfidenceGateCheckCode,
): Array<keyof UnifiedExtractionConfidenceGateConfig> {
  switch (checkCode) {
    case "CANONICAL_KEY_COVERAGE":
      return ["minCanonicalKeyCoverageForPass", "minCanonicalKeyCoverageForFail"];
    case "COMPARISON_MATCH_RATE":
      return ["minComparisonMatchRateForPass", "minComparisonMatchRateForFail"];
    case "COMPARISON_NO_MAJOR_MISMATCHES":
      return ["majorMismatchDeviationThreshold", "maxMajorMismatchCountForFail"];
    case "BOARD_REPORT_FOUND":
    case "AUDITOR_REPORT_FOUND":
      return ["narrativeAbsenceIsFail"];
    default:
      return [];
  }
}

export function proposeUnifiedConfidenceGateConfigAdjustments(
  performance: UnifiedConfidenceThresholdCalibrationCheckPerformance[],
): UnifiedConfidenceThresholdCalibrationReport["proposedThresholdAdjustments"] {
  return performance
    .filter((item) => item.recommendation !== "KEEP")
    .map((item) => ({
      checkCode: item.checkCode,
      recommendation: item.recommendation,
      configFields: configFieldsForCheck(item.checkCode),
      confidence: item.confidence,
      sampleSize: item.reviewedCases,
      rationale: item.rationale,
    }))
    .sort(
      (left, right) =>
        right.sampleSize - left.sampleSize || left.checkCode.localeCompare(right.checkCode),
    );
}

function buildVerdictPerformance(
  cases: CalibrationCase[],
): UnifiedConfidenceThresholdCalibrationReport["verdictPerformance"] {
  const verdicts: UnifiedExtractionGateOverallVerdict[] = ["PASS", "WARN", "FAIL", "INSUFFICIENT_DATA"];

  return verdicts.map((verdict) => {
    const bucket = cases.filter((entry) => entry.verdict === verdict);
    const reviewed = bucket.filter((entry) => entry.reviewOutcome !== "UNREVIEWED");
    const acceptedCount = reviewed.filter((entry) => entry.reviewOutcome === "ACCEPTED").length;
    const rejectedCount = reviewed.filter((entry) => entry.reviewOutcome === "REJECTED").length;
    const needsReviewCount = reviewed.filter((entry) => entry.reviewOutcome === "NEEDS_REVIEW").length;
    const correctedCount = reviewed.filter((entry) => entry.correctionCount > 0).length;
    return {
      verdict,
      totalCases: bucket.length,
      reviewedCases: reviewed.length,
      acceptedCount,
      rejectedCount,
      needsReviewCount,
      correctedCount,
      acceptanceRate: ratio(acceptedCount, reviewed.length),
      rejectionRate: ratio(rejectedCount, reviewed.length),
      correctionRate: ratio(correctedCount, reviewed.length),
      interventionRate: ratio(rejectedCount + correctedCount, reviewed.length),
    };
  });
}

function buildRisks(
  verdictPerformance: UnifiedConfidenceThresholdCalibrationReport["verdictPerformance"],
  checkPerformance: UnifiedConfidenceThresholdCalibrationCheckPerformance[],
): UnifiedConfidenceThresholdCalibrationReport["risks"] {
  const risks: UnifiedConfidenceThresholdCalibrationReport["risks"] = [];
  const passVerdict = verdictPerformance.find((entry) => entry.verdict === "PASS");

  if (passVerdict && (passVerdict.interventionRate ?? 0) >= 0.3) {
    risks.push({
      checkCode: "OVERALL",
      severity: (passVerdict.interventionRate ?? 0) >= 0.5 ? "HIGH" : "MEDIUM",
      message: `PASS verdicts still trigger rejection or correction ${((passVerdict.interventionRate ?? 0) * 100).toFixed(0)}% of the time.`,
    });
  }

  for (const item of checkPerformance) {
    if (item.originatingVerdict === "PASS" && (item.interventionRate ?? 0) >= 0.3) {
      risks.push({
        checkCode: item.checkCode,
        severity: (item.interventionRate ?? 0) >= 0.5 ? "HIGH" : "MEDIUM",
        message: `PASS ${item.checkCode} still sees reviewer intervention ${((item.interventionRate ?? 0) * 100).toFixed(0)}% of the time.`,
      });
    }

    if (item.originatingVerdict === "INSUFFICIENT_DATA" && item.reviewedCases >= 5) {
      risks.push({
        checkCode: item.checkCode,
        severity: "LOW",
        message: `${item.checkCode} remains insufficient-data heavy; keep it conservative.`,
      });
    }
  }

  return risks;
}

export async function buildUnifiedConfidenceThresholdCalibrationReport(
  input: UnifiedConfidenceThresholdCalibrationInput = {},
  deps: UnifiedConfidenceCalibrationServiceDeps = {},
): Promise<UnifiedConfidenceThresholdCalibrationReport> {
  const listGateArtifacts = deps.listGateArtifacts ?? listPersistedPdfModelArtifactSnapshots;
  const listFeedback =
    deps.listFeedback ??
    reviewFeedbackPrisma.unifiedExtractionReviewFeedback.findMany.bind(
      reviewFeedbackPrisma.unifiedExtractionReviewFeedback,
    );

  const minReviewedCases = input.minReviewedCases ?? 20;
  const includeUnreviewed = input.includeUnreviewed ?? false;
  const verdicts = input.verdicts ?? ["PASS", "WARN", "FAIL", "INSUFFICIENT_DATA"];
  const fiscalYears =
    input.fiscalYearFrom !== undefined && input.fiscalYearTo !== undefined
      ? Array.from(
          { length: input.fiscalYearTo - input.fiscalYearFrom + 1 },
          (_, index) => input.fiscalYearFrom! + index,
        )
      : undefined;

  const gateArtifacts = await listGateArtifacts({
    kind: PdfModelArtifactKind.UNIFIED_EXTRACTION_CONFIDENCE_GATE,
    fiscalYears,
    orgNumbers: input.orgNumbers,
    limit: input.limit ?? 500,
  });

  const filingIds = Array.from(
    new Set(
      gateArtifacts
        .map((artifact) => artifactFilingId(artifact))
        .filter((value): value is string => value !== null),
    ),
  );

  const feedbackRows = filingIds.length
    ? await listFeedback({
        where: {
          filingId: { in: filingIds },
          ...(input.orgNumbers && input.orgNumbers.length > 0
            ? { orgNumber: { in: input.orgNumbers } }
            : {}),
          ...(input.fiscalYearFrom !== undefined || input.fiscalYearTo !== undefined
            ? {
                fiscalYear: {
                  ...(input.fiscalYearFrom !== undefined ? { gte: input.fiscalYearFrom } : {}),
                  ...(input.fiscalYearTo !== undefined ? { lte: input.fiscalYearTo } : {}),
                },
              }
            : {}),
        },
      })
    : [];

  const feedbackByFiling = new Map<string, UnifiedConfidenceReviewFeedbackRecord[]>();
  for (const row of feedbackRows.map(mapFeedbackRecord)) {
    const bucket = feedbackByFiling.get(row.filingId) ?? [];
    bucket.push(row);
    feedbackByFiling.set(row.filingId, bucket);
  }

  let cases = buildCalibrationCases(gateArtifacts, feedbackByFiling);
  cases = cases.filter((item) => verdicts.includes(item.verdict));

  if (!includeUnreviewed) {
    cases = cases.filter((item) => item.reviewOutcome !== "UNREVIEWED");
  }

  if (input.limit !== undefined && input.limit !== null) {
    cases = cases.slice(0, input.limit);
  }

  const reviewedCases = cases.filter((item) => item.reviewOutcome !== "UNREVIEWED");
  const verdictPerformance = buildVerdictPerformance(cases);
  const checkPerformance = summarizeGateCheckPerformance(cases, { ...input, minReviewedCases });
  const proposedThresholdAdjustments =
    proposeUnifiedConfidenceGateConfigAdjustments(checkPerformance);
  const risks = buildRisks(verdictPerformance, checkPerformance);

  return {
    version: "unified-confidence-threshold-calibration-v1",
    generatedAt: new Date().toISOString(),
    input: {
      fiscalYearFrom: input.fiscalYearFrom ?? null,
      fiscalYearTo: input.fiscalYearTo ?? null,
      orgNumbers: input.orgNumbers ?? [],
      verdicts,
      minReviewedCases,
      includeUnreviewed,
      limit: input.limit ?? null,
      generatedBy: input.generatedBy ?? null,
    },
    sampleSummary: {
      totalGateArtifacts: gateArtifacts.length,
      includedCases: cases.length,
      reviewedCases: reviewedCases.length,
      unreviewedCases: cases.filter((item) => item.reviewOutcome === "UNREVIEWED").length,
      acceptedCases: reviewedCases.filter((item) => item.reviewOutcome === "ACCEPTED").length,
      rejectedCases: reviewedCases.filter((item) => item.reviewOutcome === "REJECTED").length,
      needsReviewCases: reviewedCases.filter((item) => item.reviewOutcome === "NEEDS_REVIEW").length,
      correctedCases: reviewedCases.filter((item) => item.correctionCount > 0).length,
    },
    verdictPerformance,
    checkPerformance,
    proposedThresholdAdjustments,
    risks,
    safety: {
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    },
  };
}

export const CURRENT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG =
  DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG;
