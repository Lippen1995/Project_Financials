import { describe, expect, it, vi } from "vitest";

import type { AnnualReportGoldSetShadowRun } from "@/server/benchmarking/annual-report-gold-set-shadow-run";
import type {
  AnnualReportManualReviewCandidate,
  AnnualReportManualReviewRound,
} from "@/server/services/annual-report-manual-review-round-service";
import {
  buildCalibratedUnifiedConfidenceCaseDecision,
  buildUnifiedConfidenceThresholdCalibrationReport,
  renderUnifiedConfidenceThresholdCalibrationMarkdown,
} from "@/server/services/annual-report-unified-confidence-calibration-service";

function makeCandidate(
  overrides: Partial<AnnualReportManualReviewCandidate> = {},
): AnnualReportManualReviewCandidate {
  return {
    candidateId: "candidate-1",
    reviewRoundId: "gold-set-2026-05-10",
    runId: "gold-set-2026-05-10",
    orgNumber: "123456789",
    companyName: "Eksempel AS",
    accountingYear: 2024,
    filingId: "filing-1",
    reportId: "report-1",
    documentRef: "source.pdf",
    tags: ["manual_review_expected"],
    evidenceType: "persisted_artifact",
    evidenceQuality: "real_legacy_candidate",
    confidenceGateResult: "FAIL",
    comparisonResult: {
      mismatchCount: 1,
      narrativeMismatchCount: 0,
      exactMatchCount: 4,
      matchRate: 0.7,
    },
    firstDivergenceStage: "comparison",
    severity: "HIGH",
    reviewReasons: ["Confidence gate vurderte rapporten som FAIL."],
    issueClasses: ["confidence_gate_fail", "unit_scale_ambiguity"],
    financialComparisons: [
      {
        canonicalKey: "revenue",
        fiscalYear: 2024,
        legacyValueNok: "1000000",
        unifiedValueNok: "800000",
        deltaNok: "-200000",
        match: "CONFLICTING_VALUES",
        relativeDeviation: 0.2,
        legacyLabel: "Sum driftsinntekter",
        unifiedLabel: "Sum driftsinntekter",
        legacyUnitScale: 1,
        unifiedUnitScale: "ONES",
        reviewRequired: true,
      },
    ],
    narrativeComparisons: [],
    artifactRefs: [
      {
        key: "source_pdf",
        label: "Source PDF",
        status: "available",
        artifactId: "pdf-1",
        storageKey: "source.pdf",
        artifactType: "PDF",
        kind: null,
        href: null,
        note: null,
      },
      {
        key: "structured_document_json",
        label: "Structured document JSON",
        status: "available",
        artifactId: "structured-1",
        storageKey: "structured.json",
        artifactType: "STRUCTURED_DOCUMENT_JSON",
        kind: null,
        href: null,
        note: null,
      },
    ],
    confidenceGateDiagnostics: [
      {
        checkCode: "UNIT_SCALE_RESOLVED",
        verdict: "FAIL",
        message: "Unknown unit scale.",
      },
    ],
    parserOrEvidence: "legacy",
    status: "PENDING",
    updatedAt: null,
    latestDecision: null,
    diagnostics: [],
    ...overrides,
  };
}

function makeRound(candidates: AnnualReportManualReviewCandidate[]): AnnualReportManualReviewRound {
  return {
    version: "annual-report-manual-review-round-v1",
    reviewRoundId: "gold-set-2026-05-10",
    generatedAt: "2026-05-10T12:30:00.000Z",
    sourceRun: {
      runId: "gold-set-2026-05-10",
      generatedAt: "2026-05-10T12:00:00.000Z",
      manifestName: "manual-review-gold-set",
      manifestHash: "hash",
      gitCommitSha: "abc123",
    },
    summary: {
      totalFilings: candidates.length,
      reviewCandidateCount: candidates.length,
      reviewedCount: candidates.filter((item) => item.latestDecision !== null).length,
      pendingCount: candidates.filter((item) => item.latestDecision === null).length,
      blockedCount: candidates.filter((item) => item.status === "BLOCKED").length,
      severityCounts: {
        HIGH: candidates.filter((item) => item.severity === "HIGH").length,
        MEDIUM: candidates.filter((item) => item.severity === "MEDIUM").length,
        LOW: candidates.filter((item) => item.severity === "LOW").length,
      },
      issueClassCounts: {},
      tagCoverage: {},
      evidenceQualitySummary: {},
      topFailingCanonicalFinancialKeys: [],
      topDivergenceStages: [],
      missingArtifactCounts: {},
      narrativeMismatchCount: 0,
      unitScaleAmbiguityCount: 0,
    },
    candidates,
    decisions: candidates
      .map((item) => item.latestDecision)
      .filter((item): item is NonNullable<typeof item> => item !== null),
    diagnostics: [],
    recommendedNextActions: {
      pr77Calibration: [],
      pr78FailureTaxonomy: [],
      pr79ExtractionFixes: [],
    },
  };
}

