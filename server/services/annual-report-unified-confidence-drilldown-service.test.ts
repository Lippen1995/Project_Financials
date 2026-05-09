import {
  PdfModelArtifactKind,
  PdfModelArtifactStatus,
  type PdfModelArtifactSnapshot,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { UnifiedConfidenceAdminDetail } from "@/server/services/annual-report-unified-confidence-admin-service";
import type { AnnualReportLegacyVsUnifiedComparisonReport } from "@/server/services/annual-report-legacy-vs-unified-comparison-service";
import { getUnifiedConfidenceFilingDrilldownForAdmin } from "@/server/services/annual-report-unified-confidence-drilldown-service";
import type { UnifiedExtractionGateCheckResult } from "@/server/services/annual-report-unified-extraction-confidence-gate-service";

function makeArtifact(
  kind: PdfModelArtifactKind,
  payload: unknown,
  overrides: Partial<PdfModelArtifactSnapshot> = {},
): PdfModelArtifactSnapshot {
  return {
    id: `${kind}-artifact`,
    kind,
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
    },
    payload: payload as never,
    sourceCommand: null,
    sourceCommitSha: null,
    createdByUserId: null,
    createdAt: new Date("2026-05-09T12:00:00.000Z"),
    updatedAt: new Date("2026-05-09T12:00:00.000Z"),
    ...overrides,
  };
}

function makeDetail(
  overrides: Partial<UnifiedConfidenceAdminDetail> = {},
): UnifiedConfidenceAdminDetail {
  const warningCheck: UnifiedExtractionGateCheckResult = {
    checkCode: "BOARD_REPORT_FOUND",
    verdict: "WARN",
    message: "Board report missing.",
    value: null,
    threshold: null,
  };

  return {
    filingId: "filing-1",
    orgNumber: "123456789",
    companyName: "Example AS",
    fiscalYear: 2024,
    status: "completed",
    gateVerdict: "WARN",
    passCount: 10,
    warnCount: 1,
    failCount: 0,
    insufficientDataCount: 0,
    blockingCheckCodes: [],
    warningCheckCodes: ["BOARD_REPORT_FOUND"],
    financialLineItemCount: 2,
    narrativeSectionCount: 1,
    comparisonMatchRate: 0.75,
    durationMs: 250,
    generatedAt: "2026-05-09T12:00:00.000Z",
    errors: [],
    warnings: ["Board report missing."],
    fullChecks: [
      {
        checkCode: "FINANCIAL_EXTRACTION_PRESENT",
        verdict: "PASS",
        message: "Financial extraction present.",
        value: 1,
        threshold: null,
      },
      warningCheck,
    ],
    safety: {
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    },
    shadowSummary: {
      documentPageCount: 4,
      financialStatementCount: 1,
      financialLineItemCount: 2,
      narrativeSectionCount: 1,
      comparisonFactCount: 2,
      comparisonExactMatchCount: 1,
      comparisonMismatchCount: 1,
      comparisonMatchRate: 0.5,
    },
    artifactId: "gate-artifact",
    artifactKind: PdfModelArtifactKind.UNIFIED_EXTRACTION_CONFIDENCE_GATE,
    artifactStatus: PdfModelArtifactStatus.CREATED,
    artifactCreatedAt: "2026-05-09T12:00:00.000Z",
    artifactUpdatedAt: "2026-05-09T12:00:00.000Z",
    artifactSourceCommand: null,
    artifactSourceCommitSha: null,
    companyId: "company-1",
    artifactPayload: {},
    artifactSummary: {},
    ...overrides,
  };
}

function makeParserPayload() {
  return {
    version: "unified-parser-document-v1",
    generatedAt: "2026-05-09T12:00:00.000Z",
    source: {
      route: "TEXT_LAYER",
      filingId: "filing-1",
      extractionRunId: "run-1",
      orgNumber: "123456789",
      fiscalYear: 2024,
    },
    safety: {
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
      shadowOnly: true,
      canUseForProductionRouting: false,
    },
    metrics: {
      pageCount: 4,
      processedPageCount: 4,
      textCharCount: 400,
      tableCount: 1,
      sectionCount: 2,
      warningCount: 0,
      errorCount: 0,
    },
    summary: {
      pageCount: 4,
      sectionCount: 2,
    },
    pageSummaries: [
      {
        pageNumber: 1,
        textCharCount: 120,
        hasUsefulText: true,
        hasTableLikeText: true,
        blockCount: 12,
        warnings: [],
      },
    ],
    sectionSummaries: [
      {
        sectionId: "sec-1",
        kind: "FINANCIAL_STATEMENTS",
        pageStart: 1,
        pageEnd: 2,
        textPreview: "Financial statements preview",
        confidence: 0.95,
      },
    ],
    tableSummaries: [
      {
        tableId: "table-1",
        role: "INCOME_STATEMENT",
        pageNumber: 1,
        rowCount: 2,
        columnCount: 2,
        title: "Resultatregnskap",
        warnings: [],
      },
    ],
    warnings: [],
    errors: [],
  };
}

