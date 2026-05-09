import {
  PdfModelArtifactKind,
  PdfModelArtifactStatus,
  type PdfModelArtifactSnapshot,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  buildUnifiedConfidenceThresholdCalibrationReport,
  proposeUnifiedConfidenceGateConfigAdjustments,
  summarizeGateCheckPerformance,
} from "@/server/services/annual-report-unified-confidence-calibration-service";
import type {
  UnifiedExtractionConfidenceGateReport,
  UnifiedExtractionGateCheckResult,
} from "@/server/services/annual-report-unified-extraction-confidence-gate-service";
import {
  UnifiedConfidenceReviewFeedbackActionValues,
} from "@/server/services/annual-report-unified-confidence-review-feedback-service";

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

function makeCheck(
  check: UnifiedExtractionGateCheckResult,
): UnifiedExtractionGateCheckResult {
  return check;
}

function makeGateReport(
  overrides: Partial<UnifiedExtractionConfidenceGateReport> = {},
): UnifiedExtractionConfidenceGateReport {
  const checks: UnifiedExtractionGateCheckResult[] = [
    makeCheck({
      checkCode: "FINANCIAL_EXTRACTION_PRESENT",
      verdict: "PASS",
      message: "Financial extraction present.",
      value: 10,
      threshold: null,
    }),
    makeCheck({
      checkCode: "UNIT_SCALE_RESOLVED",
      verdict: "PASS",
      message: "Unit scales resolved.",
      value: 0,
      threshold: null,
    }),
    makeCheck({
      checkCode: "INCOME_STATEMENT_COVERAGE",
      verdict: "PASS",
      message: "Income statement covered.",
      value: 1,
      threshold: null,
    }),
    makeCheck({
      checkCode: "BALANCE_SHEET_COVERAGE",
      verdict: "PASS",
      message: "Balance sheet covered.",
      value: 1,
      threshold: null,
    }),
    makeCheck({
      checkCode: "REVENUE_FOUND",
      verdict: "PASS",
      message: "Revenue found.",
      value: 1,
      threshold: null,
    }),
    makeCheck({
      checkCode: "NET_INCOME_FOUND",
      verdict: "PASS",
      message: "Net income found.",
      value: 1,
      threshold: null,
    }),
    makeCheck({
      checkCode: "TOTAL_ASSETS_FOUND",
      verdict: "PASS",
      message: "Total assets found.",
      value: 1,
      threshold: null,
    }),
    makeCheck({
      checkCode: "CANONICAL_KEY_COVERAGE",
      verdict: "PASS",
      message: "Canonical key coverage healthy.",
      value: 0.8,
      threshold: 0.5,
    }),
    makeCheck({
      checkCode: "NARRATIVE_EXTRACTION_PRESENT",
      verdict: "PASS",
      message: "Narrative extraction present.",
      value: 3,
      threshold: null,
    }),
    makeCheck({
      checkCode: "BOARD_REPORT_FOUND",
      verdict: "PASS",
      message: "Board report found.",
      value: 1,
      threshold: null,
    }),
    makeCheck({
      checkCode: "AUDITOR_REPORT_FOUND",
      verdict: "PASS",
      message: "Auditor report found.",
      value: 1,
      threshold: null,
    }),
    makeCheck({
      checkCode: "COMPARISON_MATCH_RATE",
      verdict: "PASS",
      message: "Match rate healthy.",
      value: 0.9,
      threshold: 0.8,
    }),
    makeCheck({
      checkCode: "COMPARISON_NO_MAJOR_MISMATCHES",
      verdict: "PASS",
      message: "No major mismatches.",
      value: 0,
      threshold: 0.5,
    }),
    makeCheck({
      checkCode: "SAFETY_FLAGS_CLEAN",
      verdict: "PASS",
      message: "Safety flags are clean.",
      value: null,
      threshold: null,
    }),
  ];

  return {
    version: "unified-extraction-confidence-gate-v1",
    generatedAt: "2026-05-09T12:00:00.000Z",
    meta: {
      filingId: "filing-1",
      orgNumber: "123456789",
      fiscalYear: 2024,
    },
    safety: {
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    },
    config: {
      minCanonicalKeyCoverageForPass: 0.5,
      minCanonicalKeyCoverageForFail: 0.2,
      minComparisonMatchRateForPass: 0.8,
      minComparisonMatchRateForFail: 0.5,
      majorMismatchDeviationThreshold: 0.5,
      maxMajorMismatchCountForFail: 0,
      narrativeAbsenceIsFail: false,
    },
    overallVerdict: "PASS",
    passCount: 14,
    warnCount: 0,
    failCount: 0,
    insufficientDataCount: 0,
    blockingChecks: [],
    warningChecks: [],
    checks,
    ...overrides,
  };
}