function makeShadowRun(filingIds: string[]): AnnualReportGoldSetShadowRun {
  return {
    version: "annual-report-gold-set-shadow-run-v1",
    runId: "gold-set-2026-05-10",
    generatedAt: "2026-05-10T12:00:00.000Z",
    gitCommitSha: "abc123",
    environment: {
      nodeEnv: "test",
      opendataloaderMode: "local",
      opendataloaderEnabled: "true",
    },
    manifest: {
      name: "manual-review-gold-set",
      version: "annual-report-go-live-gold-set-v1",
      hash: "hash",
      validation: {
        productionReady: true,
        errors: [],
        warnings: [],
        valid: true,
        coverageByTag: {},
        evidenceQualitySummary: {
          live_local: 0,
          persisted_artifact: filingIds.length,
          fixture_only: 0,
          unavailable: 0,
        },
      },
    },
    routeConfiguration: {
      mode: "PERSIST_ARTIFACTS",
      persistShadowArtifacts: true,
      persistConfidenceGateArtifacts: true,
    },
    parserRuntimeDiagnostics: {
      opendataloaderMode: "local",
      opendataloaderEnabled: "true",
    },
    batch: {
      version: "annual-report-unified-confidence-batch-v1",
      generatedAt: "2026-05-10T12:00:00.000Z",
      manifest: {
        name: "manual-review-gold-set",
        entries: [],
      },
      config: {
        mode: "PERSIST_ARTIFACTS",
        persistShadowArtifacts: true,
        persistConfidenceGateArtifacts: true,
        limit: null,
      },
      candidateCounts: {
        real_legacy_candidate: filingIds.length,
        fixture_candidate: 0,
        unavailable_candidate: 0,
        malformed_candidate: 0,
      },
      cases: filingIds.map((filingId, index) => ({
        caseId: `case-${index + 1}`,
        filingId,
        orgNumber: `12345678${index + 1}`,
        companyName: `Company ${index + 1}`,
        fiscalYear: 2024,
        label: `Company ${index + 1} 2024`,
        tagHints: index === 0 ? ["manual_review_expected"] : [],
        status: "completed" as const,
        errors: [],
        warnings: [],
        durationMs: 1000,
        legacyCandidateSet: {
          classification: "real_legacy_candidate" as const,
          candidateCount: 7,
          provenance: {
            orgNumber: `12345678${index + 1}`,
            filingId,
            fiscalYear: 2024,
            filingReportId: `report-${index + 1}`,
            sourceDocumentReference: "source.pdf",
            sourceArtifactReference: "legacy.json",
            extractionRoute: "legacy",
            evidenceType: "persisted_artifact",
            extractionTimestamp: "2026-05-09T12:00:00.000Z",
            artifactTimestamp: "2026-05-09T12:00:00.000Z",
            sourceRunId: "run-1",
            source: "published_snapshot",
            lookupDiagnostics: [],
          },
          diagnostics: [],
          preview: [],
        },
        shadow: {
          mode: "PERSIST_ARTIFACTS" as const,
          skipped: false,
          totalDurationMs: 900,
          canUseForProductionRouting: false,
          steps: {
            document: { ok: true, durationMs: 100, error: null },
            financial: { ok: true, durationMs: 100, error: null },
            narrative: { ok: true, durationMs: 100, error: null },
            comparison: { ok: true, durationMs: 100, error: null },
          },
          summary: {
            documentPageCount: 12,
            documentSectionCount: 4,
            financialStatementCount: 2,
            financialLineItemCount: 20,
            narrativeSectionCount: 2,
            comparisonFactCount: 7,
            comparisonExactMatchCount: 5,
            comparisonMismatchCount: index === 0 ? 1 : 0,
            comparisonMatchRate: index === 0 ? 0.7 : 0.95,
          },
          artifacts: {},
        },
        gate: null,
        gateSummary: {
          overallVerdict: index === 0 ? ("PASS" as const) : ("WARN" as const),
          passCount: index === 0 ? 12 : 10,
          warnCount: index === 0 ? 0 : 2,
          failCount: 0,
          insufficientDataCount: 0,
          blockingCheckCodes: [],
          warningCheckCodes: index === 0 ? [] : ["BOARD_REPORT_FOUND"],
        },
        safety: {
          canUseForProductionRouting: false,
          productionRoutingChanged: false,
          productionFactsMutated: false,
          publishAffected: false,
        },
      })),
      summary: {
        totalCases: filingIds.length,
        completedCases: filingIds.length,
        skippedCases: 0,
        errorCases: 0,
        verdictCounts: {
          PASS: 1,
          WARN: filingIds.length - 1,
          FAIL: 0,
          INSUFFICIENT_DATA: 0,
        },
        mostCommonFailingChecks: [],
        mostCommonWarningChecks: [],
        averageFinancialLineItemCount: 20,
        averageNarrativeSectionCount: 2,
        averageComparisonMatchRate: 0.82,
        totalDurationMs: 1000,
        safetyInvariantViolations: [],
      },
    },
    summary: {
      passCount: 1,
      warnCount: filingIds.length - 1,
      failCount: 0,
      skipCount: 0,
      parityCount: 0,
      divergenceCount: 1,
      manualReviewCandidates: [filingIds[0]!],
      evidenceQualityByTag: {},
    },
  };
}

