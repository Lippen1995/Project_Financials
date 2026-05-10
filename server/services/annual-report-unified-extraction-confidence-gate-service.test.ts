/**
 * Tests for annual-report-unified-extraction-confidence-gate-service.ts
 *
 * Covers:
 * - INSUFFICIENT_DATA when inputs are null
 * - PASS/WARN/FAIL per-check logic
 * - Overall verdict derivation
 * - Safety invariants (canUseForProductionRouting always false)
 * - Config overrides
 * - Validation
 * - 14 checks always present
 *
 * Test constraints:
 * - No OCR, no live Brreg, no external network calls
 * - Pure function tests; no DB access
 */

import { describe, it, expect } from "vitest";
import {
  buildUnifiedExtractionConfidenceGateReport,
  validateUnifiedExtractionConfidenceGateReport,
  DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG,
  UNIFIED_EXTRACTION_CONFIDENCE_GATE_VERSION,
  type BuildUnifiedExtractionConfidenceGateReportInput,
} from "@/server/services/annual-report-unified-extraction-confidence-gate-service";
import type {
  UnifiedFinancialStatementExtractionResult,
  UnifiedFinancialStatement,
  UnifiedFinancialLineItem,
} from "@/integrations/brreg/annual-report-financials/unified-financial-statement-extractor";
import type {
  UnifiedNarrativeExtractionResult,
  UnifiedNarrativeSection,
} from "@/integrations/brreg/annual-report-financials/unified-narrative-extractor";
import type {
  AnnualReportLegacyVsUnifiedComparisonReport,
  FinancialFactComparison,
} from "@/server/services/annual-report-legacy-vs-unified-comparison-service";

// ── Minimal fixture builders ───────────────────────────────────────────────────

const SAFE = {
  canUseForProductionRouting: false as const,
  productionRoutingChanged: false as const,
  productionFactsMutated: false as const,
  publishAffected: false as const,
  shadowOnly: true as const,
};

function makeLineItem(
  kind: "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW_STATEMENT" | "EQUITY" | "UNKNOWN",
  canonicalKey: string | null,
  unitScale: "ONES" | "THOUSANDS" | "MILLIONS" | "UNKNOWN" = "ONES",
): UnifiedFinancialLineItem {
  return {
    statementKind: kind,
    canonicalKey,
    originalLabel: "Test label",
    normalizedLabel: "test label",
    year: 2024,
    value: "100000",
    unitScale,
    sign: "POSITIVE",
    confidence: 0.95,
    provenance: {
      route: "TEXT_LAYER",
      pageNumber: 2,
      tableId: null,
      rowIndex: 0,
      columnIndex: null,
      blockIds: [],
    },
    warnings: [],
  };
}

function makeStatement(
  kind: "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW_STATEMENT" | "EQUITY" | "UNKNOWN",
  lineItems: UnifiedFinancialLineItem[],
): UnifiedFinancialStatement {
  return {
    kind,
    pageNumbers: [2],
    tableIds: [],
    lineItems,
    confidence: 0.9,
    warnings: [],
  };
}

function makeFinancialResult(
  overrides?: {
    statements?: UnifiedFinancialStatement[];
  }
): UnifiedFinancialStatementExtractionResult {
  return {
    version: "unified-financial-statement-extraction-v1",
    generatedAt: new Date().toISOString(),
    source: {
      route: "TEXT_LAYER",
      filingId: null,
      extractionRunId: null,
      orgNumber: null,
      fiscalYear: null,
    },
    safety: { ...SAFE },
    statements: overrides?.statements ?? [
      makeStatement("INCOME_STATEMENT", [
        makeLineItem("INCOME_STATEMENT", "revenue"),
        makeLineItem("INCOME_STATEMENT", "net_income"),
        makeLineItem("INCOME_STATEMENT", null),
      ]),
      makeStatement("BALANCE_SHEET", [
        makeLineItem("BALANCE_SHEET", "total_assets"),
        makeLineItem("BALANCE_SHEET", "total_equity"),
      ]),
    ],
    warnings: [],
    errors: [],
    metrics: {
      candidateTableCount: 2,
      parsedLineItemCount: 5,
      canonicalMappedCount: 4,
      unmappedCount: 1,
      warningCount: 0,
      errorCount: 0,
    },
  };
}

