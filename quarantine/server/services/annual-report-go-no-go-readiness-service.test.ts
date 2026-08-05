import { describe, expect, it } from "vitest";

import {
  buildAnnualReportGoNoGoReadinessReport,
  renderAnnualReportGoNoGoReadinessMarkdown,
} from "@/server/services/annual-report-go-no-go-readiness-service";
import type { AnnualReportGoldSetShadowRun } from "@/server/benchmarking/annual-report-gold-set-shadow-run";
import type { AnnualReportExtractionFixReport } from "@/server/services/annual-report-extraction-fix-report-service";
import type { AnnualReportManualReviewRound } from "@/server/services/annual-report-manual-review-round-service";
import type { AnnualReportUnifiedConfidenceCalibrationReport } from "@/server/services/annual-report-unified-confidence-calibration-service";
import type { AnnualReportUnifiedFailureTaxonomyReport } from "@/server/services/annual-report-unified-failure-taxonomy-service";

function makeRuntime(overrides?: Partial<Record<string, unknown>>) {
  return {
    packageInstalled: true,
    packageVersion: "2.2.1",
    java: {
      rawVersion: "17",
      majorVersion: 17,
      available: true,
      executablePath: "java",
      pathCandidates: ["java"],
      javaHomePath: null,
      discoveredCandidates: [],
    },
    localModeReady: true,
    hybridConfigured: true,
    localModeReason: "Ready",
    hybridModeReason: "Ready",
    liveLocalBenchmarkReady: true,
    liveLocalBenchmarkReason: "Ready",
    liveHybridBenchmarkReady: true,
    liveHybridBenchmarkReason: "Ready",
    ...overrides,
  };
}

function makeGoldSetRun(overrides?: Partial<AnnualReportGoldSetShadowRun>): AnnualReportGoldSetShadowRun {
  return {
    version: "annual-report-gold-set-shadow-run-v1",
    runId: "gold-set-run-1",
    generatedAt: "2026-05-11T12:00:00.000Z",
    gitCommitSha: "abc123",
    environment: {
      nodeEnv: "test",
      opendataloaderMode: "PERSIST_ARTIFACTS",
      opendataloaderEnabled: "true",
    },
    manifest: {
      name: "annual-report-go-live-gold-set",
      version: "annual-report-go-live-gold-set-v1",
      hash: "hash",
      validation: {
        valid: true,
        errors: [],
        warnings: [],
        coverageByTag: {
          digital_simple: 1,
          digital_note_heavy: 1,
          multi_page_balance: 1,
          supplementary_present: 1,
          unit_scale_sensitive: 1,
          scan_or_ocr: 1,
          ocr_token_noise: 1,
          formatting_edge: 1,
          manual_review_expected: 1,
          degraded_ambiguous: 1,
          continuation_complex: 1,
        },
        evidenceQualitySummary: {
          live_local: 5,
          persisted_artifact: 5,
          fixture_only: 0,
          unavailable: 0,
        },
        productionReady: true,
      },
    },
    routeConfiguration: {
      mode: "PERSIST_ARTIFACTS",
      persistShadowArtifacts: true,
      persistConfidenceGateArtifacts: true,
    },
    parserRuntimeDiagnostics: {
      opendataloaderMode: "PERSIST_ARTIFACTS",
      opendataloaderEnabled: "true",
    },
    batch: {
      version: "annual-report-unified-confidence-batch-v1",
      generatedAt: "2026-05-11T12:00:00.000Z",
      manifest: { name: "annual-report-go-live-gold-set", generatedAt: "2026-05-11T12:00:00.000Z", notes: "", entries: [{ filingId: "f1", tagHints: [] }] },
      config: {
        mode: "PERSIST_ARTIFACTS",
        persistShadowArtifacts: true,
        persistConfidenceGateArtifacts: true,
        limit: null,
      },
      candidateCounts: {
        real_legacy_candidate: 1,
        fixture_candidate: 0,
        unavailable_candidate: 0,
        malformed_candidate: 0,
      },
      cases: [],
      summary: {
        totalCases: 1,
        completedCases: 1,
        skippedCases: 0,
        errorCases: 0,
        verdictCounts: {
          PASS: 1,
          WARN: 0,
          FAIL: 0,
          INSUFFICIENT_DATA: 0,
        },
        mostCommonFailingChecks: [],
        mostCommonWarningChecks: [],
        averageFinancialLineItemCount: null,
        averageNarrativeSectionCount: null,
        averageComparisonMatchRate: null,
        totalDurationMs: 10,
        safetyInvariantViolations: [],
      },
    },
    summary: {
      passCount: 1,
      warnCount: 0,
      failCount: 0,
      skipCount: 0,
      parityCount: 1,
      divergenceCount: 0,
      manualReviewCandidates: [],
      evidenceQualityByTag: {},
    },
    ...overrides,
  };
}

