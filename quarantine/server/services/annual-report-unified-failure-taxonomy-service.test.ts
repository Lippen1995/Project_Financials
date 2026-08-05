import { describe, expect, it } from "vitest";

import type {
  AnnualReportManualReviewCandidate,
  AnnualReportManualReviewRound,
} from "@/server/services/annual-report-manual-review-round-service";
import {
  buildAnnualReportUnifiedFailureTaxonomyReport,
  renderAnnualReportUnifiedFailureTaxonomyMarkdown,
} from "@/server/services/annual-report-unified-failure-taxonomy-service";

function makeCandidate(
  overrides: Partial<AnnualReportManualReviewCandidate> = {},
): AnnualReportManualReviewCandidate {
  return {
    candidateId: "candidate-1",
    reviewRoundId: "gold-set-2026-05-11",
    runId: "gold-set-2026-05-11",
    orgNumber: "123456789",
    companyName: "Eksempel AS",
    accountingYear: 2024,
    filingId: "filing-1",
    reportId: "report-1",
    documentRef: "source.pdf",
    tags: [],
    evidenceType: "persisted_artifact",
    evidenceQuality: "real_legacy_candidate",
    confidenceGateResult: "WARN",
    comparisonResult: {
      mismatchCount: 1,
      narrativeMismatchCount: 0,
      exactMatchCount: 4,
      matchRate: 0.8,
    },
    firstDivergenceStage: "comparison",
    severity: "MEDIUM",
    reviewReasons: ["Legacy og unified har mismatch i shadow-sammenligningen."],
    issueClasses: ["shadow_comparison_mismatch"],
    financialComparisons: [],
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
    ],
    confidenceGateDiagnostics: [],
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
    reviewRoundId: "gold-set-2026-05-11",
    generatedAt: "2026-05-11T09:00:00.000Z",
    sourceRun: {
      runId: "gold-set-2026-05-11",
      generatedAt: "2026-05-11T08:45:00.000Z",
      manifestName: "go-live-gold-set",
      manifestHash: "hash",
      gitCommitSha: "abc123",
    },
    summary: {
      totalFilings: candidates.length,
      reviewCandidateCount: candidates.length,
      reviewedCount: candidates.filter((item) => item.status === "REVIEWED").length,
      pendingCount: candidates.filter((item) => item.status === "PENDING").length,
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
    decisions: [],
    diagnostics: [],
    recommendedNextActions: {
      pr77Calibration: [],
      pr78FailureTaxonomy: [],
      pr79ExtractionFixes: [],
    },
  };
}

