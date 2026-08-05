import {
  PdfModelArtifactKind,
  PdfModelArtifactStatus,
  type PdfModelArtifactSnapshot,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type {
  UnifiedExtractionConfidenceGateReport,
  UnifiedExtractionGateCheckResult,
} from "@/server/services/annual-report-unified-extraction-confidence-gate-service";
import {
  getUnifiedConfidenceGateResultForAdmin,
  listUnifiedConfidenceGateResultsForAdmin,
} from "@/server/services/annual-report-unified-confidence-admin-service";

function makeArtifact(
  overrides: Partial<PdfModelArtifactSnapshot> = {},
): PdfModelArtifactSnapshot {
  return {
    id: "artifact-1",
    kind: PdfModelArtifactKind.UNIFIED_EXTRACTION_CONFIDENCE_GATE,
    status: PdfModelArtifactStatus.CREATED,
    modelId: null,
    modelVersion: null,
    modelTarget: null,
    featureSchemaVersion: null,
    fiscalYear: 2024,
    orgNumber: "123456789",
    split: null,
    summary: {
      filingId: "filing-1",
      orgNumber: "123456789",
      fiscalYear: 2024,
      overallVerdict: "PASS",
      passCount: 11,
      warnCount: 1,
      failCount: 0,
      insufficientDataCount: 2,
    },
    payload: {},
    sourceCommand: "test-command",
    sourceCommitSha: "abc123",
    createdByUserId: null,
    createdAt: new Date("2026-05-09T12:00:00.000Z"),
    updatedAt: new Date("2026-05-09T12:00:00.000Z"),
    ...overrides,
  };
}

function makeGateReport(
  overrides: Partial<UnifiedExtractionConfidenceGateReport> = {},
): UnifiedExtractionConfidenceGateReport {
  const checks: UnifiedExtractionGateCheckResult[] = [
    {
      checkCode: "FINANCIAL_EXTRACTION_PRESENT",
      verdict: "PASS" as const,
      message: "Financial extraction present.",
      value: 3,
      threshold: null,
    },
    {
      checkCode: "UNIT_SCALE_RESOLVED",
      verdict: "PASS" as const,
      message: "Unit scale resolved.",
      value: 1,
      threshold: null,
    },
    {
      checkCode: "INCOME_STATEMENT_COVERAGE",
      verdict: "PASS" as const,
      message: "Income statement covered.",
      value: 1,
      threshold: null,
    },
    {
      checkCode: "BALANCE_SHEET_COVERAGE",
      verdict: "PASS" as const,
      message: "Balance sheet covered.",
      value: 1,
      threshold: null,
    },
    {
      checkCode: "REVENUE_FOUND",
      verdict: "PASS" as const,
      message: "Revenue found.",
      value: 1,
      threshold: null,
    },
    {
      checkCode: "NET_INCOME_FOUND",
      verdict: "PASS" as const,
      message: "Net income found.",
      value: 1,
      threshold: null,
    },
    {
      checkCode: "TOTAL_ASSETS_FOUND",
      verdict: "PASS" as const,
      message: "Total assets found.",
      value: 1,
      threshold: null,
    },
    {
      checkCode: "CANONICAL_KEY_COVERAGE",
      verdict: "PASS" as const,
      message: "Coverage healthy.",
      value: 0.8,
      threshold: 0.5,
    },
    {
      checkCode: "NARRATIVE_EXTRACTION_PRESENT",
      verdict: "PASS" as const,
      message: "Narrative extraction present.",
      value: 1,
      threshold: null,
    },
    {
      checkCode: "BOARD_REPORT_FOUND",
      verdict: "WARN" as const,
      message: "Board report missing.",
      value: null,
      threshold: null,
    },
    {
      checkCode: "AUDITOR_REPORT_FOUND",
      verdict: "PASS" as const,
      message: "Auditor report found.",
      value: 1,
      threshold: null,
    },
    {
      checkCode: "COMPARISON_MATCH_RATE",
      verdict: "PASS" as const,
      message: "Comparison match rate healthy.",
      value: 0.8,
      threshold: 0.5,
    },
    {
      checkCode: "COMPARISON_NO_MAJOR_MISMATCHES",
      verdict: "INSUFFICIENT_DATA" as const,
      message: "No comparison mismatches available.",
      value: null,
      threshold: null,
    },
    {
      checkCode: "SAFETY_FLAGS_CLEAN",
      verdict: "INSUFFICIENT_DATA" as const,
      message: "Safety flags not available.",
      value: null,
      threshold: null,
    },
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
    passCount: 11,
    warnCount: 1,
    failCount: 0,
    insufficientDataCount: 2,
    blockingChecks: [],
    warningChecks: [
      {
        checkCode: "BOARD_REPORT_FOUND",
        verdict: "WARN",
        message: "Board report missing.",
        value: null,
        threshold: null,
      },
    ],
    checks,
    ...overrides,
  };
}

function makeFiling(overrides: Record<string, unknown> = {}) {
  return {
    id: "filing-1",
    fiscalYear: 2024,
    company: {
      id: "company-1",
      orgNumber: "123456789",
      name: "Example AS",
    },
    ...overrides,
  };
}

function makeRelatedArtifact(
  kind: PdfModelArtifactKind,
  summary: Record<string, unknown>,
): PdfModelArtifactSnapshot {
  return makeArtifact({
    id: `artifact-${kind}`,
    kind,
    summary: summary as never,
    payload: {
      source: {
        filingId: summary.filingId,
        orgNumber: summary.orgNumber,
        fiscalYear: summary.fiscalYear,
      },
    } as never,
  });
}

describe("annual-report-unified-confidence-admin-service", () => {
  it("lists results from valid confidence gate artifacts", async () => {
    const report = makeGateReport();
    const listArtifacts = vi.fn(async () => [
      makeArtifact({
        payload: report,
      }),
      makeRelatedArtifact(PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION, {
        filingId: "filing-1",
        orgNumber: "123456789",
        fiscalYear: 2024,
        parsedLineItemCount: 24,
        statementCount: 2,
      }),
      makeRelatedArtifact(PdfModelArtifactKind.UNIFIED_NARRATIVE_EXTRACTION, {
        filingId: "filing-1",
        orgNumber: "123456789",
        fiscalYear: 2024,
        sectionCount: 3,
      }),
      makeRelatedArtifact(PdfModelArtifactKind.LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON, {
        filingId: "filing-1",
        orgNumber: "123456789",
        fiscalYear: 2024,
        totalCompared: 10,
        exactMatchCount: 8,
        mismatchCount: 2,
      }),
    ]);

    const result = await listUnifiedConfidenceGateResultsForAdmin(
      {},
      {
        listArtifacts,
        listFilingsByIds: vi.fn(async () => [makeFiling() as never]),
      },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      filingId: "filing-1",
      companyName: "Example AS",
      gateVerdict: "PASS",
      passCount: 11,
      warnCount: 1,
      financialLineItemCount: 24,
      narrativeSectionCount: 3,
    });
    expect(result.items[0]?.comparisonMatchRate).toBeCloseTo(0.8);
    expect(result.summary).toMatchObject({
      total: 1,
      PASS: 1,
      WARN: 0,
      FAIL: 0,
      INSUFFICIENT_DATA: 0,
    });
  });

  it("filters by verdict", async () => {
    const passArtifact = makeArtifact({
      payload: makeGateReport(),
    });
    const failArtifact = makeArtifact({
      id: "artifact-2",
      summary: {
        filingId: "filing-2",
        orgNumber: "987654321",
        fiscalYear: 2023,
        overallVerdict: "FAIL",
        passCount: 8,
        warnCount: 1,
        failCount: 2,
        insufficientDataCount: 3,
      },
      payload: makeGateReport({
        meta: { filingId: "filing-2", orgNumber: "987654321", fiscalYear: 2023 },
        overallVerdict: "FAIL",
        failCount: 2,
        blockingChecks: [
          {
            checkCode: "COMPARISON_MATCH_RATE",
            verdict: "FAIL",
            message: "Too many mismatches.",
            value: 0.3,
            threshold: 0.5,
          },
        ],
      }),
      fiscalYear: 2023,
      orgNumber: "987654321",
    });

    const result = await listUnifiedConfidenceGateResultsForAdmin(
      { verdict: "FAIL" },
      {
        listArtifacts: vi.fn(async () => [passArtifact, failArtifact]),
        listFilingsByIds: vi.fn(async () => [
          makeFiling() as never,
          makeFiling({
            id: "filing-2",
            fiscalYear: 2023,
            company: { id: "company-2", orgNumber: "987654321", name: "Second AS" },
          }) as never,
        ]),
      },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.filingId).toBe("filing-2");
  });

  it("filters by fiscal year", async () => {
    const result = await listUnifiedConfidenceGateResultsForAdmin(
      { fiscalYear: 2024 },
      {
        listArtifacts: vi.fn(async () => [
          makeArtifact({ payload: makeGateReport(), fiscalYear: 2024 }),
          makeArtifact({
            id: "artifact-2",
            fiscalYear: 2023,
            orgNumber: "987654321",
            summary: {
              filingId: "filing-2",
              orgNumber: "987654321",
              fiscalYear: 2023,
              overallVerdict: "PASS",
              passCount: 12,
              warnCount: 0,
              failCount: 0,
              insufficientDataCount: 2,
            },
            payload: makeGateReport({
              meta: { filingId: "filing-2", orgNumber: "987654321", fiscalYear: 2023 },
              generatedAt: "2026-05-09T11:00:00.000Z",
            }),
          }),
        ]),
        listFilingsByIds: vi.fn(async () => [makeFiling() as never, makeFiling({ id: "filing-2" }) as never]),
      },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.fiscalYear).toBe(2024);
  });

  it("filters by org number", async () => {
    const result = await listUnifiedConfidenceGateResultsForAdmin(
      { orgNumber: "123456789" },
      {
        listArtifacts: vi.fn(async () => [makeArtifact({ payload: makeGateReport() })]),
        listFilingsByIds: vi.fn(async () => [makeFiling() as never]),
      },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.orgNumber).toBe("123456789");
  });

  it("filters by check code", async () => {
    const result = await listUnifiedConfidenceGateResultsForAdmin(
      { checkCode: "BOARD_REPORT_FOUND" },
      {
        listArtifacts: vi.fn(async () => [makeArtifact({ payload: makeGateReport() })]),
        listFilingsByIds: vi.fn(async () => [makeFiling() as never]),
      },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.warningCheckCodes).toContain("BOARD_REPORT_FOUND");
  });

  it("treats malformed payloads as error rows instead of crashing", async () => {
    const malformed = makeArtifact({
      payload: {
        version: "unified-extraction-confidence-gate-v1",
        generatedAt: "2026-05-09T12:00:00.000Z",
        meta: { filingId: "filing-1", orgNumber: "123456789", fiscalYear: 2024 },
        safety: {
          canUseForProductionRouting: true,
          productionRoutingChanged: false,
          productionFactsMutated: false,
          publishAffected: false,
        },
        overallVerdict: "FAIL",
        passCount: 0,
        warnCount: 0,
        failCount: 1,
        insufficientDataCount: 0,
        checks: [],
      },
    });

    const result = await listUnifiedConfidenceGateResultsForAdmin(
      {},
      {
        listArtifacts: vi.fn(async () => [malformed]),
        listFilingsByIds: vi.fn(async () => [makeFiling() as never]),
      },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.status).toBe("error");
    expect(result.items[0]?.errors.join(" ")).toContain("safety.canUseForProductionRouting");
  });

  it("detail lookup returns one filing with safety flags and checks", async () => {
    const report = makeGateReport({
      overallVerdict: "FAIL",
      passCount: 12,
      warnCount: 1,
      failCount: 1,
      insufficientDataCount: 0,
      blockingChecks: [
        {
          checkCode: "COMPARISON_MATCH_RATE",
          verdict: "FAIL",
          message: "Too many mismatches.",
          value: 0.2,
          threshold: 0.5,
        },
      ],
      checks: [
        {
          checkCode: "FINANCIAL_EXTRACTION_PRESENT",
          verdict: "PASS",
          message: "Financial extraction present.",
          value: 3,
          threshold: null,
        },
        {
          checkCode: "UNIT_SCALE_RESOLVED",
          verdict: "PASS",
          message: "Unit scale resolved.",
          value: 1,
          threshold: null,
        },
        {
          checkCode: "INCOME_STATEMENT_COVERAGE",
          verdict: "PASS",
          message: "Income statement covered.",
          value: 1,
          threshold: null,
        },
        {
          checkCode: "BALANCE_SHEET_COVERAGE",
          verdict: "PASS",
          message: "Balance sheet covered.",
          value: 1,
          threshold: null,
        },
        {
          checkCode: "REVENUE_FOUND",
          verdict: "PASS",
          message: "Revenue found.",
          value: 1,
          threshold: null,
        },
        {
          checkCode: "NET_INCOME_FOUND",
          verdict: "PASS",
          message: "Net income found.",
          value: 1,
          threshold: null,
        },
        {
          checkCode: "TOTAL_ASSETS_FOUND",
          verdict: "PASS",
          message: "Total assets found.",
          value: 1,
          threshold: null,
        },
        {
          checkCode: "CANONICAL_KEY_COVERAGE",
          verdict: "PASS",
          message: "Coverage healthy.",
          value: 0.8,
          threshold: 0.5,
        },
        {
          checkCode: "NARRATIVE_EXTRACTION_PRESENT",
          verdict: "PASS",
          message: "Narrative extraction present.",
          value: 1,
          threshold: null,
        },
        {
          checkCode: "BOARD_REPORT_FOUND",
          verdict: "WARN",
          message: "Board report missing.",
          value: null,
          threshold: null,
        },
        {
          checkCode: "AUDITOR_REPORT_FOUND",
          verdict: "PASS",
          message: "Auditor report found.",
          value: 1,
          threshold: null,
        },
        {
          checkCode: "COMPARISON_MATCH_RATE",
          verdict: "FAIL",
          message: "Too many mismatches.",
          value: 0.2,
          threshold: 0.5,
        },
        {
          checkCode: "COMPARISON_NO_MAJOR_MISMATCHES",
          verdict: "PASS",
          message: "No major mismatches.",
          value: 0,
          threshold: 0,
        },
        {
          checkCode: "SAFETY_FLAGS_CLEAN",
          verdict: "PASS",
          message: "All safety flags are clean.",
          value: null,
          threshold: null,
        },
      ],
    });

    const listArtifacts = vi.fn(async () => [
      makeArtifact({ payload: report }),
      makeRelatedArtifact(PdfModelArtifactKind.UNIFIED_PARSER_DOCUMENT, {
        filingId: "filing-1",
        orgNumber: "123456789",
        fiscalYear: 2024,
        pageCount: 6,
      }),
      makeRelatedArtifact(PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION, {
        filingId: "filing-1",
        orgNumber: "123456789",
        fiscalYear: 2024,
        parsedLineItemCount: 17,
        statementCount: 2,
      }),
      makeRelatedArtifact(PdfModelArtifactKind.UNIFIED_NARRATIVE_EXTRACTION, {
        filingId: "filing-1",
        orgNumber: "123456789",
        fiscalYear: 2024,
        sectionCount: 4,
      }),
      makeRelatedArtifact(PdfModelArtifactKind.LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON, {
        filingId: "filing-1",
        orgNumber: "123456789",
        fiscalYear: 2024,
        totalCompared: 5,
        exactMatchCount: 3,
        mismatchCount: 2,
      }),
    ]);

    const detail = await getUnifiedConfidenceGateResultForAdmin("filing-1", {
      listArtifacts,
      getFilingById: vi.fn(async () => makeFiling() as never),
    });

    expect(detail).not.toBeNull();
    expect(detail?.safety).toEqual({
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    });
    expect(detail?.fullChecks.some((check) => check.checkCode === "COMPARISON_MATCH_RATE")).toBe(true);
    expect(detail?.shadowSummary).toMatchObject({
      documentPageCount: 6,
      financialStatementCount: 2,
      financialLineItemCount: 17,
      narrativeSectionCount: 4,
      comparisonFactCount: 5,
      comparisonExactMatchCount: 3,
      comparisonMismatchCount: 2,
    });
  });

  it("detail lookup returns null when artifact is absent", async () => {
    const detail = await getUnifiedConfidenceGateResultForAdmin("filing-1", {
      listArtifacts: vi.fn(async () => []),
      getFilingById: vi.fn(async () => makeFiling() as never),
    });

    expect(detail).toBeNull();
  });
});