function makeManualReviewRound(
  overrides?: Partial<AnnualReportManualReviewRound>,
): AnnualReportManualReviewRound {
  return {
    version: "annual-report-manual-review-round-v1",
    reviewRoundId: "gold-set-run-1",
    generatedAt: "2026-05-11T12:05:00.000Z",
    sourceRun: {
      runId: "gold-set-run-1",
      generatedAt: "2026-05-11T12:00:00.000Z",
      manifestName: "annual-report-go-live-gold-set",
      manifestHash: "hash",
      gitCommitSha: "abc123",
    },
    summary: {
      totalFilings: 5,
      reviewCandidateCount: 5,
      reviewedCount: 5,
      pendingCount: 0,
      blockedCount: 0,
      severityCounts: { HIGH: 0, MEDIUM: 0, LOW: 0 },
      issueClassCounts: {},
      tagCoverage: {},
      evidenceQualitySummary: { real_legacy_candidate: 5 },
      topFailingCanonicalFinancialKeys: [],
      topDivergenceStages: [],
      missingArtifactCounts: {
        structured_document_json: 0,
        legacy_extraction: 0,
        unified_extraction: 0,
      },
      narrativeMismatchCount: 0,
      unitScaleAmbiguityCount: 0,
    },
    candidates: [],
    decisions: [],
    diagnostics: [],
    recommendedNextActions: {
      pr77Calibration: [],
      pr78FailureTaxonomy: [],
      pr79ExtractionFixes: [],
    },
    ...overrides,
  };
}

function makeCalibrationReport(
  overrides?: Partial<AnnualReportUnifiedConfidenceCalibrationReport>,
): AnnualReportUnifiedConfidenceCalibrationReport {
  return {
    version: "annual-report-unified-confidence-calibration-v2",
    generatedAt: "2026-05-11T12:10:00.000Z",
    input: { runId: "gold-set-run-1", includeUnreviewed: false, generatedBy: "test" },
    sourceRun: {
      runId: "gold-set-run-1",
      generatedAt: "2026-05-11T12:00:00.000Z",
      gitCommitSha: "abc123",
      manifestName: "annual-report-go-live-gold-set",
    },
    evidenceUsed: {
      totalGoldSetFilings: 5,
      totalManualReviewCandidates: 5,
      reviewedCandidates: 5,
      pendingCandidates: 0,
      blockedCandidates: 0,
    },
    thresholdBehavior: {
      before: {
        gateConfig: {
          minCanonicalKeyCoverageForPass: 0.5,
          minCanonicalKeyCoverageForFail: 0.2,
          minComparisonMatchRateForPass: 0.8,
          minComparisonMatchRateForFail: 0.5,
          majorMismatchDeviationThreshold: 0.5,
          maxMajorMismatchCountForFail: 0,
          narrativeAbsenceIsFail: false,
        },
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
        distribution: { PASS: 2, WARN: 2, FAIL: 1, INSUFFICIENT_DATA: 0 },
      },
      after: {
        gateConfig: {
          minCanonicalKeyCoverageForPass: 0.5,
          minCanonicalKeyCoverageForFail: 0.2,
          minComparisonMatchRateForPass: 0.8,
          minComparisonMatchRateForFail: 0.5,
          majorMismatchDeviationThreshold: 0.5,
          maxMajorMismatchCountForFail: 0,
          narrativeAbsenceIsFail: false,
        },
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
        distribution: { PASS: 2, WARN: 2, FAIL: 1, INSUFFICIENT_DATA: 0 },
        status: "STABLE",
      },
    },
    metrics: {
      totalReviewedCases: 5,
      autoPassCandidates: 2,
      reviewCandidates: 2,
      blockedCandidates: 1,
      falsePassCount: 0,
      falsePassRate: 0,
      falseReviewCount: 0,
      falseReviewRate: 0,
      falseBlockCount: 0,
      falseBlockRate: 0,
      safeAutoPassPrecision: 1,
      safeAutoPassRecall: 1,
      highSeverityMissCount: 0,
      manualReviewRate: 0.4,
      narrativeMismatchCount: 0,
      unitScaleAmbiguityCount: 0,
    },
    distributions: {
      byTag: [],
      byIssueClass: [],
      canonicalKeyMismatchRates: [],
    },
    thresholdAdjustments: [],
    remainingHighRiskCases: [],
    affectedExamples: [],
    recommendations: {
      pr78FailureTaxonomy: [],
      pr79ExtractionFixes: [],
    },
    output: {
      jsonPath: "output/benchmarks/annual-report-unified-confidence-calibration/latest.json",
      markdownPath: "output/benchmarks/annual-report-unified-confidence-calibration/latest.md",
    },
    safety: {
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    },
    ...overrides,
  };
}