describe("annual-report-unified-failure-taxonomy-service", () => {
  it("maps confidence gate reasons to stable taxonomy classes", async () => {
    const round = makeRound([
      makeCandidate({
        confidenceGateDiagnostics: [
          {
            checkCode: "UNIT_SCALE_RESOLVED",
            verdict: "FAIL",
            message: "Unknown unit scale.",
          },
          {
            checkCode: "INCOME_STATEMENT_COVERAGE",
            verdict: "FAIL",
            message: "Income statement missing.",
          },
          {
            checkCode: "BOARD_REPORT_FOUND",
            verdict: "WARN",
            message: "Board report missing.",
          },
        ],
      }),
    ]);

    const report = await buildAnnualReportUnifiedFailureTaxonomyReport(
      {},
      {
        readLatestManualReviewRound: async () => round,
        now: () => new Date("2026-05-11T09:30:00.000Z"),
      },
    );

    expect(report.issues.map((item) => item.issueClass)).toEqual(
      expect.arrayContaining([
        "UNIT_SCALE_UNKNOWN",
        "PRIMARY_INCOME_STATEMENT_MISSING",
        "BOARD_REPORT_MISSING",
      ]),
    );
  });

  it("maps missing artifacts to specific and general artifact classes", async () => {
    const round = makeRound([
      makeCandidate({
        artifactRefs: [
          {
            key: "source_pdf",
            label: "Source PDF",
            status: "missing",
            artifactId: null,
            storageKey: null,
            artifactType: "PDF",
            kind: null,
            href: null,
            note: null,
          },
          {
            key: "structured_document_json",
            label: "Structured document JSON",
            status: "missing",
            artifactId: null,
            storageKey: null,
            artifactType: "STRUCTURED_DOCUMENT_JSON",
            kind: null,
            href: null,
            note: null,
          },
        ],
      }),
    ]);

    const report = await buildAnnualReportUnifiedFailureTaxonomyReport(
      {},
      {
        readLatestManualReviewRound: async () => round,
      },
    );

    expect(report.issues.map((item) => item.issueClass)).toEqual(
      expect.arrayContaining([
        "SOURCE_PDF_MISSING",
        "STRUCTURED_DOCUMENT_MISSING",
        "ARTIFACT_MISSING",
      ]),
    );
  });

  it("maps unit scale and tag risk signals into taxonomy", async () => {
    const round = makeRound([
      makeCandidate({
        tags: ["unit_scale_sensitive", "manual_review_expected"],
        issueClasses: ["unit_scale_ambiguity", "tag:unit_scale_sensitive", "tag:manual_review_expected"],
        financialComparisons: [
          {
            canonicalKey: "revenue",
            fiscalYear: 2024,
            legacyValueNok: "1000000",
            unifiedValueNok: "1000",
            deltaNok: "-999000",
            match: "UNIT_SCALE_ADJUSTED",
            relativeDeviation: 0.999,
            legacyLabel: "Sum driftsinntekter",
            unifiedLabel: "Sum driftsinntekter",
            legacyUnitScale: 1,
            unifiedUnitScale: "UNKNOWN",
            reviewRequired: true,
          },
        ],
      }),
    ]);

    const report = await buildAnnualReportUnifiedFailureTaxonomyReport(
      {},
      {
        readLatestManualReviewRound: async () => round,
      },
    );

    expect(report.issues.map((item) => item.issueClass)).toEqual(
      expect.arrayContaining([
        "UNIT_SCALE_UNKNOWN",
        "UNIT_SCALE_MISMATCH",
        "MANUAL_REVIEW_EXPECTED",
      ]),
    );
  });

  it("maps Norwegian label issues and continuation-heavy balance cases", async () => {
    const round = makeRound([
      makeCandidate({
        tags: ["continuation_complex", "formatting_edge"],
        issueClasses: ["norwegian_statement_line_item_conflict", "tag:continuation_complex"],
        financialComparisons: [
          {
            canonicalKey: "total_assets",
            fiscalYear: 2024,
            legacyValueNok: "2500000",
            unifiedValueNok: "2000000",
            deltaNok: "-500000",
            match: "CONFLICTING_VALUES",
            relativeDeviation: 0.25,
            legacyLabel: "Sum eiendeler",
            unifiedLabel: "Eiendeler totalt",
            legacyUnitScale: 1,
            unifiedUnitScale: "ONES",
            reviewRequired: true,
          },
        ],
        diagnostics: ["Tabellrekonstruksjon feilet nær sideskift og kolonnejustering."],
      }),
    ]);

    const report = await buildAnnualReportUnifiedFailureTaxonomyReport(
      {},
      {
        readLatestManualReviewRound: async () => round,
      },
    );

    expect(report.issues.map((item) => item.issueClass)).toEqual(
      expect.arrayContaining([
        "NORWEGIAN_LABEL_MAPPING_ERROR",
        "MULTI_PAGE_BALANCE_ERROR",
        "TABLE_RECONSTRUCTION_ERROR",
        "COLUMN_ALIGNMENT_ERROR",
      ]),
    );
  });

  it("maps unknown raw issue classes to UNKNOWN_FAILURE", async () => {
    const round = makeRound([
      makeCandidate({
        issueClasses: ["mystery_problem"],
        reviewReasons: ["Noe gikk galt uten kjent klassifisering."],
      }),
    ]);

    const report = await buildAnnualReportUnifiedFailureTaxonomyReport(
      {},
      {
        readLatestManualReviewRound: async () => round,
      },
    );

    expect(report.issues.some((item) => item.issueClass === "UNKNOWN_FAILURE")).toBe(true);
  });

  it("aggregates summary counts and renders markdown output", async () => {
    const round = makeRound([
      makeCandidate({
        severity: "HIGH",
        tags: ["scan_or_ocr"],
        issueClasses: ["unit_scale_ambiguity"],
        financialComparisons: [
          {
            canonicalKey: "revenue",
            fiscalYear: 2024,
            legacyValueNok: "1000000",
            unifiedValueNok: null,
            deltaNok: null,
            match: "MISSING_IN_UNIFIED",
            relativeDeviation: null,
            legacyLabel: "Sum driftsinntekter",
            unifiedLabel: null,
            legacyUnitScale: 1,
            unifiedUnitScale: null,
            reviewRequired: true,
          },
        ],
      }),
      makeCandidate({
        candidateId: "candidate-2",
        filingId: "filing-2",
        companyName: "Kontroll AS",
        severity: "MEDIUM",
        issueClasses: ["narrative_mismatch"],
        narrativeComparisons: [
          { kind: "AUDITOR_REPORT", legacyFound: true, unifiedFound: false, textSimilarity: 0.2 },
        ],
      }),
    ]);

    const report = await buildAnnualReportUnifiedFailureTaxonomyReport(
      {},
      {
        readLatestManualReviewRound: async () => round,
        now: () => new Date("2026-05-11T09:30:00.000Z"),
      },
    );

    expect(report.summary.totalCandidates).toBe(2);
    expect(report.summary.totalMappedIssues).toBeGreaterThanOrEqual(4);
    expect(report.summary.highSeverityIssueCount).toBeGreaterThan(0);
    expect(report.summary.issueClassCounts[0]).toBeDefined();

    const markdown = renderAnnualReportUnifiedFailureTaxonomyMarkdown(report);
    expect(markdown).toContain("# Unified failure taxonomy");
    expect(markdown).toContain("## Top issue classes");
    expect(markdown).toContain("## PR79 recommendations");
  });
});