function makeArtifact(
  filingId: string,
  report: UnifiedExtractionConfidenceGateReport,
  overrides: Partial<PdfModelArtifactSnapshot> = {},
): PdfModelArtifactSnapshot {
  return {
    id: `artifact-${filingId}`,
    kind: PdfModelArtifactKind.UNIFIED_EXTRACTION_CONFIDENCE_GATE,
    status: PdfModelArtifactStatus.CREATED,
    modelId: null,
    modelVersion: null,
    modelTarget: null,
    featureSchemaVersion: null,
    fiscalYear: report.meta.fiscalYear,
    orgNumber: report.meta.orgNumber,
    split: null,
    summary: {
      filingId,
      orgNumber: report.meta.orgNumber,
      fiscalYear: report.meta.fiscalYear,
      overallVerdict: report.overallVerdict,
      passCount: report.passCount,
      warnCount: report.warnCount,
      failCount: report.failCount,
      insufficientDataCount: report.insufficientDataCount,
    },
    payload: report,
    sourceCommand: "test-command",
    sourceCommitSha: "sha",
    createdByUserId: null,
    createdAt: new Date("2026-05-09T12:00:00.000Z"),
    updatedAt: new Date("2026-05-09T12:00:00.000Z"),
    ...overrides,
  };
}

function makeFeedback(
  filingId: string,
  action: string,
  overrides: Partial<FeedbackRow> = {},
): FeedbackRow {
  return {
    id: `${filingId}-${action}-${Math.random()}`,
    filingId,
    orgNumber: "123456789",
    fiscalYear: 2024,
    reviewerUserId: "reviewer-1",
    confidenceGateArtifactId: `artifact-${filingId}`,
    sourceArtifactIds: null,
    action,
    targetType: "FULL_EXTRACTION",
    targetRef: null,
    proposedValue: null,
    acceptedValue: null,
    reason: null,
    notes: null,
    createdAt: new Date("2026-05-09T12:00:00.000Z"),
    updatedAt: new Date("2026-05-09T12:00:00.000Z"),
    ...overrides,
  };
}

