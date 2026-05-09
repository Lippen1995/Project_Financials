import { describe, expect, it, vi } from "vitest";

import { buildUnifiedExtractionConfidenceGateReport } from "@/server/services/annual-report-unified-extraction-confidence-gate-service";
import type { UnifiedExtractionConfidenceGateReport } from "@/server/services/annual-report-unified-extraction-confidence-gate-service";
import type { AnnualReportUnifiedShadowResult } from "@/server/services/annual-report-unified-shadow-extraction-service";
import {
  runAnnualReportUnifiedConfidenceBatch,
  summarizeAnnualReportUnifiedConfidenceBatch,
  type AnnualReportUnifiedConfidenceBatchCaseResult,
  type AnnualReportUnifiedConfidenceBatchManifest,
} from "@/server/benchmarking/annual-report-unified-confidence-batch";

type BatchDeps = NonNullable<Parameters<typeof runAnnualReportUnifiedConfidenceBatch>[1]>;
type LoadFiling = NonNullable<BatchDeps["loadFiling"]>;
type FilingRecord = NonNullable<Awaited<ReturnType<LoadFiling>>>;
type PreflightResult = Awaited<ReturnType<NonNullable<BatchDeps["preflight"]>>>;

function makeManifest(
  entries: Array<
    Omit<AnnualReportUnifiedConfidenceBatchManifest["entries"][number], "tagHints"> & {
      tagHints?: string[];
    }
  >,
): AnnualReportUnifiedConfidenceBatchManifest {
  return {
    name: "confidence-batch",
    generatedAt: "2026-05-09T00:00:00.000Z",
    entries: entries.map((entry) => ({
      ...entry,
      tagHints: entry.tagHints ?? [],
    })),
  };
}