function makeFinancialPayload() {
  return {
    version: "unified-financial-statement-extraction-v1",
    generatedAt: "2026-05-09T12:00:00.000Z",
    source: {
      route: "TEXT_LAYER",
      filingId: "filing-1",
      extractionRunId: "run-1",
      orgNumber: "123456789",
      fiscalYear: 2024,
    },
    safety: {
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
      shadowOnly: true,
      canUseForProductionRouting: false,
    },
    metrics: {
      candidateTableCount: 1,
      parsedLineItemCount: 2,
      canonicalMappedCount: 2,
      unmappedCount: 0,
      warningCount: 0,
      errorCount: 0,
    },
    statements: [
      {
        kind: "INCOME_STATEMENT",
        pageNumbers: [1],
        tableIds: ["table-1"],
        confidence: 0.87,
        warnings: [],
        lineItems: [
          {
            statementKind: "INCOME_STATEMENT",
            canonicalKey: "revenue",
            originalLabel: "Driftsinntekter",
            normalizedLabel: "driftsinntekter",
            year: 2024,
            value: "1000",
            unitScale: "THOUSANDS",
            sign: "POSITIVE",
            confidence: 0.9,
            provenance: {
              route: "TEXT_LAYER",
              pageNumber: 1,
              tableId: "table-1",
              rowIndex: 0,
              columnIndex: 1,
              blockIds: ["block-1"],
            },
            warnings: [],
          },
          {
            statementKind: "INCOME_STATEMENT",
            canonicalKey: "net_income",
            originalLabel: "Årsresultat",
            normalizedLabel: "arsresultat",
            year: 2024,
            value: "250",
            unitScale: "THOUSANDS",
            sign: "POSITIVE",
            confidence: 0.85,
            provenance: {
              route: "TEXT_LAYER",
              pageNumber: 1,
              tableId: "table-1",
              rowIndex: 1,
              columnIndex: 1,
              blockIds: ["block-2"],
            },
            warnings: ["Low OCR confidence"],
          },
        ],
      },
    ],
    warnings: [],
    errors: [],
  };
}

function makeNarrativePayload() {
  return {
    version: "unified-narrative-extraction-v1",
    generatedAt: "2026-05-09T12:00:00.000Z",
    source: {
      route: "TEXT_LAYER",
      filingId: "filing-1",
      orgNumber: "123456789",
      fiscalYear: 2024,
    },
    sections: [
      {
        sectionId: "section-1",
        kind: "AUDITOR_REPORT",
        title: "Revisors beretning",
        pageStart: 3,
        pageEnd: 4,
        textPreview: "Auditor text preview",
        signals: [
          {
            keyword: "revisors beretning",
            context: "Revisors beretning for 2024",
            pageNumber: 3,
          },
        ],
        confidence: 1,
        provenance: "DOCUMENT_SECTION",
      },
    ],
    metrics: {
      boardReportFound: false,
      auditorReportFound: true,
      auditorOpinionFound: true,
      auditorQualificationFound: false,
      emphasisOfMatterFound: false,
      goingConcernSignalFound: false,
      signaturesFound: false,
      otherInformationFound: false,
      totalSignalCount: 1,
      sectionCount: 1,
      warningCount: 0,
    },
    warnings: [],
    safety: {
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
      shadowOnly: true,
    },
  };
}