function makeTaxonomyReport(
  overrides?: Partial<AnnualReportUnifiedFailureTaxonomyReport>,
): AnnualReportUnifiedFailureTaxonomyReport {
  return {
    version: "annual-report-unified-failure-taxonomy-v1",
    generatedAt: "2026-05-11T12:15:00.000Z",
    input: { runId: "gold-set-run-1", generatedBy: "test" },
    sourceRun: {
      reviewRoundId: "gold-set-run-1",
      reviewRoundGeneratedAt: "2026-05-11T12:05:00.000Z",
      goldSetRunId: "gold-set-run-1",
      manifestName: "annual-report-go-live-gold-set",
      gitCommitSha: "abc123",
    },
    evidenceUsed: {
      totalCandidates: 5,
      reviewedCandidates: 5,
      pendingCandidates: 0,
      blockedCandidates: 0,
    },
    summary: {
      totalCandidates: 5,
      totalMappedIssues: 2,
      highSeverityIssueCount: 0,
      issueClassCounts: [],
      severityCounts: { HIGH: 0, MEDIUM: 0, LOW: 0 },
      affectedTags: [],
      affectedCanonicalKeys: [],
      firstDivergenceStages: [],
      remediationAreaCounts: [],
      representativeExamples: [],
    },
    issues: [],
    recommendations: {
      pr79ExtractionFixes: [],
    },
    output: {
      jsonPath: "output/benchmarks/annual-report-unified-failure-taxonomy/latest.json",
      markdownPath: "output/benchmarks/annual-report-unified-failure-taxonomy/latest.md",
    },
    safety: {
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    },
    ...overrides,
  };
}

function makeExtractionFixReport(
  overrides?: Partial<AnnualReportExtractionFixReport>,
): AnnualReportExtractionFixReport {
  return {
    version: "annual-report-extraction-fix-report-v1",
    generatedAt: "2026-05-11T12:20:00.000Z",
    status: "REGRESSION_VERIFIED",
    targetedIssueClasses: [
      "UNIT_SCALE_MISMATCH",
      "NORWEGIAN_LABEL_MAPPING_ERROR",
      "MULTI_PAGE_BALANCE_ERROR",
      "TABLE_RECONSTRUCTION_ERROR",
      "OCR_TOKEN_NOISE",
    ],
    fixesImplemented: [],
    testsAdded: [],
    evidenceUsed: {
      benchmarkPath: "output/benchmarks/annual-report-golden/latest.json",
      shadowBatchPath: "output/benchmarks/annual-report-shadow-batches/latest.json",
      calibrationReportPath: "output/benchmarks/annual-report-unified-confidence-calibration/latest.json",
      taxonomyReportPath: "output/benchmarks/annual-report-unified-failure-taxonomy/latest.json",
    },
    baselineMetrics: [],
    remainingBlockers: [],
    recommendationsForPr80: [],
    output: {
      jsonPath: "output/benchmarks/annual-report-extraction-fixes/latest.json",
      markdownPath: "output/benchmarks/annual-report-extraction-fixes/latest.md",
    },
    safety: {
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    },
    ...overrides,
  };
}