function makeBaseShadowResult(overrides: Partial<AnnualReportUnifiedShadowResult> = {}): AnnualReportUnifiedShadowResult {
  return {
    canUseForProductionRouting: false,
    skipped: false,
    mode: "DRY_RUN",
    totalDurationMs: 12,
    document: {
      version: "unified-parser-document-v1",
      generatedAt: "2026-05-09T00:00:00.000Z",
      source: {
        filingId: "filing-1",
        orgNumber: "123456789",
        fiscalYear: 2024,
        sourceSystem: "BRREG",
        sourceEntityType: "ANNUAL_REPORT_FILING",
        sourceId: "filing-1",
        fetchedAt: "2026-05-09T00:00:00.000Z",
        normalizedAt: "2026-05-09T00:00:00.000Z",
      },
      pages: [],
      sections: [],
      pageHints: [],
      warnings: [],
      safety: {
        canUseForProductionRouting: false,
        productionRoutingChanged: false,
        productionFactsMutated: false,
        publishAffected: false,
        shadowOnly: true,
      },
    },
    financial: {
      version: "unified-financial-statement-extraction-v1",
      generatedAt: "2026-05-09T00:00:00.000Z",
      source: {
        filingId: "filing-1",
        orgNumber: "123456789",
        fiscalYear: 2024,
        unifiedDocumentVersion: "unified-parser-document-v1",
      },
      statements: [
        {
          statementId: "income-1",
          kind: "INCOME_STATEMENT",
          title: "Resultat",
          pageStart: 1,
          pageEnd: 1,
          detectedUnitScale: "ONES",
          confidenceScore: 0.95,
          lineItems: [
            {
              canonicalKey: "revenue",
              rawLabel: "Salgsinntekter",
              normalizedLabel: "salgsinntekter",
              value: "1000",
              numericValue: 1000,
              year: 2024,
              unitScale: "ONES",
              pageNumber: 1,
              sourceStatementKind: "INCOME_STATEMENT",
              confidenceScore: 0.95,
            },
          ],
        },
        {
          statementId: "balance-1",
          kind: "BALANCE_SHEET",
          title: "Balanse",
          pageStart: 2,
          pageEnd: 2,
          detectedUnitScale: "ONES",
          confidenceScore: 0.9,
          lineItems: [
            {
              canonicalKey: "total_assets",
              rawLabel: "Sum eiendeler",
              normalizedLabel: "sum eiendeler",
              value: "2000",
              numericValue: 2000,
              year: 2024,
              unitScale: "ONES",
              pageNumber: 2,
              sourceStatementKind: "BALANCE_SHEET",
              confidenceScore: 0.9,
            },
            {
              canonicalKey: "net_income",
              rawLabel: "Årsresultat",
              normalizedLabel: "arsresultat",
              value: "500",
              numericValue: 500,
              year: 2024,
              unitScale: "ONES",
              pageNumber: 1,
              sourceStatementKind: "INCOME_STATEMENT",
              confidenceScore: 0.91,
            },
          ],
        },
      ],
      warnings: [],
      safety: {
        canUseForProductionRouting: false,
        productionRoutingChanged: false,
        productionFactsMutated: false,
        publishAffected: false,
        shadowOnly: true,
      },
    },
    narrative: {
      version: "unified-narrative-extraction-v1",
      generatedAt: "2026-05-09T00:00:00.000Z",
      source: {
        filingId: "filing-1",
        orgNumber: "123456789",
        fiscalYear: 2024,
        unifiedDocumentVersion: "unified-parser-document-v1",
      },
      sections: [
        {
          sectionId: "board-1",
          kind: "BOARD_REPORT",
          title: "Styrets årsberetning",
          pageStart: 1,
          pageEnd: 1,
          textPreview: "styrets arsberetning",
          signals: [],
        },
        {
          sectionId: "auditor-1",
          kind: "AUDITOR_REPORT",
          title: "Revisjonsberetning",
          pageStart: 3,
          pageEnd: 3,
          textPreview: "revisjonsberetning",
          signals: [],
        },
      ],
      metrics: {
        sectionCount: 2,
        boardReportFound: true,
        auditorReportFound: true,
      },
      warnings: [],
      safety: {
        canUseForProductionRouting: false,
        productionRoutingChanged: false,
        productionFactsMutated: false,
        publishAffected: false,
        shadowOnly: true,
      },
    },
    comparison: {
      version: "legacy-vs-unified-comparison-v1",
      generatedAt: "2026-05-09T00:00:00.000Z",
      source: {
        filingId: "filing-1",
        orgNumber: "123456789",
        fiscalYear: 2024,
        legacyCandidateCount: 0,
        unifiedRoute: "TEXT_LAYER",
        unifiedNarrativeRoute: "TEXT_LAYER",
      },
      financialComparisons: [],
      narrativeComparisons: [],
      summary: {
        financialExactMatchCount: 1,
        financialScaledMatchCount: 0,
        financialMismatchCount: 0,
        financialMissingInLegacyCount: 0,
        financialMissingInUnifiedCount: 0,
        financialTotalCompared: 1,
        narrativeBoardReportCovered: true,
        narrativeAuditorReportCovered: true,
        narrativeSignaturesCovered: false,
        narrativeCoverageScore: 1,
      },
      warnings: [],
      safety: {
        canUseForProductionRouting: false,
        productionRoutingChanged: false,
        productionFactsMutated: false,
        publishAffected: false,
        shadowOnly: true,
      },
    },
    steps: {
      document: { ok: true, value: true, durationMs: 1 },
      financial: { ok: true, value: true, durationMs: 2 },
      narrative: { ok: true, value: true, durationMs: 3 },
      comparison: { ok: true, value: true, durationMs: 1 },
    },
    artifacts: {
      document: null,
      financial: null,
      narrative: null,
      comparison: null,
    },
    warnings: [],
    ...overrides,
  } as unknown as AnnualReportUnifiedShadowResult;
}

function makePreflight(): PreflightResult {
  return {
    pageCount: 1,
    hasTextLayer: true,
    hasReliableTextLayer: true,
    parsedPages: [],
  } as PreflightResult;
}

function makeFiling(
  overrides: Omit<Partial<FilingRecord>, "artifacts"> & {
    artifacts?: Array<Partial<FilingRecord["artifacts"][number]>>;
  } = {},
): FilingRecord {
  const baseArtifacts =
    overrides.artifacts?.map((artifact, index) => ({
      id: artifact.id ?? `artifact-${index + 1}`,
      createdAt: artifact.createdAt ?? new Date("2026-05-09T00:00:00.000Z"),
      filingId: artifact.filingId ?? "filing-1",
      metadata: artifact.metadata ?? {},
      artifactType: artifact.artifactType ?? "PDF",
      storageKey: artifact.storageKey ?? "filing-1.pdf",
      checksum: artifact.checksum ?? "checksum",
      mimeType: artifact.mimeType ?? "application/pdf",
    })) ?? [
      {
        id: "artifact-1",
        createdAt: new Date("2026-05-09T00:00:00.000Z"),
        filingId: "filing-1",
        metadata: {},
        artifactType: "PDF",
        storageKey: "filing-1.pdf",
        checksum: "checksum",
        mimeType: "application/pdf",
      },
    ];

  return {
    id: "filing-1",
    fiscalYear: 2024,
    company: { id: "company-1", orgNumber: "123456789", name: "Example AS" },
    artifacts: baseArtifacts,
    extractionRuns: [],
    reviews: [],
    ...overrides,
  } as unknown as FilingRecord;
}