function makeComparisonPayload(): AnnualReportLegacyVsUnifiedComparisonReport {
  return {
    version: "legacy-vs-unified-comparison-v1",
    generatedAt: "2026-05-09T12:00:00.000Z",
    source: {
      filingId: "filing-1",
      orgNumber: "123456789",
      fiscalYear: 2024,
      legacyCandidateCount: 2,
      unifiedRoute: "TEXT_LAYER",
      unifiedNarrativeRoute: "TEXT_LAYER",
    },
    financialComparisons: [
      {
        canonicalKey: "revenue",
        year: 2024,
        legacyValueNok: "1000000",
        unifiedValueNok: "1000000",
        deltaNok: "0",
        match: "EXACT",
        relativeDeviation: 0,
      },
      {
        canonicalKey: "net_income",
        year: 2024,
        legacyValueNok: "200000",
        unifiedValueNok: "250000",
        deltaNok: "50000",
        match: "MISMATCH",
        relativeDeviation: 0.25,
      },
    ],
    narrativeComparisons: [
      {
        kind: "AUDITOR_REPORT",
        legacyFound: true,
        unifiedFound: true,
        unifiedSectionKind: "AUDITOR_REPORT",
        textSimilarity: 0.9,
      },
    ],
    summary: {
      financialExactMatchCount: 1,
      financialScaledMatchCount: 0,
      financialMismatchCount: 1,
      financialMissingInLegacyCount: 0,
      financialMissingInUnifiedCount: 0,
      financialTotalCompared: 2,
      narrativeBoardReportCovered: false,
      narrativeAuditorReportCovered: true,
      narrativeSignaturesCovered: false,
      narrativeCoverageScore: 0.33,
    },
    warnings: [],
    safety: {
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
      shadowOnly: true,
    },
  };
}

function makeConfidenceGatePayload() {
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
    checks: [
      {
        checkCode: "BOARD_REPORT_FOUND",
        verdict: "WARN",
        message: "Board report missing.",
        value: null,
        threshold: null,
      },
    ],
  };
}