describe("annual-report-unified-confidence-calibration-service", () => {
  it("aggregates verdict performance", async () => {
    const failCheck = makeCheck({
      checkCode: "COMPARISON_MATCH_RATE",
      verdict: "FAIL",
      message: "Low match rate.",
      value: 0.3,
      threshold: 0.5,
    });
    const warnCheck = makeCheck({
      checkCode: "BOARD_REPORT_FOUND",
      verdict: "WARN",
      message: "Board report missing.",
      value: null,
      threshold: null,
    });

    const artifacts = [
      makeArtifact("filing-pass", makeGateReport({
        meta: { filingId: "filing-pass", orgNumber: "123456789", fiscalYear: 2024 },
      })),
      makeArtifact("filing-fail", makeGateReport({
        meta: { filingId: "filing-fail", orgNumber: "123456789", fiscalYear: 2024 },
        overallVerdict: "FAIL",
        passCount: 12,
        failCount: 1,
        checks: [failCheck, ...makeGateReport().checks.filter((check) => check.checkCode !== "COMPARISON_MATCH_RATE")],
        blockingChecks: [failCheck],
      })),
    ];

    const feedback = [
      makeFeedback("filing-pass", UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION),
      makeFeedback("filing-fail", UnifiedConfidenceReviewFeedbackActionValues.REJECT_MACHINE_EXTRACTION, {
        reason: "Too many mismatches.",
      }),
    ];

    const report = await buildUnifiedConfidenceThresholdCalibrationReport(
      { minReviewedCases: 1 },
      {
        listGateArtifacts: vi.fn(async () => artifacts),
        listFeedback: vi.fn(async () => feedback),
      },
    );

    expect(report.sampleSummary.reviewedCases).toBe(2);
    expect(report.verdictPerformance.find((entry) => entry.verdict === "PASS")).toMatchObject({
      totalCases: 1,
      acceptedCount: 1,
      rejectionRate: 0,
    });
    expect(report.verdictPerformance.find((entry) => entry.verdict === "FAIL")).toMatchObject({
      totalCases: 1,
      rejectedCount: 1,
      rejectionRate: 1,
    });
    expect(report.safety).toEqual({
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    });
    expect(warnCheck.verdict).toBe("WARN");
  });

  it("aggregates check performance", async () => {
    const warnCheck = makeCheck({
      checkCode: "BOARD_REPORT_FOUND",
      verdict: "WARN",
      message: "Board report missing.",
      value: null,
      threshold: null,
    });

    const cases = [
      {
        filingId: "filing-1",
        orgNumber: "123456789",
        fiscalYear: 2024,
        verdict: "WARN" as const,
        checks: [warnCheck],
        reviewOutcome: "REJECTED" as const,
        correctionCount: 1,
        gateArtifactId: "artifact-1",
        generatedAt: "2026-05-09T12:00:00.000Z",
      },
      {
        filingId: "filing-2",
        orgNumber: "123456789",
        fiscalYear: 2024,
        verdict: "WARN" as const,
        checks: [warnCheck],
        reviewOutcome: "ACCEPTED" as const,
        correctionCount: 0,
        gateArtifactId: "artifact-2",
        generatedAt: "2026-05-09T12:00:00.000Z",
      },
    ];

    const performance = summarizeGateCheckPerformance(cases, { minReviewedCases: 1 });
    expect(performance).toHaveLength(1);
    expect(performance[0]).toMatchObject({
      checkCode: "BOARD_REPORT_FOUND",
      originatingVerdict: "WARN",
      reviewedCases: 2,
      rejectedCount: 1,
      correctedCount: 1,
      recommendation: "TIGHTEN",
    });
  });

  it("accepted FAIL cases can recommend RELAX with sufficient sample", async () => {
    const failCheck = makeCheck({
      checkCode: "COMPARISON_MATCH_RATE",
      verdict: "FAIL",
      message: "Low match rate.",
      value: 0.3,
      threshold: 0.5,
    });

    const cases = Array.from({ length: 4 }, (_, index) => ({
      filingId: `filing-${index}`,
      orgNumber: "123456789",
      fiscalYear: 2024,
      verdict: "FAIL" as const,
      checks: [failCheck],
      reviewOutcome: "ACCEPTED" as const,
      correctionCount: 0,
      gateArtifactId: `artifact-${index}`,
      generatedAt: "2026-05-09T12:00:00.000Z",
    }));

    const performance = summarizeGateCheckPerformance(cases, { minReviewedCases: 4 });
    expect(performance[0]?.recommendation).toBe("RELAX");
    expect(proposeUnifiedConfidenceGateConfigAdjustments(performance)[0]).toMatchObject({
      checkCode: "COMPARISON_MATCH_RATE",
      recommendation: "RELAX",
      configFields: ["minComparisonMatchRateForPass", "minComparisonMatchRateForFail"],
    });
  });

  it("rejected WARN cases can recommend TIGHTEN with sufficient sample", async () => {
    const warnCheck = makeCheck({
      checkCode: "BOARD_REPORT_FOUND",
      verdict: "WARN",
      message: "Board report missing.",
      value: null,
      threshold: null,
    });

    const cases = Array.from({ length: 4 }, (_, index) => ({
      filingId: `filing-${index}`,
      orgNumber: "123456789",
      fiscalYear: 2024,
      verdict: "WARN" as const,
      checks: [warnCheck],
      reviewOutcome: index < 3 ? ("REJECTED" as const) : ("ACCEPTED" as const),
      correctionCount: 0,
      gateArtifactId: `artifact-${index}`,
      generatedAt: "2026-05-09T12:00:00.000Z",
    }));

    const performance = summarizeGateCheckPerformance(cases, { minReviewedCases: 4 });
    expect(performance[0]?.recommendation).toBe("TIGHTEN");
  });

  it("low sample returns NEEDS_MORE_DATA", async () => {
    const failCheck = makeCheck({
      checkCode: "CANONICAL_KEY_COVERAGE",
      verdict: "FAIL",
      message: "Coverage too low.",
      value: 0.1,
      threshold: 0.2,
    });

    const performance = summarizeGateCheckPerformance(
      [{
        filingId: "filing-1",
        orgNumber: "123456789",
        fiscalYear: 2024,
        verdict: "FAIL",
        checks: [failCheck],
        reviewOutcome: "ACCEPTED",
        correctionCount: 0,
        gateArtifactId: "artifact-1",
        generatedAt: "2026-05-09T12:00:00.000Z",
      }],
      { minReviewedCases: 2 },
    );

    expect(performance[0]?.recommendation).toBe("NEEDS_MORE_DATA");
  });

  it("PASS with high rejection or correction rate creates risk", async () => {
    const passCheck = makeCheck({
      checkCode: "REVENUE_FOUND",
      verdict: "PASS",
      message: "Revenue found.",
      value: 1,
      threshold: null,
    });

    const artifacts = [
      makeArtifact("filing-1", makeGateReport({
        meta: { filingId: "filing-1", orgNumber: "123456789", fiscalYear: 2024 },
      })),
      makeArtifact("filing-2", makeGateReport({
        meta: { filingId: "filing-2", orgNumber: "123456789", fiscalYear: 2024 },
      })),
    ];

    const feedback = [
      makeFeedback("filing-1", UnifiedConfidenceReviewFeedbackActionValues.REJECT_MACHINE_EXTRACTION, {
        reason: "Still wrong.",
      }),
      makeFeedback("filing-2", UnifiedConfidenceReviewFeedbackActionValues.CORRECT_LINE_ITEM, {
        targetType: "FINANCIAL_LINE_ITEM",
        targetRef: { canonicalKey: "revenue" },
        acceptedValue: { value: "1100" },
      }),
    ];

    const report = await buildUnifiedConfidenceThresholdCalibrationReport(
      { minReviewedCases: 1 },
      {
        listGateArtifacts: vi.fn(async () =>
          artifacts.map((artifact) => {
            const payload = artifact.payload as UnifiedExtractionConfidenceGateReport;
            return {
              ...artifact,
              payload: {
                ...payload,
                checks: [
                  passCheck,
                  ...makeGateReport().checks.filter(
                    (check) => check.checkCode !== "REVENUE_FOUND",
                  ),
                ],
              },
            };
          }),
        ),
        listFeedback: vi.fn(async () => feedback),
      },
    );

    expect(report.risks.some((risk) => risk.checkCode === "OVERALL")).toBe(true);
    expect(report.risks.some((risk) => risk.checkCode === "REVENUE_FOUND")).toBe(true);
  });

  it("INSUFFICIENT_DATA remains conservative", async () => {
    const insufficientCheck = makeCheck({
      checkCode: "COMPARISON_NO_MAJOR_MISMATCHES",
      verdict: "INSUFFICIENT_DATA",
      message: "No comparison data.",
      value: null,
      threshold: null,
    });

    const performance = summarizeGateCheckPerformance(
      [{
        filingId: "filing-1",
        orgNumber: "123456789",
        fiscalYear: 2024,
        verdict: "INSUFFICIENT_DATA",
        checks: [insufficientCheck],
        reviewOutcome: "ACCEPTED",
        correctionCount: 0,
        gateArtifactId: "artifact-1",
        generatedAt: "2026-05-09T12:00:00.000Z",
      }],
      { minReviewedCases: 1 },
    );

    expect(performance[0]?.recommendation).toBe("NEEDS_MORE_DATA");
  });

  it("manual corrections are counted separately from rejections", async () => {
    const report = await buildUnifiedConfidenceThresholdCalibrationReport(
      { minReviewedCases: 1 },
      {
        listGateArtifacts: vi.fn(async () => [
          makeArtifact("filing-1", makeGateReport({
            meta: { filingId: "filing-1", orgNumber: "123456789", fiscalYear: 2024 },
          })),
        ]),
        listFeedback: vi.fn(async () => [
          makeFeedback("filing-1", UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION),
          makeFeedback("filing-1", UnifiedConfidenceReviewFeedbackActionValues.CORRECT_LINE_ITEM, {
            targetType: "FINANCIAL_LINE_ITEM",
            targetRef: { canonicalKey: "revenue" },
            acceptedValue: { value: "1200" },
            createdAt: new Date("2026-05-09T12:05:00.000Z"),
            updatedAt: new Date("2026-05-09T12:05:00.000Z"),
          }),
        ]),
      },
    );

    expect(report.sampleSummary.acceptedCases).toBe(1);
    expect(report.sampleSummary.rejectedCases).toBe(0);
    expect(report.sampleSummary.correctedCases).toBe(1);
  });

  it("unreviewed cases are excluded by default", async () => {
    const listGateArtifacts = vi.fn(async () => [
      makeArtifact("filing-reviewed", makeGateReport({
        meta: { filingId: "filing-reviewed", orgNumber: "123456789", fiscalYear: 2024 },
      })),
      makeArtifact("filing-unreviewed", makeGateReport({
        meta: { filingId: "filing-unreviewed", orgNumber: "123456789", fiscalYear: 2024 },
      })),
    ]);
    const listFeedback = vi.fn(async () => [
      makeFeedback("filing-reviewed", UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION),
    ]);

    const report = await buildUnifiedConfidenceThresholdCalibrationReport(
      {},
      { listGateArtifacts, listFeedback },
    );

    expect(report.sampleSummary.includedCases).toBe(1);
    expect(report.sampleSummary.unreviewedCases).toBe(0);
  });

  it("includeUnreviewed includes them without distorting reviewed rates", async () => {
    const report = await buildUnifiedConfidenceThresholdCalibrationReport(
      { includeUnreviewed: true, minReviewedCases: 1 },
      {
        listGateArtifacts: vi.fn(async () => [
          makeArtifact("filing-reviewed", makeGateReport({
            meta: { filingId: "filing-reviewed", orgNumber: "123456789", fiscalYear: 2024 },
          })),
          makeArtifact("filing-unreviewed", makeGateReport({
            meta: { filingId: "filing-unreviewed", orgNumber: "123456789", fiscalYear: 2024 },
          })),
        ]),
        listFeedback: vi.fn(async () => [
          makeFeedback("filing-reviewed", UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION),
        ]),
      },
    );

    expect(report.sampleSummary.includedCases).toBe(2);
    expect(report.sampleSummary.reviewedCases).toBe(1);
    expect(report.sampleSummary.unreviewedCases).toBe(1);
    expect(report.verdictPerformance.find((entry) => entry.verdict === "PASS")?.acceptanceRate).toBe(1);
  });

  it("latest artifact per filing is selected and no production mutation methods are called", async () => {
    const listGateArtifacts = vi.fn(async () => [
      makeArtifact("filing-1", makeGateReport({
        meta: { filingId: "filing-1", orgNumber: "123456789", fiscalYear: 2024 },
        overallVerdict: "FAIL",
        failCount: 1,
        passCount: 13,
      }), {
        createdAt: new Date("2026-05-09T11:00:00.000Z"),
        updatedAt: new Date("2026-05-09T11:00:00.000Z"),
      }),
      makeArtifact("filing-1", makeGateReport({
        meta: { filingId: "filing-1", orgNumber: "123456789", fiscalYear: 2024 },
        overallVerdict: "PASS",
      }), {
        id: "artifact-filing-1-new",
        createdAt: new Date("2026-05-09T13:00:00.000Z"),
        updatedAt: new Date("2026-05-09T13:00:00.000Z"),
      }),
    ]);
    const listFeedback = vi.fn(async () => [
      makeFeedback("filing-1", UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION),
    ]);

    const report = await buildUnifiedConfidenceThresholdCalibrationReport(
      { minReviewedCases: 1 },
      { listGateArtifacts, listFeedback },
    );

    expect(report.sampleSummary.includedCases).toBe(1);
    expect(report.verdictPerformance.find((entry) => entry.verdict === "PASS")?.totalCases).toBe(1);
    expect(listGateArtifacts).toHaveBeenCalledTimes(1);
    expect(listFeedback).toHaveBeenCalledTimes(1);
  });
});