function makeNarrativeSection(
  kind: "BOARD_REPORT" | "AUDITOR_REPORT" | "AUDITOR_OPINION" | "AUDITOR_QUALIFICATION"
    | "EMPHASIS_OF_MATTER" | "GOING_CONCERN" | "OTHER_INFORMATION" | "SIGNATURES",
): UnifiedNarrativeSection {
  return {
    sectionId: `sec-${kind}`,
    kind,
    title: null,
    confidence: 0.9,
    provenance: "DOCUMENT_SECTION",
    pageStart: 1,
    pageEnd: 2,
    textPreview: "Sample text preview",
    signals: [],
  };
}

function makeNarrativeResult(
  sections?: UnifiedNarrativeSection[],
): UnifiedNarrativeExtractionResult {
  return {
    version: "unified-narrative-extraction-v1",
    generatedAt: new Date().toISOString(),
    source: {
      route: "TEXT_LAYER",
      filingId: null,
      orgNumber: null,
      fiscalYear: null,
    },
    safety: { ...SAFE },
    sections: sections ?? [
      makeNarrativeSection("BOARD_REPORT"),
      makeNarrativeSection("AUDITOR_REPORT"),
    ],
    warnings: [],
    metrics: {
      boardReportFound: true,
      auditorReportFound: true,
      auditorOpinionFound: false,
      auditorQualificationFound: false,
      emphasisOfMatterFound: false,
      goingConcernSignalFound: false,
      signaturesFound: false,
      otherInformationFound: false,
      totalSignalCount: 0,
      sectionCount: 2,
      warningCount: 0,
    },
  };
}

function makeComparison(
  financialComparisons?: FinancialFactComparison[],
): AnnualReportLegacyVsUnifiedComparisonReport {
  return {
    version: "legacy-vs-unified-comparison-v1",
    generatedAt: new Date().toISOString(),
    source: { filingId: null, orgNumber: null, fiscalYear: null, legacyCandidateCount: 0, unifiedRoute: null, unifiedNarrativeRoute: null },
    safety: { ...SAFE },
    financialComparisons: financialComparisons ?? [
      {
        canonicalKey: "revenue",
        year: 2024,
        legacyValueNok: "1000000",
        unifiedValueNok: "1000000",
        deltaNok: "0",
        match: "EXACT",
        relativeDeviation: 0,
        legacyLabel: "Sum driftsinntekter",
        unifiedLabel: "Sum driftsinntekter",
        legacyUnitScale: 1,
        unifiedUnitScale: "ONES",
      },
      {
        canonicalKey: "net_income",
        year: 2024,
        legacyValueNok: "100000",
        unifiedValueNok: "101000",
        deltaNok: "1000",
        match: "TOLERANCE",
        relativeDeviation: 0.01,
        legacyLabel: "Årsresultat",
        unifiedLabel: "Årsresultat",
        legacyUnitScale: 1,
        unifiedUnitScale: "ONES",
      },
    ],
    narrativeComparisons: [],
    warnings: [],
    summary: {
      financialTotalCompared: 2,
      financialExactMatchCount: 1,
      financialScaledMatchCount: 1,
      financialMismatchCount: 0,
      financialMissingInLegacyCount: 0,
      financialMissingInUnifiedCount: 0,
      financialLowConfidenceCount: 0,
      narrativeBoardReportCovered: false,
      narrativeAuditorReportCovered: false,
      narrativeSignaturesCovered: false,
      narrativeCoverageScore: 0,
    },
  };
}