describe("annual-report-unified-confidence-calibration-service", () => {
  it("aggregates calibration metrics from manual review evidence and shadow run data", async () => {
    const unsafePass = makeCandidate({
      candidateId: "candidate-unsafe-pass",
      filingId: "filing-1",
      confidenceGateResult: "PASS",
      latestDecision: {
        candidateId: "candidate-unsafe-pass",
        runId: "gold-set-2026-05-10",
        filingId: "filing-1",
        decision: "LEGACY_CORRECT",
        issueClasses: ["unit_scale_ambiguity"],
        reviewerNotes: null,
        reviewedBy: "reviewer",
        reviewedByRole: "ADMIN",
        reviewedAt: "2026-05-10T12:40:00.000Z",
        severityOverride: "HIGH",
      },
      status: "REVIEWED",
    });
    const safeWarn = makeCandidate({
      candidateId: "candidate-safe-warn",
      filingId: "filing-2",
      confidenceGateResult: "WARN",
      severity: "MEDIUM",
      issueClasses: ["narrative_mismatch"],
      latestDecision: {
        candidateId: "candidate-safe-warn",
        runId: "gold-set-2026-05-10",
        filingId: "filing-2",
        decision: "BOTH_CORRECT",
        issueClasses: ["narrative_mismatch"],
        reviewerNotes: null,
        reviewedBy: "reviewer",
        reviewedByRole: "ADMIN",
        reviewedAt: "2026-05-10T12:45:00.000Z",
        severityOverride: "MEDIUM",
      },
      status: "REVIEWED",
    });

    const report = await buildUnifiedConfidenceThresholdCalibrationReport(
      { includeUnreviewed: true, generatedBy: "test" },
      {
        readLatestManualReviewRound: vi.fn(async () => makeRound([unsafePass, safeWarn])),
        readLatestShadowRun: vi.fn(async () => makeShadowRun(["filing-1", "filing-2"])),
        now: () => new Date("2026-05-10T13:00:00.000Z"),
      },
    );

    expect(report.metrics.totalReviewedCases).toBe(2);
    expect(report.metrics.falsePassCount).toBe(1);
    expect(report.metrics.falseReviewCount).toBe(1);
    expect(report.metrics.highSeverityMissCount).toBe(1);
    expect(report.thresholdBehavior.after.status).toBe("REVIEW_REQUIRED");
    expect(report.distributions.canonicalKeyMismatchRates[0]?.canonicalKey).toBe("revenue");
    expect(report.recommendations.pr78FailureTaxonomy.length).toBeGreaterThan(0);
  });

  it("reviewed HIGH-severity cases do not auto-pass after calibration", () => {
    const candidate = makeCandidate({
      confidenceGateResult: "PASS",
      severity: "HIGH",
      latestDecision: {
        candidateId: "candidate-1",
        runId: "gold-set-2026-05-10",
        filingId: "filing-1",
        decision: "LEGACY_CORRECT",
        issueClasses: ["unit_scale_ambiguity"],
        reviewerNotes: null,
        reviewedBy: "reviewer",
        reviewedByRole: "ADMIN",
        reviewedAt: "2026-05-10T12:45:00.000Z",
        severityOverride: "HIGH",
      },
    });

    const result = buildCalibratedUnifiedConfidenceCaseDecision({
      rawDecision: "PASS",
      candidate,
      tags: candidate.tags,
      policy: {
        minComparisonMatchRateForPass: 0.85,
        majorMismatchDeviationThreshold: 0.2,
        missingSourcePdfDecision: "FAIL",
        missingStructuredDocumentDecision: "FAIL",
        parserRuntimeUnavailableDecision: "FAIL",
        unitScaleAmbiguityDecision: "FAIL",
        missingPrimaryStatementDecision: "FAIL",
        narrativeMismatchDecision: "WARN",
        highSeverityCandidateDecision: "FAIL",
        highRiskTagsForceReview: ["manual_review_expected"],
        explanationNotes: [],
      },
    });

    expect(result.decision).toBe("FAIL");
  });

  it("routes unit-scale ambiguity to FAIL", () => {
    const candidate = makeCandidate({
      issueClasses: ["unit_scale_ambiguity"],
    });

    const result = buildCalibratedUnifiedConfidenceCaseDecision({
      rawDecision: "PASS",
      candidate,
      tags: [],
      policy: {
        minComparisonMatchRateForPass: 0.8,
        majorMismatchDeviationThreshold: 0.5,
        missingSourcePdfDecision: "WARN",
        missingStructuredDocumentDecision: "WARN",
        parserRuntimeUnavailableDecision: "WARN",
        unitScaleAmbiguityDecision: "FAIL",
        missingPrimaryStatementDecision: "WARN",
        narrativeMismatchDecision: "WARN",
        highSeverityCandidateDecision: "WARN",
        highRiskTagsForceReview: [],
        explanationNotes: [],
      },
    });

    expect(result.decision).toBe("FAIL");
  });

  it("routes missing primary statements to review or fail", () => {
    const candidate = makeCandidate({
      confidenceGateDiagnostics: [
        {
          checkCode: "INCOME_STATEMENT_COVERAGE",
          verdict: "FAIL",
          message: "Missing income statement.",
        },
      ],
    });

    const result = buildCalibratedUnifiedConfidenceCaseDecision({
      rawDecision: "PASS",
      candidate,
      tags: [],
      policy: {
        minComparisonMatchRateForPass: 0.8,
        majorMismatchDeviationThreshold: 0.5,
        missingSourcePdfDecision: "WARN",
        missingStructuredDocumentDecision: "WARN",
        parserRuntimeUnavailableDecision: "WARN",
        unitScaleAmbiguityDecision: "FAIL",
        missingPrimaryStatementDecision: "FAIL",
        narrativeMismatchDecision: "WARN",
        highSeverityCandidateDecision: "WARN",
        highRiskTagsForceReview: [],
        explanationNotes: [],
      },
    });

    expect(["WARN", "FAIL"]).toContain(result.decision);
  });

  it("does not treat missing structured artifacts as safe PASS", () => {
    const candidate = makeCandidate({
      artifactRefs: [
        {
          key: "structured_document_json",
          label: "Structured document JSON",
          status: "missing",
          artifactId: null,
          storageKey: null,
          artifactType: null,
          kind: null,
          href: null,
          note: "Missing.",
        },
      ],
    });

    const result = buildCalibratedUnifiedConfidenceCaseDecision({
      rawDecision: "PASS",
      candidate,
      tags: [],
      policy: {
        minComparisonMatchRateForPass: 0.8,
        majorMismatchDeviationThreshold: 0.5,
        missingSourcePdfDecision: "WARN",
        missingStructuredDocumentDecision: "FAIL",
        parserRuntimeUnavailableDecision: "WARN",
        unitScaleAmbiguityDecision: "FAIL",
        missingPrimaryStatementDecision: "WARN",
        narrativeMismatchDecision: "WARN",
        highSeverityCandidateDecision: "WARN",
        highRiskTagsForceReview: [],
        explanationNotes: [],
      },
    });

    expect(result.decision).toBe("FAIL");
  });

  it("renders JSON/Markdown-compatible output shape", async () => {
    const candidate = makeCandidate({
      latestDecision: {
        candidateId: "candidate-1",
        runId: "gold-set-2026-05-10",
        filingId: "filing-1",
        decision: "NEEDS_EXTRACTION_FIX",
        issueClasses: ["unit_scale_ambiguity"],
        reviewerNotes: null,
        reviewedBy: "reviewer",
        reviewedByRole: "ADMIN",
        reviewedAt: "2026-05-10T12:40:00.000Z",
        severityOverride: "HIGH",
      },
      status: "REVIEWED",
    });

    const report = await buildUnifiedConfidenceThresholdCalibrationReport(
      { includeUnreviewed: true },
      {
        readLatestManualReviewRound: vi.fn(async () => makeRound([candidate])),
        readLatestShadowRun: vi.fn(async () => makeShadowRun(["filing-1"])),
        now: () => new Date("2026-05-10T13:00:00.000Z"),
      },
    );

    const markdown = renderUnifiedConfidenceThresholdCalibrationMarkdown(report);

    expect(report.version).toBe("annual-report-unified-confidence-calibration-v2");
    expect(report.output.jsonPath).toContain("annual-report-unified-confidence-calibration");
    expect(markdown).toContain("# Unified confidence calibration");
    expect(markdown).toContain("## Metrics");
    expect(markdown).toContain("## Adjustments");
  });
});