describe("annual-report-unified-confidence-drilldown-service", () => {
  it("builds complete drilldown when all artifacts exist", async () => {
    const drilldown = await getUnifiedConfidenceFilingDrilldownForAdmin("filing-1", {
      getAdminDetail: vi.fn(async () => makeDetail()),
      listArtifacts: vi.fn(async () => [
        makeArtifact(PdfModelArtifactKind.UNIFIED_PARSER_DOCUMENT, makeParserPayload()),
        makeArtifact(PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION, makeFinancialPayload()),
        makeArtifact(PdfModelArtifactKind.UNIFIED_NARRATIVE_EXTRACTION, makeNarrativePayload()),
        makeArtifact(
          PdfModelArtifactKind.LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON,
          makeComparisonPayload(),
        ),
        makeArtifact(
          PdfModelArtifactKind.UNIFIED_EXTRACTION_CONFIDENCE_GATE,
          makeConfidenceGatePayload(),
        ),
      ]),
    });

    expect(drilldown).not.toBeNull();
    expect(drilldown?.artifacts.parserDocument.status).toBe("available");
    expect(drilldown?.artifacts.financialExtraction.data?.lineItems).toHaveLength(2);
    expect(drilldown?.artifacts.narrativeExtraction.data?.sections).toHaveLength(1);
    expect(drilldown?.artifacts.comparison.data?.mismatches).toHaveLength(1);
    expect(drilldown?.gateCheckContext[0]).toMatchObject({
      checkCode: "BOARD_REPORT_FOUND",
      verdict: "WARN",
    });
  });

  it("marks parser document artifact missing without crashing", async () => {
    const drilldown = await getUnifiedConfidenceFilingDrilldownForAdmin("filing-1", {
      getAdminDetail: vi.fn(async () => makeDetail()),
      listArtifacts: vi.fn(async () => [
        makeArtifact(PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION, makeFinancialPayload()),
      ]),
    });

    expect(drilldown?.artifacts.parserDocument.status).toBe("missing");
    expect(drilldown?.artifacts.parserDocument.issues[0]).toContain("not found");
  });

  it("marks financial artifact missing without crashing", async () => {
    const drilldown = await getUnifiedConfidenceFilingDrilldownForAdmin("filing-1", {
      getAdminDetail: vi.fn(async () => makeDetail()),
      listArtifacts: vi.fn(async () => [
        makeArtifact(PdfModelArtifactKind.UNIFIED_PARSER_DOCUMENT, makeParserPayload()),
      ]),
    });

    expect(drilldown?.artifacts.financialExtraction.status).toBe("missing");
  });

  it("marks malformed artifact payloads without crashing", async () => {
    const malformed = makeArtifact(PdfModelArtifactKind.UNIFIED_PARSER_DOCUMENT, {
      version: "wrong-version",
      source: { filingId: "filing-1" },
    });

    const drilldown = await getUnifiedConfidenceFilingDrilldownForAdmin("filing-1", {
      getAdminDetail: vi.fn(async () => makeDetail()),
      listArtifacts: vi.fn(async () => [malformed]),
    });

    expect(drilldown?.artifacts.parserDocument.status).toBe("malformed");
    expect(drilldown?.artifacts.parserDocument.issues.length).toBeGreaterThan(0);
  });

  it("extracts financial line items defensively", async () => {
    const payload = makeFinancialPayload();
    payload.statements[0].lineItems[0].provenance.blockIds = ["block-1", 42 as never];

    const drilldown = await getUnifiedConfidenceFilingDrilldownForAdmin("filing-1", {
      getAdminDetail: vi.fn(async () => makeDetail()),
      listArtifacts: vi.fn(async () => [
        makeArtifact(PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION, payload),
      ]),
    });

    expect(drilldown?.artifacts.financialExtraction.data?.lineItems[0]?.blockIds).toEqual(["block-1"]);
  });

  it("extracts narrative sections defensively", async () => {
    const payload = makeNarrativePayload();
    payload.sections[0].signals.push({
      keyword: "bad",
      context: "Bad page",
      pageNumber: "oops" as never,
    });

    const drilldown = await getUnifiedConfidenceFilingDrilldownForAdmin("filing-1", {
      getAdminDetail: vi.fn(async () => makeDetail()),
      listArtifacts: vi.fn(async () => [
        makeArtifact(PdfModelArtifactKind.UNIFIED_NARRATIVE_EXTRACTION, payload),
      ]),
    });

    expect(drilldown?.artifacts.narrativeExtraction.data?.sections[0]?.signals[1]?.pageNumber).toBeNull();
  });

  it("extracts comparison mismatches defensively", async () => {
    const payload = makeComparisonPayload();
    payload.financialComparisons.push({
      canonicalKey: "total_assets",
      year: 2024,
      legacyValueNok: null,
      unifiedValueNok: "1000",
      deltaNok: null,
      match: "MISSING_IN_LEGACY",
      relativeDeviation: null,
    });

    const drilldown = await getUnifiedConfidenceFilingDrilldownForAdmin("filing-1", {
      getAdminDetail: vi.fn(async () => makeDetail()),
      listArtifacts: vi.fn(async () => [
        makeArtifact(
          PdfModelArtifactKind.LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON,
          payload,
        ),
      ]),
    });

    expect(
      drilldown?.artifacts.comparison.data?.mismatches.some(
        (mismatch) => mismatch.canonicalKey === "total_assets" && mismatch.severity === "MISSING",
      ),
    ).toBe(true);
  });

  it("preserves safety invariants", async () => {
    const drilldown = await getUnifiedConfidenceFilingDrilldownForAdmin("filing-1", {
      getAdminDetail: vi.fn(async () => makeDetail()),
      listArtifacts: vi.fn(async () => []),
    });

    expect(drilldown?.safety).toEqual({
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    });
  });

  it("does not call extraction or runtime functions", async () => {
    const runExtraction = vi.fn(() => {
      throw new Error("should not be called");
    });

    await getUnifiedConfidenceFilingDrilldownForAdmin("filing-1", {
      getAdminDetail: vi.fn(async () => makeDetail()),
      listArtifacts: vi.fn(async () => []),
    });

    expect(runExtraction).not.toHaveBeenCalled();
  });

  it("selects the latest artifact per kind when duplicates exist", async () => {
    const older = makeArtifact(PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION, {
      ...makeFinancialPayload(),
      statements: [],
    }, {
      id: "older",
      createdAt: new Date("2026-05-09T11:00:00.000Z"),
    });
    const newer = makeArtifact(
      PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION,
      makeFinancialPayload(),
      {
        id: "newer",
        createdAt: new Date("2026-05-09T13:00:00.000Z"),
      },
    );

    const drilldown = await getUnifiedConfidenceFilingDrilldownForAdmin("filing-1", {
      getAdminDetail: vi.fn(async () => makeDetail()),
      listArtifacts: vi.fn(async () => [older, newer]),
    });

    expect(drilldown?.artifacts.financialExtraction.artifactId).toBe("newer");
    expect(drilldown?.artifacts.financialExtraction.data?.lineItems).toHaveLength(2);
  });
});