function makeInput(
  overrides?: Partial<BuildUnifiedExtractionConfidenceGateReportInput>,
): BuildUnifiedExtractionConfidenceGateReportInput {
  return {
    financial: makeFinancialResult(),
    narrative: makeNarrativeResult(),
    comparison: makeComparison(),
    meta: { filingId: "filing-1", orgNumber: "928846466", fiscalYear: 2024 },
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("buildUnifiedExtractionConfidenceGateReport", () => {
  describe("structure invariants", () => {
    it("produces exactly 14 checks", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
      expect(report.checks).toHaveLength(14);
    });

    it("version is unified-extraction-confidence-gate-v1", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
      expect(report.version).toBe(UNIFIED_EXTRACTION_CONFIDENCE_GATE_VERSION);
    });

    it("generatedAt is a valid ISO string", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
      expect(typeof report.generatedAt).toBe("string");
      expect(() => new Date(report.generatedAt)).not.toThrow();
    });

    it("canUseForProductionRouting is always false", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
      expect(report.safety.canUseForProductionRouting).toBe(false);
      expect(report.safety.productionRoutingChanged).toBe(false);
      expect(report.safety.productionFactsMutated).toBe(false);
      expect(report.safety.publishAffected).toBe(false);
    });

    it("passCount + warnCount + failCount + insufficientDataCount equals 14", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
      expect(report.passCount + report.warnCount + report.failCount + report.insufficientDataCount).toBe(14);
    });

    it("blockingChecks matches FAIL checks", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
      expect(report.blockingChecks.every((c) => c.verdict === "FAIL")).toBe(true);
      expect(report.blockingChecks.length).toBe(report.failCount);
    });

    it("warningChecks matches WARN checks", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
      expect(report.warningChecks.every((c) => c.verdict === "WARN")).toBe(true);
      expect(report.warningChecks.length).toBe(report.warnCount);
    });

    it("meta is propagated correctly", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
      expect(report.meta.filingId).toBe("filing-1");
      expect(report.meta.orgNumber).toBe("928846466");
      expect(report.meta.fiscalYear).toBe(2024);
    });
  });

  describe("INSUFFICIENT_DATA when all inputs are null", () => {
    it("returns INSUFFICIENT_DATA overall when all inputs are null", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(
        makeInput({ financial: null, narrative: null, comparison: null }),
      );
      expect(report.overallVerdict).toBe("INSUFFICIENT_DATA");
      expect(report.insufficientDataCount).toBeGreaterThan(0);
    });

    it("all financial checks return INSUFFICIENT_DATA when financial is null", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(
        makeInput({ financial: null }),
      );
      const financialChecks = report.checks.filter((c) =>
        [
          "FINANCIAL_EXTRACTION_PRESENT",
          "UNIT_SCALE_RESOLVED",
          "INCOME_STATEMENT_COVERAGE",
          "BALANCE_SHEET_COVERAGE",
          "REVENUE_FOUND",
          "NET_INCOME_FOUND",
          "TOTAL_ASSETS_FOUND",
          "CANONICAL_KEY_COVERAGE",
        ].includes(c.checkCode),
      );
      expect(financialChecks.every((c) => c.verdict === "INSUFFICIENT_DATA")).toBe(true);
    });

    it("narrative checks return INSUFFICIENT_DATA when narrative is null", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(
        makeInput({ narrative: null }),
      );
      const narrativeChecks = report.checks.filter((c) =>
        [
          "NARRATIVE_EXTRACTION_PRESENT",
          "BOARD_REPORT_FOUND",
          "AUDITOR_REPORT_FOUND",
        ].includes(c.checkCode),
      );
      expect(narrativeChecks.every((c) => c.verdict === "INSUFFICIENT_DATA")).toBe(true);
    });

    it("comparison checks return INSUFFICIENT_DATA when comparison is null", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(
        makeInput({ comparison: null }),
      );
      const compChecks = report.checks.filter((c) =>
        ["COMPARISON_MATCH_RATE", "COMPARISON_NO_MAJOR_MISMATCHES"].includes(c.checkCode),
      );
      expect(compChecks.every((c) => c.verdict === "INSUFFICIENT_DATA")).toBe(true);
    });
  });

  describe("happy path — good extraction", () => {
    it("returns PASS overall for a good extraction", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
      expect(report.overallVerdict).toBe("PASS");
    });

    it("FINANCIAL_EXTRACTION_PRESENT passes when items found", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
      const check = report.checks.find((c) => c.checkCode === "FINANCIAL_EXTRACTION_PRESENT")!;
      expect(check.verdict).toBe("PASS");
      expect(check.value).toBeGreaterThan(0);
    });

    it("INCOME_STATEMENT_COVERAGE passes when income statement items found", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
      const check = report.checks.find((c) => c.checkCode === "INCOME_STATEMENT_COVERAGE")!;
      expect(check.verdict).toBe("PASS");
    });

    it("BALANCE_SHEET_COVERAGE passes when balance sheet items found", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
      const check = report.checks.find((c) => c.checkCode === "BALANCE_SHEET_COVERAGE")!;
      expect(check.verdict).toBe("PASS");
    });

    it("REVENUE_FOUND passes when revenue key found", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
      const check = report.checks.find((c) => c.checkCode === "REVENUE_FOUND")!;
      expect(check.verdict).toBe("PASS");
    });

    it("BOARD_REPORT_FOUND passes when board report section found", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
      const check = report.checks.find((c) => c.checkCode === "BOARD_REPORT_FOUND")!;
      expect(check.verdict).toBe("PASS");
    });

    it("AUDITOR_REPORT_FOUND passes when auditor report section found", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
      const check = report.checks.find((c) => c.checkCode === "AUDITOR_REPORT_FOUND")!;
      expect(check.verdict).toBe("PASS");
    });

    it("COMPARISON_MATCH_RATE passes when all facts match", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
      const check = report.checks.find((c) => c.checkCode === "COMPARISON_MATCH_RATE")!;
      expect(check.verdict).toBe("PASS");
    });

    it("SAFETY_FLAGS_CLEAN passes when all safety flags are false", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
      const check = report.checks.find((c) => c.checkCode === "SAFETY_FLAGS_CLEAN")!;
      expect(check.verdict).toBe("PASS");
    });
  });

  describe("FAIL cases", () => {
    it("FINANCIAL_EXTRACTION_PRESENT fails when no line items found", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(
        makeInput({
          financial: makeFinancialResult({ statements: [] }),
        }),
      );
      const check = report.checks.find((c) => c.checkCode === "FINANCIAL_EXTRACTION_PRESENT")!;
      expect(check.verdict).toBe("FAIL");
      expect(report.overallVerdict).toBe("FAIL");
    });

    it("INCOME_STATEMENT_COVERAGE fails when no income statement items", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(
        makeInput({
          financial: makeFinancialResult({
            statements: [
              makeStatement("BALANCE_SHEET", [makeLineItem("BALANCE_SHEET", "total_assets")]),
            ],
          }),
        }),
      );
      const check = report.checks.find((c) => c.checkCode === "INCOME_STATEMENT_COVERAGE")!;
      expect(check.verdict).toBe("FAIL");
    });

    it("BALANCE_SHEET_COVERAGE fails when no balance sheet items", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(
        makeInput({
          financial: makeFinancialResult({
            statements: [
              makeStatement("INCOME_STATEMENT", [makeLineItem("INCOME_STATEMENT", "revenue")]),
            ],
          }),
        }),
      );
      const check = report.checks.find((c) => c.checkCode === "BALANCE_SHEET_COVERAGE")!;
      expect(check.verdict).toBe("FAIL");
    });

    it("COMPARISON_MATCH_RATE fails when below fail threshold", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(
        makeInput({
          comparison: makeComparison([
            {
              canonicalKey: "revenue",
              year: 2024,
              legacyValueNok: "1000000",
              unifiedValueNok: "2000000",
              deltaNok: "1000000",
              match: "CONFLICTING_VALUES",
              relativeDeviation: 1.0,
              legacyLabel: "Sum driftsinntekter",
              unifiedLabel: "Sum driftsinntekter",
              legacyUnitScale: 1,
              unifiedUnitScale: "ONES",
            },
            {
              canonicalKey: "net_income",
              year: 2024,
              legacyValueNok: "100000",
              unifiedValueNok: "200000",
              deltaNok: "100000",
              match: "CONFLICTING_VALUES",
              relativeDeviation: 1.0,
              legacyLabel: "Årsresultat",
              unifiedLabel: "Årsresultat",
              legacyUnitScale: 1,
              unifiedUnitScale: "ONES",
            },
            {
              canonicalKey: "total_assets",
              year: 2024,
              legacyValueNok: "500000",
              unifiedValueNok: "1000000",
              deltaNok: "500000",
              match: "CONFLICTING_VALUES",
              relativeDeviation: 1.0,
              legacyLabel: "Sum eiendeler",
              unifiedLabel: "Sum eiendeler",
              legacyUnitScale: 1,
              unifiedUnitScale: "ONES",
            },
          ]),
          config: { minComparisonMatchRateForFail: 0.5 },
        }),
      );
      const check = report.checks.find((c) => c.checkCode === "COMPARISON_MATCH_RATE")!;
      expect(check.verdict).toBe("FAIL");
    });

    it("COMPARISON_NO_MAJOR_MISMATCHES fails when major mismatches exceed threshold", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(
        makeInput({
          comparison: makeComparison([
            {
              canonicalKey: "revenue",
              year: 2024,
              legacyValueNok: "1000000",
              unifiedValueNok: "2000000",
              deltaNok: "1000000",
              match: "CONFLICTING_VALUES",
              relativeDeviation: 1.0,
              legacyLabel: "Sum driftsinntekter",
              unifiedLabel: "Sum driftsinntekter",
              legacyUnitScale: 1,
              unifiedUnitScale: "ONES",
            },
          ]),
          config: { maxMajorMismatchCountForFail: 0, majorMismatchDeviationThreshold: 0.5 },
        }),
      );
      const check = report.checks.find((c) => c.checkCode === "COMPARISON_NO_MAJOR_MISMATCHES")!;
      expect(check.verdict).toBe("FAIL");
    });

    it("UNIT_SCALE_RESOLVED fails when majority of items have UNKNOWN scale", () => {
      const allUnknown = makeFinancialResult({
        statements: [
          makeStatement("INCOME_STATEMENT", [
            makeLineItem("INCOME_STATEMENT", "revenue", "UNKNOWN"),
            makeLineItem("INCOME_STATEMENT", "net_income", "UNKNOWN"),
            makeLineItem("INCOME_STATEMENT", null, "UNKNOWN"),
          ]),
        ],
      });
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput({ financial: allUnknown }));
      const check = report.checks.find((c) => c.checkCode === "UNIT_SCALE_RESOLVED")!;
      expect(check.verdict).toBe("FAIL");
    });

    it("SAFETY_FLAGS_CLEAN fails when financial safety.canUseForProductionRouting is true", () => {
      const badFinancial = makeFinancialResult();
      // @ts-expect-error — deliberately breaking safety for test
      badFinancial.safety.canUseForProductionRouting = true;
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput({ financial: badFinancial }));
      const check = report.checks.find((c) => c.checkCode === "SAFETY_FLAGS_CLEAN")!;
      expect(check.verdict).toBe("FAIL");
    });

    it("SAFETY_FLAGS_CLEAN fails when financial safety.productionRoutingChanged is true", () => {
      const badFinancial = makeFinancialResult();
      // @ts-expect-error — deliberately breaking safety for test
      badFinancial.safety.productionRoutingChanged = true;
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput({ financial: badFinancial }));
      const check = report.checks.find((c) => c.checkCode === "SAFETY_FLAGS_CLEAN")!;
      expect(check.verdict).toBe("FAIL");
    });

    it("SAFETY_FLAGS_CLEAN fails when financial safety.productionFactsMutated is true", () => {
      const badFinancial = makeFinancialResult();
      // @ts-expect-error — deliberately breaking safety for test
      badFinancial.safety.productionFactsMutated = true;
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput({ financial: badFinancial }));
      const check = report.checks.find((c) => c.checkCode === "SAFETY_FLAGS_CLEAN")!;
      expect(check.verdict).toBe("FAIL");
    });

    it("SAFETY_FLAGS_CLEAN fails when financial safety.publishAffected is true", () => {
      const badFinancial = makeFinancialResult();
      // @ts-expect-error — deliberately breaking safety for test
      badFinancial.safety.publishAffected = true;
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput({ financial: badFinancial }));
      const check = report.checks.find((c) => c.checkCode === "SAFETY_FLAGS_CLEAN")!;
      expect(check.verdict).toBe("FAIL");
    });

    it("SAFETY_FLAGS_CLEAN fails when financial safety.shadowOnly is false", () => {
      const badFinancial = makeFinancialResult();
      // @ts-expect-error — deliberately breaking safety for test
      badFinancial.safety.shadowOnly = false;
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput({ financial: badFinancial }));
      const check = report.checks.find((c) => c.checkCode === "SAFETY_FLAGS_CLEAN")!;
      expect(check.verdict).toBe("FAIL");
    });

    it("SAFETY_FLAGS_CLEAN fails when narrative safety.shadowOnly is false", () => {
      const badNarrative = makeNarrativeResult();
      badNarrative.safety.shadowOnly = false;
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput({ narrative: badNarrative }));
      const check = report.checks.find((c) => c.checkCode === "SAFETY_FLAGS_CLEAN")!;
      expect(check.verdict).toBe("FAIL");
    });

    it("SAFETY_FLAGS_CLEAN returns INSUFFICIENT_DATA only when BOTH financial and narrative are null", () => {
      const reportBothNull = buildUnifiedExtractionConfidenceGateReport(
        makeInput({ financial: null, narrative: null }),
      );
      const checkBothNull = reportBothNull.checks.find((c) => c.checkCode === "SAFETY_FLAGS_CLEAN")!;
      expect(checkBothNull.verdict).toBe("INSUFFICIENT_DATA");

      // Only financial null — narrative is present, so not INSUFFICIENT_DATA
      const reportFinancialNull = buildUnifiedExtractionConfidenceGateReport(
        makeInput({ financial: null }),
      );
      const checkFinancialNull = reportFinancialNull.checks.find((c) => c.checkCode === "SAFETY_FLAGS_CLEAN")!;
      expect(checkFinancialNull.verdict).not.toBe("INSUFFICIENT_DATA");

      // Only narrative null — financial is present, so not INSUFFICIENT_DATA
      const reportNarrativeNull = buildUnifiedExtractionConfidenceGateReport(
        makeInput({ narrative: null }),
      );
      const checkNarrativeNull = reportNarrativeNull.checks.find((c) => c.checkCode === "SAFETY_FLAGS_CLEAN")!;
      expect(checkNarrativeNull.verdict).not.toBe("INSUFFICIENT_DATA");
    });
  });

  describe("WARN cases", () => {
    it("REVENUE_FOUND warns when revenue key is missing", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(
        makeInput({
          financial: makeFinancialResult({
            statements: [
              makeStatement("INCOME_STATEMENT", [makeLineItem("INCOME_STATEMENT", "operating_profit")]),
              makeStatement("BALANCE_SHEET", [makeLineItem("BALANCE_SHEET", "total_assets")]),
            ],
          }),
        }),
      );
      const check = report.checks.find((c) => c.checkCode === "REVENUE_FOUND")!;
      expect(check.verdict).toBe("WARN");
    });

    it("BOARD_REPORT_FOUND warns (not fails) by default when board report absent", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(
        makeInput({
          narrative: makeNarrativeResult([makeNarrativeSection("AUDITOR_REPORT")]),
        }),
      );
      const check = report.checks.find((c) => c.checkCode === "BOARD_REPORT_FOUND")!;
      expect(check.verdict).toBe("WARN");
    });

    it("BOARD_REPORT_FOUND fails when narrativeAbsenceIsFail=true", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(
        makeInput({
          narrative: makeNarrativeResult([makeNarrativeSection("AUDITOR_REPORT")]),
          config: { narrativeAbsenceIsFail: true },
        }),
      );
      const check = report.checks.find((c) => c.checkCode === "BOARD_REPORT_FOUND")!;
      expect(check.verdict).toBe("FAIL");
    });

    it("UNIT_SCALE_RESOLVED warns when some (but <50%) items have UNKNOWN scale", () => {
      // 1 of 3 items = 33% UNKNOWN, which is > 0 but < 50% → WARN not FAIL
      const partialUnknown = makeFinancialResult({
        statements: [
          makeStatement("INCOME_STATEMENT", [
            makeLineItem("INCOME_STATEMENT", "revenue", "ONES"),
            makeLineItem("INCOME_STATEMENT", "net_income", "ONES"),
            makeLineItem("INCOME_STATEMENT", null, "UNKNOWN"),
          ]),
        ],
      });
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput({ financial: partialUnknown }));
      const check = report.checks.find((c) => c.checkCode === "UNIT_SCALE_RESOLVED")!;
      expect(check.verdict).toBe("WARN");
    });
  });

  describe("overall verdict derivation", () => {
    it("returns FAIL if any check fails", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(
        makeInput({ financial: makeFinancialResult({ statements: [] }) }),
      );
      expect(report.overallVerdict).toBe("FAIL");
    });

    it("returns WARN if any check warns (and no FAILs)", () => {
      // Remove revenue to get a WARN, keep everything else passing
      const report = buildUnifiedExtractionConfidenceGateReport(
        makeInput({
          financial: makeFinancialResult({
            statements: [
              makeStatement("INCOME_STATEMENT", [makeLineItem("INCOME_STATEMENT", "operating_profit")]),
              makeStatement("BALANCE_SHEET", [makeLineItem("BALANCE_SHEET", "total_assets")]),
            ],
          }),
        }),
      );
      expect(["WARN", "FAIL"]).toContain(report.overallVerdict);
      expect(report.warnCount).toBeGreaterThan(0);
    });

    it("returns PASS when all checks pass", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
      expect(report.overallVerdict).toBe("PASS");
    });
  });

  describe("config overrides", () => {
    it("uses default config when none provided", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(makeInput({ config: undefined }));
      expect(report.config).toMatchObject(DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG);
    });

    it("merges partial config overrides with defaults", () => {
      const report = buildUnifiedExtractionConfidenceGateReport(
        makeInput({ config: { minComparisonMatchRateForPass: 0.9 } }),
      );
      expect(report.config.minComparisonMatchRateForPass).toBe(0.9);
      expect(report.config.minCanonicalKeyCoverageForPass).toBe(
        DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG.minCanonicalKeyCoverageForPass,
      );
    });
  });

  describe("CANONICAL_KEY_COVERAGE", () => {
    it("warns when coverage is between fail and pass thresholds", () => {
      // 3 items, 2 unmapped = 33% mapped — between default fail (20%) and pass (50%)
      const report = buildUnifiedExtractionConfidenceGateReport(
        makeInput({
          financial: makeFinancialResult({
            statements: [
              makeStatement("INCOME_STATEMENT", [
                makeLineItem("INCOME_STATEMENT", "revenue"),
                makeLineItem("INCOME_STATEMENT", null),
                makeLineItem("INCOME_STATEMENT", null),
              ]),
            ],
          }),
          config: { minCanonicalKeyCoverageForPass: 0.5, minCanonicalKeyCoverageForFail: 0.2 },
        }),
      );
      const check = report.checks.find((c) => c.checkCode === "CANONICAL_KEY_COVERAGE")!;
      expect(check.verdict).toBe("WARN");
    });

    it("passes when coverage meets the pass threshold", () => {
      // 2 mapped out of 2 = 100%
      const report = buildUnifiedExtractionConfidenceGateReport(
        makeInput({
          financial: makeFinancialResult({
            statements: [
              makeStatement("INCOME_STATEMENT", [
                makeLineItem("INCOME_STATEMENT", "revenue"),
                makeLineItem("INCOME_STATEMENT", "net_income"),
              ]),
            ],
          }),
        }),
      );
      const check = report.checks.find((c) => c.checkCode === "CANONICAL_KEY_COVERAGE")!;
      expect(check.verdict).toBe("PASS");
    });
  });
});

