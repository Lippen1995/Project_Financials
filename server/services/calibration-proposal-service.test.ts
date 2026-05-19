import { describe, expect, it, vi, beforeEach } from "vitest";

import type { AnnualReportUnifiedConfidenceCalibrationReport } from "@/server/services/annual-report-unified-confidence-calibration-service";
import { DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG } from "@/server/services/annual-report-unified-extraction-confidence-gate-service";

const { calibrationMock, proposeMock, notifyMock } = vi.hoisted(() => ({
  calibrationMock: vi.fn(),
  proposeMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock("@/server/services/annual-report-unified-confidence-calibration-service", () => ({
  buildUnifiedConfidenceThresholdCalibrationReport: calibrationMock,
}));

vi.mock("@/server/services/confidence-threshold-version-service", () => ({
  proposeThresholdVersion: proposeMock,
}));

vi.mock("@/server/services/admin-notification-service", () => ({
  createAdminNotificationIfMissing: notifyMock,
}));

import { runCalibrationAndProposeIfChanged } from "@/server/services/calibration-proposal-service";

function buildReport(
  overrides: Partial<AnnualReportUnifiedConfidenceCalibrationReport> = {},
): AnnualReportUnifiedConfidenceCalibrationReport {
  return {
    version: "annual-report-unified-confidence-calibration-v2",
    generatedAt: "2026-05-19T08:00:00.000Z",
    input: { runId: null, includeUnreviewed: false, generatedBy: null },
    sourceRun: { runId: null, generatedAt: null, gitCommitSha: null, manifestName: null },
    evidenceUsed: {
      totalGoldSetFilings: 100,
      totalManualReviewCandidates: 50,
      reviewedCandidates: 30,
      pendingCandidates: 15,
      blockedCandidates: 5,
    },
    thresholdBehavior: {
      before: {
        gateConfig: DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG,
        policy: {} as never,
        distribution: { PASS: 5, WARN: 20, FAIL: 5, INSUFFICIENT_DATA: 0 },
      },
      after: {
        gateConfig: { ...DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG, minComparisonMatchRateForPass: 0.7 },
        policy: {} as never,
        distribution: { PASS: 10, WARN: 15, FAIL: 5, INSUFFICIENT_DATA: 0 },
        status: "FEASIBLE" as never,
      },
    },
    metrics: {
      totalReviewedCases: 30,
      autoPassCandidates: 10,
      reviewCandidates: 15,
      blockedCandidates: 5,
      falsePassCount: 2,
      falsePassRate: 0.067,
      falseReviewCount: 3,
      falseReviewRate: 0.1,
      falseBlockCount: 0,
      falseBlockRate: 0,
      safeAutoPassPrecision: 0.8,
      safeAutoPassRecall: 0.6,
      highSeverityMissCount: 1,
      manualReviewRate: 0.5,
      narrativeMismatchCount: 0,
      unitScaleAmbiguityCount: 0,
    },
    distributions: { byTag: [], byIssueClass: [], canonicalKeyMismatchRates: [] },
    thresholdAdjustments: [
      {
        key: "minComparisonMatchRateForPass",
        direction: "TIGHTEN" as never,
        currentValue: "0.8",
        proposedValue: "0.7",
        sampleSize: 30,
        rationale: "Found unsafe passes below 0.8",
      },
    ],
    remainingHighRiskCases: [],
    affectedExamples: [],
    recommendations: { pr78FailureTaxonomy: [], pr79ExtractionFixes: [] },
    output: { jsonPath: "/tmp/x.json", markdownPath: "/tmp/x.md" },
    safety: {
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    },
    ...overrides,
  };
}

describe("calibration-proposal-service", () => {
  beforeEach(() => {
    calibrationMock.mockReset();
    proposeMock.mockReset();
    notifyMock.mockReset();
    proposeMock.mockResolvedValue({
      id: "tv-99",
      version: 2,
      status: "PROPOSED",
      configBlob: DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG,
      derivedFromReport: null,
      impactEstimate: null,
      summary: null,
      notes: null,
      proposedAt: new Date(),
      appliedAt: null,
      appliedByUserId: null,
      retiredAt: null,
      rejectedAt: null,
      rejectedByUserId: null,
      rejectionReason: null,
    });
    notifyMock.mockResolvedValue({});
  });

  it("creates a proposal when adjustments exist and evidence is sufficient", async () => {
    calibrationMock.mockResolvedValue(buildReport());

    const result = await runCalibrationAndProposeIfChanged();

    expect(result.proposalCreated).toBe(true);
    expect(proposeMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledTimes(1);

    const proposeArg = proposeMock.mock.calls[0]![0];
    expect(proposeArg.summary).toContain("minComparisonMatchRateForPass: 0.8 → 0.7");
    expect(proposeArg.impactEstimate.sampleSize).toBe(30);
  });

  it("skips proposal creation when no adjustments are recommended", async () => {
    calibrationMock.mockResolvedValue(buildReport({ thresholdAdjustments: [] }));

    const result = await runCalibrationAndProposeIfChanged();

    expect(result.proposalCreated).toBe(false);
    expect(proposeMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("skips proposal creation when reviewed evidence is below the minimum", async () => {
    calibrationMock.mockResolvedValue(
      buildReport({
        evidenceUsed: {
          totalGoldSetFilings: 5,
          totalManualReviewCandidates: 5,
          reviewedCandidates: 5,
          pendingCandidates: 0,
          blockedCandidates: 0,
        },
      }),
    );

    const result = await runCalibrationAndProposeIfChanged();

    expect(result.proposalCreated).toBe(false);
    expect(proposeMock).not.toHaveBeenCalled();
  });

  it("does not throw when notification creation fails (proposal is still saved)", async () => {
    calibrationMock.mockResolvedValue(buildReport());
    notifyMock.mockRejectedValue(new Error("notification down"));

    const result = await runCalibrationAndProposeIfChanged();

    expect(result.proposalCreated).toBe(true);
    expect(proposeMock).toHaveBeenCalled();
  });

  it("respects skipNotification flag (no notification created)", async () => {
    calibrationMock.mockResolvedValue(buildReport());

    await runCalibrationAndProposeIfChanged({ skipNotification: true });

    expect(notifyMock).not.toHaveBeenCalled();
  });
});