describe("annual-report-go-no-go-readiness-service", () => {
  it("scores GO when evidence is complete and blockers are closed", async () => {
    const report = await buildAnnualReportGoNoGoReadinessReport({
      readLatestGoldSetRun: async () => makeGoldSetRun(),
      readLatestManualReviewRound: async () => makeManualReviewRound(),
      readLatestCalibrationReport: async () => makeCalibrationReport(),
      readLatestTaxonomyReport: async () => makeTaxonomyReport(),
      readLatestExtractionFixReport: async () => makeExtractionFixReport(),
      inspectRuntime: async () => makeRuntime(),
      getShadowConfig: () => ({
        mode: "PERSIST_ARTIFACTS",
        persistUnifiedParserDocument: true,
        persistUnifiedFinancialExtraction: true,
        persistUnifiedNarrativeExtraction: true,
        persistLegacyVsUnifiedComparison: true,
      }),
      now: () => new Date("2026-05-11T13:00:00.000Z"),
    });

    expect(report.decision).toBe("GO");
    expect(report.blockers).toHaveLength(0);
    expect(report.safety.publishSourceOfTruth).toBe("LEGACY");
    expect(report.safety.unifiedMode).toBe("SHADOW_ONLY");
  });

  it("scores CONDITIONAL_GO when blockers are closed but warnings remain", async () => {
    const report = await buildAnnualReportGoNoGoReadinessReport({
      readLatestGoldSetRun: async () => makeGoldSetRun(),
      readLatestManualReviewRound: async () =>
        makeManualReviewRound({
          summary: {
            ...makeManualReviewRound().summary,
            reviewedCount: 3,
            pendingCount: 2,
          },
        }),
      readLatestCalibrationReport: async () => makeCalibrationReport(),
      readLatestTaxonomyReport: async () =>
        makeTaxonomyReport({
          summary: {
            ...makeTaxonomyReport().summary,
            highSeverityIssueCount: 1,
            issueClassCounts: [
              {
                issueClass: "UNIT_SCALE_MISMATCH",
                count: 1,
                severity: "HIGH",
                remediationArea: "unit_scale_normalization",
              },
            ],
          },
        }),
      readLatestExtractionFixReport: async () => makeExtractionFixReport(),
      inspectRuntime: async () => makeRuntime(),
      getShadowConfig: () => ({
        mode: "PERSIST_ARTIFACTS",
        persistUnifiedParserDocument: true,
        persistUnifiedFinancialExtraction: true,
        persistUnifiedNarrativeExtraction: true,
        persistLegacyVsUnifiedComparison: true,
      }),
    });

    expect(report.decision).toBe("CONDITIONAL_GO");
    expect(report.blockers).toHaveLength(0);
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it("scores NO_GO when review evidence and artifact coverage are still blocked", async () => {
    const report = await buildAnnualReportGoNoGoReadinessReport({
      readLatestGoldSetRun: async () =>
        makeGoldSetRun({
          manifest: {
            ...makeGoldSetRun().manifest,
            validation: {
              ...makeGoldSetRun().manifest.validation,
              warnings: ["Gold-set still contains unavailable entries."],
              evidenceQualitySummary: {
                live_local: 0,
                persisted_artifact: 5,
                fixture_only: 0,
                unavailable: 6,
              },
              productionReady: false,
            },
          },
          summary: {
            ...makeGoldSetRun().summary,
            skipCount: 4,
          },
        }),
      readLatestManualReviewRound: async () =>
        makeManualReviewRound({
          summary: {
            ...makeManualReviewRound().summary,
            reviewedCount: 0,
            pendingCount: 5,
            severityCounts: { HIGH: 5, MEDIUM: 0, LOW: 0 },
            missingArtifactCounts: {
              structured_document_json: 5,
              legacy_extraction: 1,
              unified_extraction: 4,
            },
          },
        }),
      readLatestCalibrationReport: async () =>
        makeCalibrationReport({
          thresholdBehavior: {
            ...makeCalibrationReport().thresholdBehavior,
            after: {
              ...makeCalibrationReport().thresholdBehavior.after,
              status: "INSUFFICIENT_EVIDENCE",
            },
          },
          metrics: {
            ...makeCalibrationReport().metrics,
            totalReviewedCases: 0,
            manualReviewRate: null,
          },
        }),
      readLatestTaxonomyReport: async () =>
        makeTaxonomyReport({
          summary: {
            ...makeTaxonomyReport().summary,
            highSeverityIssueCount: 3,
            issueClassCounts: [
              {
                issueClass: "STRUCTURED_DOCUMENT_MISSING",
                count: 5,
                severity: "HIGH",
                remediationArea: "artifact_pipeline",
              },
              {
                issueClass: "PRIMARY_INCOME_STATEMENT_MISSING",
                count: 1,
                severity: "HIGH",
                remediationArea: "financial_mapping",
              },
            ],
          },
        }),
      readLatestExtractionFixReport: async () => makeExtractionFixReport(),
      inspectRuntime: async () =>
        makeRuntime({
          liveHybridBenchmarkReady: false,
          liveHybridBenchmarkReason: "Hybrid URL missing.",
        }),
      getShadowConfig: () => ({
        mode: "PERSIST_ARTIFACTS",
        persistUnifiedParserDocument: true,
        persistUnifiedFinancialExtraction: true,
        persistUnifiedNarrativeExtraction: true,
        persistLegacyVsUnifiedComparison: true,
      }),
    });

    expect(report.decision).toBe("NO_GO");
    expect(report.blockers.some((item) => item.includes("Manuell review-runde"))).toBe(true);
    expect(report.blockers.some((item) => item.includes("Artifact-dekning"))).toBe(true);
  });

  it("renders explicit unknown states when evidence is missing", async () => {
    const report = await buildAnnualReportGoNoGoReadinessReport({
      readLatestGoldSetRun: async () => null,
      readLatestManualReviewRound: async () => null,
      readLatestCalibrationReport: async () => null,
      readLatestTaxonomyReport: async () => null,
      readLatestExtractionFixReport: async () => null,
      inspectRuntime: async () => makeRuntime(),
      getShadowConfig: () => ({
        mode: "DISABLED",
        persistUnifiedParserDocument: false,
        persistUnifiedFinancialExtraction: false,
        persistUnifiedNarrativeExtraction: false,
        persistLegacyVsUnifiedComparison: false,
      }),
    });

    expect(report.decision).toBe("NO_GO");
    expect(report.criteria.some((item) => item.status === "UNKNOWN")).toBe(true);
    expect(report.metricTable.find((item) => item.label === "Gold-set filings")?.value).toBe(
      "Ukjent",
    );
  });

  it("treats data-related skips separately from runtime blockers when runtime is healthy", async () => {
    const report = await buildAnnualReportGoNoGoReadinessReport({
      readLatestGoldSetRun: async () =>
        makeGoldSetRun({
          summary: {
            ...makeGoldSetRun().summary,
            skipCount: 4,
            failCount: 1,
          },
        }),
      readLatestManualReviewRound: async () => makeManualReviewRound(),
      readLatestCalibrationReport: async () => makeCalibrationReport(),
      readLatestTaxonomyReport: async () =>
        makeTaxonomyReport({
          summary: {
            ...makeTaxonomyReport().summary,
            highSeverityIssueCount: 1,
            issueClassCounts: [
              {
                issueClass: "PARSER_RUNTIME_UNAVAILABLE",
                count: 1,
                severity: "HIGH",
                remediationArea: "parser_runtime",
              },
            ],
          },
        }),
      readLatestExtractionFixReport: async () => makeExtractionFixReport(),
      inspectRuntime: async () => makeRuntime(),
      getShadowConfig: () => ({
        mode: "PERSIST_ARTIFACTS",
        persistUnifiedParserDocument: true,
        persistUnifiedFinancialExtraction: true,
        persistUnifiedNarrativeExtraction: true,
        persistLegacyVsUnifiedComparison: true,
      }),
    });

    const shadowRuntimeCriterion = report.criteria.find((item) => item.key === "shadow-runtime");
    const remediationCriterion = report.criteria.find((item) => item.key === "remediation-plan");
    const shadowSkipMetric = report.metricTable.find((item) => item.label === "Shadow skip count");

    expect(shadowRuntimeCriterion?.status).toBe("PASS");
    expect(remediationCriterion?.status).toBe("PASS");
    expect(report.blockers.some((item) => item.includes("Shadow batch kjÃ¸rer uten runtime-blokkere"))).toBe(false);
    expect(shadowSkipMetric?.status).toBe("WARNING");
    expect(shadowSkipMetric?.note).toContain("data-/artifact-relaterte");
  });

  it("renders markdown with decision, blockers and recommendations", async () => {
    const report = await buildAnnualReportGoNoGoReadinessReport({
      readLatestGoldSetRun: async () => makeGoldSetRun(),
      readLatestManualReviewRound: async () => makeManualReviewRound(),
      readLatestCalibrationReport: async () => makeCalibrationReport(),
      readLatestTaxonomyReport: async () => makeTaxonomyReport(),
      readLatestExtractionFixReport: async () => makeExtractionFixReport(),
      inspectRuntime: async () => makeRuntime(),
      getShadowConfig: () => ({
        mode: "PERSIST_ARTIFACTS",
        persistUnifiedParserDocument: true,
        persistUnifiedFinancialExtraction: true,
        persistUnifiedNarrativeExtraction: true,
        persistLegacyVsUnifiedComparison: true,
      }),
    });

    const markdown = renderAnnualReportGoNoGoReadinessMarkdown(report);
    expect(markdown).toContain("PR80 go/no-go readiness report");
    expect(markdown).toContain("Decision: GO");
    expect(markdown).toContain("Recommended next actions for PR81");
  });
});