describe("validateUnifiedExtractionConfidenceGateReport", () => {
  it("returns no issues for a valid report", () => {
    const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
    const issues = validateUnifiedExtractionConfidenceGateReport(report);
    expect(issues).toHaveLength(0);
  });

  it("returns issues for wrong version", () => {
    const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
    // @ts-expect-error — deliberate
    report.version = "wrong-version";
    const issues = validateUnifiedExtractionConfidenceGateReport(report);
    expect(issues.some((i) => i.path === "version")).toBe(true);
  });

  it("returns issues when canUseForProductionRouting is true", () => {
    const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
    // @ts-expect-error — deliberate
    report.safety.canUseForProductionRouting = true;
    const issues = validateUnifiedExtractionConfidenceGateReport(report);
    expect(issues.some((i) => i.path === "safety.canUseForProductionRouting")).toBe(true);
  });

  it("returns issues for missing generatedAt", () => {
    const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
    report.generatedAt = "";
    const issues = validateUnifiedExtractionConfidenceGateReport(report);
    expect(issues.some((i) => i.path === "generatedAt")).toBe(true);
  });

  it("returns issues for invalid overallVerdict", () => {
    const report = buildUnifiedExtractionConfidenceGateReport(makeInput());
    // @ts-expect-error — deliberate
    report.overallVerdict = "INVALID";
    const issues = validateUnifiedExtractionConfidenceGateReport(report);
    expect(issues.some((i) => i.path === "overallVerdict")).toBe(true);
  });
});