function makeCase(
  overrides: Partial<AnnualReportUnifiedConfidenceBatchCaseResult> & {
    overallVerdict?: "PASS" | "WARN" | "FAIL" | "INSUFFICIENT_DATA";
    blockingCheckCodes?: string[];
    warningCheckCodes?: string[];
  } = {},
): AnnualReportUnifiedConfidenceBatchCaseResult {
  const gate =
    overrides.overallVerdict === undefined
      ? null
      : {
          version: "unified-extraction-confidence-gate-v1" as const,
          generatedAt: "2026-05-09T00:00:00.000Z",
          meta: { filingId: "filing-1", orgNumber: "123456789", fiscalYear: 2024 },
          safety: {
            canUseForProductionRouting: false as const,
            productionRoutingChanged: false as const,
            productionFactsMutated: false as const,
            publishAffected: false as const,
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
          overallVerdict: overrides.overallVerdict,
          passCount: overrides.overallVerdict === "PASS" ? 1 : 0,
          warnCount: overrides.overallVerdict === "WARN" ? 1 : 0,
          failCount: overrides.overallVerdict === "FAIL" ? 1 : 0,
          insufficientDataCount: overrides.overallVerdict === "INSUFFICIENT_DATA" ? 1 : 0,
          blockingChecks: (overrides.blockingCheckCodes ?? []).map((checkCode) => ({
            checkCode: checkCode as never,
            verdict: "FAIL" as const,
            message: checkCode,
            value: null,
            threshold: null,
          })),
          warningChecks: (overrides.warningCheckCodes ?? []).map((checkCode) => ({
            checkCode: checkCode as never,
            verdict: "WARN" as const,
            message: checkCode,
            value: null,
            threshold: null,
          })),
          checks: [],
        } as unknown as UnifiedExtractionConfidenceGateReport;
  return {
    caseId: "case-1",
    filingId: "filing-1",
    orgNumber: "123456789",
    companyName: "Example AS",
    fiscalYear: 2024,
    label: "Example AS 2024",
    tagHints: [],
    status: "completed",
    errors: [],
    warnings: [],
    durationMs: 10,
    shadow: {
      mode: "DRY_RUN",
      skipped: false,
      totalDurationMs: 10,
      canUseForProductionRouting: false,
      steps: {
        document: { ok: true, durationMs: 1, error: null },
        financial: { ok: true, durationMs: 1, error: null },
        narrative: { ok: true, durationMs: 1, error: null },
        comparison: { ok: true, durationMs: 1, error: null },
      },
      summary: {
        documentPageCount: 2,
        documentSectionCount: 2,
        financialStatementCount: 2,
        financialLineItemCount: 3,
        narrativeSectionCount: 2,
        comparisonFactCount: 1,
        comparisonExactMatchCount: 1,
        comparisonMismatchCount: 0,
        comparisonMatchRate: 1,
      },
    },
    gate,
    gateSummary: {
      overallVerdict: gate?.overallVerdict ?? null,
      passCount: gate?.passCount ?? 0,
      warnCount: gate?.warnCount ?? 0,
      failCount: gate?.failCount ?? 0,
      insufficientDataCount: gate?.insufficientDataCount ?? 0,
      blockingCheckCodes: overrides.blockingCheckCodes ?? [],
      warningCheckCodes: overrides.warningCheckCodes ?? [],
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

describe("annual-report-unified-confidence-batch", () => {
  it("summarizes verdict counts and common checks correctly", () => {
    const summary = summarizeAnnualReportUnifiedConfidenceBatch(
      [
        makeCase({ overallVerdict: "PASS" }),
        makeCase({
          caseId: "case-2",
          overallVerdict: "FAIL",
          blockingCheckCodes: ["COMPARISON_MATCH_RATE", "SAFETY_FLAGS_CLEAN"],
        }),
        makeCase({
          caseId: "case-3",
          overallVerdict: "WARN",
          warningCheckCodes: ["BOARD_REPORT_FOUND", "BOARD_REPORT_FOUND"],
        }),
        makeCase({
          caseId: "case-4",
          overallVerdict: "INSUFFICIENT_DATA",
          status: "skipped",
          shadow: null,
        }),
      ],
      55,
    );

    expect(summary.verdictCounts).toEqual({
      PASS: 1,
      WARN: 1,
      FAIL: 1,
      INSUFFICIENT_DATA: 1,
    });
    expect(summary.completedCases).toBe(3);
    expect(summary.skippedCases).toBe(1);
    expect(summary.errorCases).toBe(0);
    expect(summary.mostCommonFailingChecks[0]).toEqual({
      checkCode: "COMPARISON_MATCH_RATE",
      count: 1,
    });
    expect(summary.mostCommonWarningChecks[0]).toEqual({
      checkCode: "BOARD_REPORT_FOUND",
      count: 2,
    });
    expect(summary.totalDurationMs).toBe(55);
  });

  it("marks missing filing as error with clear message", async () => {
    const result = await runAnnualReportUnifiedConfidenceBatch(
      {
        manifest: makeManifest([{ filingId: "missing-filing" }]),
      },
      {
        loadFiling: vi.fn(async () => null),
      },
    );

    expect(result.cases[0]?.status).toBe("error");
    expect(result.cases[0]?.errors[0]).toContain("Filing not found");
  });

  it("marks missing PDF artifact as skipped with clear warning and insufficient-data gate", async () => {
    const result = await runAnnualReportUnifiedConfidenceBatch(
      {
        manifest: makeManifest([{ filingId: "filing-1" }]),
      },
      {
        loadFiling: vi.fn(async () => makeFiling({ artifacts: [] })),
      },
    );

    expect(result.cases[0]?.status).toBe("skipped");
    expect(result.cases[0]?.warnings[0]).toContain("No PDF artifact");
    expect(result.cases[0]?.gateSummary.overallVerdict).toBe("INSUFFICIENT_DATA");
  });

  it("captures shadow extraction exceptions and continues with later cases", async () => {
    const loadFiling = vi.fn(async (filingId: string) =>
      makeFiling({
        id: filingId,
        artifacts: [{ artifactType: "PDF", storageKey: `${filingId}.pdf` }],
      }),
    );
    const runShadowExtraction = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(makeBaseShadowResult());

    const result = await runAnnualReportUnifiedConfidenceBatch(
      {
        manifest: makeManifest([{ filingId: "filing-1" }, { filingId: "filing-2" }]),
      },
      {
        loadFiling,
        loadPdfArtifactBuffer: vi.fn(async () => Buffer.from("pdf")),
        preflight: vi.fn(async () => makePreflight()),
        runShadowExtraction,
      },
    );

    expect(result.cases[0]?.status).toBe("error");
    expect(result.cases[0]?.errors[0]).toContain("Shadow extraction failed");
    expect(result.cases[0]?.gateSummary.overallVerdict).toBe("INSUFFICIENT_DATA");
    expect(result.cases[1]?.status).toBe("completed");
    expect(runShadowExtraction).toHaveBeenCalledTimes(2);
  });

  it("produces a gate report with insufficient data when partial data is absent", async () => {
    const result = await runAnnualReportUnifiedConfidenceBatch(
      {
        manifest: makeManifest([{ filingId: "filing-1" }]),
      },
      {
        loadFiling: vi.fn(async () => makeFiling()),
        loadPdfArtifactBuffer: vi.fn(async () => Buffer.from("pdf")),
        preflight: vi.fn(async () => makePreflight()),
        runShadowExtraction: vi.fn(async () =>
          makeBaseShadowResult({
            financial: null,
            narrative: null,
            comparison: null,
            steps: {
              document: { ok: true, value: true, durationMs: 1 },
              financial: null,
              narrative: null,
              comparison: null,
            },
          }),
        ),
      },
    );

    expect(result.cases[0]?.gate).not.toBeNull();
    expect(result.cases[0]?.gateSummary.overallVerdict).toBe("INSUFFICIENT_DATA");
  });

  it("does not persist gate artifacts by default", async () => {
    const persistConfidenceGateArtifact = vi.fn();

    await runAnnualReportUnifiedConfidenceBatch(
      {
        manifest: makeManifest([{ filingId: "filing-1" }]),
      },
      {
        loadFiling: vi.fn(async () => makeFiling()),
        loadPdfArtifactBuffer: vi.fn(async () => Buffer.from("pdf")),
        preflight: vi.fn(async () => makePreflight()),
        runShadowExtraction: vi.fn(async () => makeBaseShadowResult()),
        persistConfidenceGateArtifact,
      },
    );

    expect(persistConfidenceGateArtifact).not.toHaveBeenCalled();
  });

  it("persists gate artifacts only when explicitly enabled", async () => {
    const persistConfidenceGateArtifact = vi.fn(async () => ({
      artifactId: "artifact-1",
      kind: "UNIFIED_EXTRACTION_CONFIDENCE_GATE",
      createdAt: new Date(),
      summary: {},
    }));

    await runAnnualReportUnifiedConfidenceBatch(
      {
        manifest: makeManifest([{ filingId: "filing-1" }]),
        mode: "PERSIST_ARTIFACTS",
        persistConfidenceGateArtifacts: true,
      },
      {
        loadFiling: vi.fn(async () => makeFiling()),
        loadPdfArtifactBuffer: vi.fn(async () => Buffer.from("pdf")),
        preflight: vi.fn(async () => makePreflight()),
        runShadowExtraction: vi.fn(async () => makeBaseShadowResult({ mode: "PERSIST_ARTIFACTS" })),
        persistConfidenceGateArtifact,
      },
    );

    expect(persistConfidenceGateArtifact).toHaveBeenCalledTimes(1);
  });

  it("preserves safety invariants as false", async () => {
    const result = await runAnnualReportUnifiedConfidenceBatch(
      {
        manifest: makeManifest([{ filingId: "filing-1" }]),
      },
      {
        loadFiling: vi.fn(async () => makeFiling()),
        loadPdfArtifactBuffer: vi.fn(async () => Buffer.from("pdf")),
        preflight: vi.fn(async () => makePreflight()),
        runShadowExtraction: vi.fn(async () => makeBaseShadowResult()),
      },
    );

    const caseResult = result.cases[0]!;
    expect(caseResult.safety).toEqual({
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    });
    expect(caseResult.shadow?.canUseForProductionRouting).toBe(false);
    expect(caseResult.gate?.safety.canUseForProductionRouting).toBe(false);
    expect(result.summary.safetyInvariantViolations).toEqual([]);
  });

  it("aggregates fail and warning checks from actual gate reports", async () => {
    const goodShadow = makeBaseShadowResult();
    const weakShadow = makeBaseShadowResult({
      financial: {
        ...makeBaseShadowResult().financial!,
        statements: [],
      },
      comparison: {
        ...makeBaseShadowResult().comparison!,
        financialComparisons: [
          {
            canonicalKey: "revenue",
            year: 2024,
            legacyValueNok: "1000",
            unifiedValueNok: "100",
            deltaNok: "-900",
            match: "MISMATCH",
            relativeDeviation: 0.9,
          },
        ],
        summary: {
          ...makeBaseShadowResult().comparison!.summary,
          financialExactMatchCount: 0,
          financialScaledMatchCount: 0,
          financialMismatchCount: 1,
          financialTotalCompared: 1,
        },
      },
    });

    const result = await runAnnualReportUnifiedConfidenceBatch(
      {
        manifest: makeManifest([{ filingId: "filing-1" }, { filingId: "filing-2" }]),
      },
      {
        loadFiling: vi.fn(async (filingId: string) =>
          makeFiling({
            id: filingId,
            artifacts: [{ artifactType: "PDF", storageKey: `${filingId}.pdf` }],
          }),
        ),
        loadPdfArtifactBuffer: vi.fn(async () => Buffer.from("pdf")),
        preflight: vi.fn(async () => makePreflight()),
        runShadowExtraction: vi
          .fn()
          .mockResolvedValueOnce(goodShadow)
          .mockResolvedValueOnce(weakShadow),
        buildGateReport: buildUnifiedExtractionConfidenceGateReport,
      },
    );

    expect(result.summary.verdictCounts.PASS).toBeGreaterThanOrEqual(1);
    expect(result.summary.verdictCounts.FAIL).toBeGreaterThanOrEqual(1);
    expect(
      result.summary.mostCommonFailingChecks.some((check) => check.checkCode === "FINANCIAL_EXTRACTION_PRESENT"),
    ).toBe(true);
  });
});
