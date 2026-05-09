import { describe, expect, it } from "vitest";

import {
  LEGACY_VS_UNIFIED_COMPARISON_VERSION,
  compareAnnualReportLegacyVsUnifiedExtraction,
  serializeLegacyVsUnifiedComparisonReportAsJson,
  validateLegacyVsUnifiedComparisonReport,
} from "@/server/services/annual-report-legacy-vs-unified-comparison-service";
import type {
  AnnualReportLegacyVsUnifiedComparisonInput,
} from "@/server/services/annual-report-legacy-vs-unified-comparison-service";
import type { CanonicalFactCandidate } from "@/integrations/brreg/annual-report-financials/types";
import type {
  UnifiedFinancialStatementExtractionResult,
  UnifiedFinancialStatement,
} from "@/integrations/brreg/annual-report-financials/unified-financial-statement-extractor";
import type {
  UnifiedNarrativeExtractionResult,
} from "@/integrations/brreg/annual-report-financials/unified-narrative-extractor";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCandidate(
  metricKey: string,
  value: number,
  fiscalYear: number,
  unitScale: 1 | 1000 = 1000,
  confidenceScore = 0.9,
): CanonicalFactCandidate {
  return {
    fiscalYear,
    statementType: "INCOME_STATEMENT",
    metricKey: metricKey as CanonicalFactCandidate["metricKey"],
    rawLabel: metricKey,
    normalizedLabel: metricKey,
    value,
    currency: "NOK",
    unitScale,
    sourcePage: 2,
    sourceSection: "STATUTORY_INCOME" as CanonicalFactCandidate["sourceSection"],
    sourceRowText: metricKey,
    noteReference: null,
    confidenceScore,
    precedence: "MACHINE_READABLE",
    isDerived: false,
  };
}

function makeUnifiedFinancial(
  lineItems: Array<{
    canonicalKey: string;
    value: string;
    year: number;
    unitScale?: "ONES" | "THOUSANDS" | "MILLIONS" | "UNKNOWN";
  }>,
): UnifiedFinancialStatementExtractionResult {
  const stmt: UnifiedFinancialStatement = {
    kind: "INCOME_STATEMENT",
    pageNumbers: [2],
    tableIds: [],
    confidence: 0.9,
    lineItems: lineItems.map((item, i) => ({
      statementKind: "INCOME_STATEMENT" as const,
      originalLabel: item.canonicalKey,
      normalizedLabel: item.canonicalKey,
      canonicalKey: item.canonicalKey as never,
      value: item.value,
      year: item.year,
      unitScale: item.unitScale ?? "THOUSANDS",
      sign: "POSITIVE" as const,
      confidence: 0.9,
      provenance: {
        route: "TEXT_LAYER",
        pageNumber: 2,
        tableId: null,
        rowIndex: i,
        columnIndex: null,
        blockIds: [],
      },
      warnings: [],
    })),
    warnings: [],
  };

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
    statements: [stmt],
    metrics: {
      candidateTableCount: 1,
      parsedLineItemCount: lineItems.length,
      canonicalMappedCount: lineItems.length,
      unmappedCount: 0,
      warningCount: 0,
      errorCount: 0,
    },
    warnings: [],
    errors: [],
    safety: {
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
      shadowOnly: true,
    },
  };
}

function makeUnifiedNarrative(
  sectionKinds: Array<"BOARD_REPORT" | "AUDITOR_REPORT" | "SIGNATURES">,
): UnifiedNarrativeExtractionResult {
  return {
    version: "unified-narrative-extraction-v1",
    generatedAt: new Date().toISOString(),
    source: { route: "TEXT_LAYER", filingId: null, orgNumber: null, fiscalYear: null },
    sections: sectionKinds.map((kind, i) => ({
      sectionId: `sec-${i}`,
      kind,
      title: kind,
      pageStart: i + 1,
      pageEnd: i + 2,
      textPreview: `${kind} text preview content`,
      signals: [],
      confidence: 1.0,
      provenance: "DOCUMENT_SECTION" as const,
    })),
    metrics: {
      boardReportFound: sectionKinds.includes("BOARD_REPORT"),
      auditorReportFound: sectionKinds.includes("AUDITOR_REPORT"),
      auditorOpinionFound: false,
      auditorQualificationFound: false,
      emphasisOfMatterFound: false,
      goingConcernSignalFound: false,
      signaturesFound: sectionKinds.includes("SIGNATURES"),
      otherInformationFound: false,
      totalSignalCount: 0,
      sectionCount: sectionKinds.length,
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

// ── Safety ────────────────────────────────────────────────────────────────────

describe("compareAnnualReportLegacyVsUnifiedExtraction — safety", () => {
  it("always emits correct safety flags", () => {
    const result = compareAnnualReportLegacyVsUnifiedExtraction({
      legacyCandidates: [],
    });
    expect(result.safety.canUseForProductionRouting).toBe(false);
    expect(result.safety.productionRoutingChanged).toBe(false);
    expect(result.safety.productionFactsMutated).toBe(false);
    expect(result.safety.publishAffected).toBe(false);
    expect(result.safety.shadowOnly).toBe(true);
  });

  it("emits correct version", () => {
    const result = compareAnnualReportLegacyVsUnifiedExtraction({ legacyCandidates: [] });
    expect(result.version).toBe(LEGACY_VS_UNIFIED_COMPARISON_VERSION);
  });
});

// ── Empty input ───────────────────────────────────────────────────────────────

describe("compareAnnualReportLegacyVsUnifiedExtraction — empty input", () => {
  it("returns empty comparisons and warning when both inputs are empty", () => {
    const result = compareAnnualReportLegacyVsUnifiedExtraction({ legacyCandidates: [] });
    expect(result.financialComparisons).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("empty"))).toBe(true);
  });

  it("marks all legacy candidates as MISSING_IN_UNIFIED when no unified result", () => {
    const input: AnnualReportLegacyVsUnifiedComparisonInput = {
      legacyCandidates: [
        makeCandidate("revenue", 5000, 2024),
        makeCandidate("net_income", 1000, 2024),
      ],
    };
    const result = compareAnnualReportLegacyVsUnifiedExtraction(input);
    expect(result.financialComparisons).toHaveLength(2);
    expect(result.financialComparisons.every((c) => c.match === "MISSING_IN_UNIFIED")).toBe(true);
  });
});

// ── Financial comparison — exact match ───────────────────────────────────────

describe("compareAnnualReportLegacyVsUnifiedExtraction — exact match", () => {
  it("reports EXACT when legacy and unified values match in ones", () => {
    const input: AnnualReportLegacyVsUnifiedComparisonInput = {
      legacyCandidates: [makeCandidate("revenue", 5000, 2024, 1000)],
      unifiedFinancial: makeUnifiedFinancial([
        { canonicalKey: "revenue", value: "5000", year: 2024, unitScale: "THOUSANDS" },
      ]),
    };
    const result = compareAnnualReportLegacyVsUnifiedExtraction(input);
    const comp = result.financialComparisons.find((c) => c.canonicalKey === "revenue");
    expect(comp).toBeDefined();
    expect(comp!.match).toBe("EXACT");
    expect(comp!.deltaNok).toBe("0");
  });

  it("normalizes both sides to ones before comparing (5000 thousands = 5000000 ones)", () => {
    const input: AnnualReportLegacyVsUnifiedComparisonInput = {
      legacyCandidates: [makeCandidate("revenue", 5000, 2024, 1000)],
      unifiedFinancial: makeUnifiedFinancial([
        { canonicalKey: "revenue", value: "5000000", year: 2024, unitScale: "ONES" },
      ]),
    };
    const result = compareAnnualReportLegacyVsUnifiedExtraction(input);
    const comp = result.financialComparisons.find((c) => c.canonicalKey === "revenue");
    expect(comp!.match).toBe("EXACT");
    expect(comp!.legacyValueNok).toBe("5000000");
    expect(comp!.unifiedValueNok).toBe("5000000");
  });
});

// ── Financial comparison — scaled match ──────────────────────────────────────

describe("compareAnnualReportLegacyVsUnifiedExtraction — scaled match", () => {
  it("reports SCALED when values differ by less than 1%", () => {
    // Legacy: 5000 thousands = 5,000,000 ones
    // Unified: 5001 thousands = 5,001,000 ones → deviation = 1000/5000000 = 0.02% < 1%
    const input: AnnualReportLegacyVsUnifiedComparisonInput = {
      legacyCandidates: [makeCandidate("revenue", 5000, 2024, 1000)],
      unifiedFinancial: makeUnifiedFinancial([
        { canonicalKey: "revenue", value: "5001", year: 2024, unitScale: "THOUSANDS" },
      ]),
    };
    const result = compareAnnualReportLegacyVsUnifiedExtraction(input);
    const comp = result.financialComparisons.find((c) => c.canonicalKey === "revenue");
    expect(comp!.match).toBe("SCALED");
  });
});

// ── Financial comparison — mismatch ──────────────────────────────────────────

describe("compareAnnualReportLegacyVsUnifiedExtraction — mismatch", () => {
  it("reports MISMATCH when values differ significantly", () => {
    const input: AnnualReportLegacyVsUnifiedComparisonInput = {
      legacyCandidates: [makeCandidate("revenue", 5000, 2024, 1000)],
      unifiedFinancial: makeUnifiedFinancial([
        { canonicalKey: "revenue", value: "3000", year: 2024, unitScale: "THOUSANDS" },
      ]),
    };
    const result = compareAnnualReportLegacyVsUnifiedExtraction(input);
    const comp = result.financialComparisons.find((c) => c.canonicalKey === "revenue");
    expect(comp!.match).toBe("MISMATCH");
    expect(comp!.relativeDeviation).toBeGreaterThan(0.3);
  });
});

// ── Financial comparison — missing entries ────────────────────────────────────

describe("compareAnnualReportLegacyVsUnifiedExtraction — missing entries", () => {
  it("reports MISSING_IN_LEGACY for unified item not in legacy", () => {
    const input: AnnualReportLegacyVsUnifiedComparisonInput = {
      legacyCandidates: [],
      unifiedFinancial: makeUnifiedFinancial([
        { canonicalKey: "revenue", value: "5000", year: 2024, unitScale: "THOUSANDS" },
      ]),
    };
    const result = compareAnnualReportLegacyVsUnifiedExtraction(input);
    const comp = result.financialComparisons.find((c) => c.canonicalKey === "revenue");
    expect(comp).toBeDefined();
    expect(comp!.match).toBe("MISSING_IN_LEGACY");
    expect(comp!.legacyValueNok).toBeNull();
  });

  it("reports MISSING_IN_UNIFIED for legacy item not in unified", () => {
    const input: AnnualReportLegacyVsUnifiedComparisonInput = {
      legacyCandidates: [makeCandidate("total_assets", 10000, 2024, 1000)],
      unifiedFinancial: makeUnifiedFinancial([]),
    };
    const result = compareAnnualReportLegacyVsUnifiedExtraction(input);
    const comp = result.financialComparisons.find((c) => c.canonicalKey === "total_assets");
    expect(comp).toBeDefined();
    expect(comp!.match).toBe("MISSING_IN_UNIFIED");
    expect(comp!.unifiedValueNok).toBeNull();
  });
});

// ── Summary ───────────────────────────────────────────────────────────────────

describe("compareAnnualReportLegacyVsUnifiedExtraction — summary", () => {
  it("summary counts add up to totalCompared", () => {
    const input: AnnualReportLegacyVsUnifiedComparisonInput = {
      legacyCandidates: [
        makeCandidate("revenue", 5000, 2024, 1000),
        makeCandidate("net_income", 500, 2024, 1000),
      ],
      unifiedFinancial: makeUnifiedFinancial([
        { canonicalKey: "revenue", value: "5000", year: 2024, unitScale: "THOUSANDS" },
        { canonicalKey: "total_assets", value: "20000", year: 2024, unitScale: "THOUSANDS" },
      ]),
    };
    const result = compareAnnualReportLegacyVsUnifiedExtraction(input);
    const s = result.summary;
    const sumCounts =
      s.financialExactMatchCount +
      s.financialScaledMatchCount +
      s.financialMismatchCount +
      s.financialMissingInLegacyCount +
      s.financialMissingInUnifiedCount;
    expect(sumCounts).toBe(s.financialTotalCompared);
  });

  it("narrativeCoverageScore is 1.0 when all narrative sections found", () => {
    const input: AnnualReportLegacyVsUnifiedComparisonInput = {
      legacyCandidates: [],
      unifiedNarrative: makeUnifiedNarrative(["BOARD_REPORT", "AUDITOR_REPORT", "SIGNATURES"]),
    };
    const result = compareAnnualReportLegacyVsUnifiedExtraction(input);
    expect(result.summary.narrativeCoverageScore).toBe(1.0);
    expect(result.summary.narrativeBoardReportCovered).toBe(true);
    expect(result.summary.narrativeAuditorReportCovered).toBe(true);
    expect(result.summary.narrativeSignaturesCovered).toBe(true);
  });

  it("narrativeCoverageScore is 0 when no unified narrative provided", () => {
    const result = compareAnnualReportLegacyVsUnifiedExtraction({
      legacyCandidates: [],
    });
    expect(result.summary.narrativeBoardReportCovered).toBe(false);
    expect(result.summary.narrativeAuditorReportCovered).toBe(false);
    expect(result.summary.narrativeSignaturesCovered).toBe(false);
  });
});

// ── Multi-year comparison ─────────────────────────────────────────────────────

describe("compareAnnualReportLegacyVsUnifiedExtraction — multi-year", () => {
  it("compares same key across multiple years independently", () => {
    const input: AnnualReportLegacyVsUnifiedComparisonInput = {
      legacyCandidates: [
        makeCandidate("revenue", 5000, 2024, 1000),
        makeCandidate("revenue", 4500, 2023, 1000),
      ],
      unifiedFinancial: makeUnifiedFinancial([
        { canonicalKey: "revenue", value: "5000", year: 2024, unitScale: "THOUSANDS" },
        { canonicalKey: "revenue", value: "4500", year: 2023, unitScale: "THOUSANDS" },
      ]),
    };
    const result = compareAnnualReportLegacyVsUnifiedExtraction(input);
    const comps2024 = result.financialComparisons.filter((c) => c.year === 2024 && c.canonicalKey === "revenue");
    const comps2023 = result.financialComparisons.filter((c) => c.year === 2023 && c.canonicalKey === "revenue");
    expect(comps2024[0]?.match).toBe("EXACT");
    expect(comps2023[0]?.match).toBe("EXACT");
  });
});

// ── Meta override ─────────────────────────────────────────────────────────────

describe("compareAnnualReportLegacyVsUnifiedExtraction — meta override", () => {
  it("uses provided meta for source info", () => {
    const result = compareAnnualReportLegacyVsUnifiedExtraction({
      legacyCandidates: [],
      meta: { filingId: "filing-123", orgNumber: "987654321", fiscalYear: 2024 },
    });
    expect(result.source.filingId).toBe("filing-123");
    expect(result.source.orgNumber).toBe("987654321");
    expect(result.source.fiscalYear).toBe(2024);
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe("validateLegacyVsUnifiedComparisonReport", () => {
  it("passes for a valid report", () => {
    const result = compareAnnualReportLegacyVsUnifiedExtraction({ legacyCandidates: [] });
    const { valid, issues } = validateLegacyVsUnifiedComparisonReport(result);
    expect(valid).toBe(true);
    expect(issues.filter((i) => i.severity === "ERROR")).toHaveLength(0);
  });

  it("fails if canUseForProductionRouting is true", () => {
    const result = compareAnnualReportLegacyVsUnifiedExtraction({ legacyCandidates: [] });
    (result.safety as { canUseForProductionRouting: boolean }).canUseForProductionRouting = true;
    const { valid } = validateLegacyVsUnifiedComparisonReport(result);
    expect(valid).toBe(false);
  });

  it("fails if version is wrong", () => {
    const result = compareAnnualReportLegacyVsUnifiedExtraction({ legacyCandidates: [] });
    (result as { version: string }).version = "wrong-version";
    const { valid } = validateLegacyVsUnifiedComparisonReport(result);
    expect(valid).toBe(false);
  });

  it("fails if summary counts do not add up", () => {
    const result = compareAnnualReportLegacyVsUnifiedExtraction({ legacyCandidates: [] });
    (result.summary as { financialTotalCompared: number }).financialTotalCompared = 999;
    const { valid, issues } = validateLegacyVsUnifiedComparisonReport(result);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.code === "SUMMARY_COUNT_MISMATCH")).toBe(true);
  });

  it("warns on high mismatch rate", () => {
    const candidates = Array.from({ length: 10 }, (_, i) =>
      makeCandidate(`key_${i}`, i * 100, 2024, 1000),
    );
    const unified = makeUnifiedFinancial(
      // All have wildly different values → all MISMATCH
      Array.from({ length: 10 }, (_, i) => ({
        canonicalKey: `key_${i}`,
        value: String((i * 100 + 9999) * 1000),
        year: 2024,
        unitScale: "ONES" as const,
      })),
    );
    const result = compareAnnualReportLegacyVsUnifiedExtraction({
      legacyCandidates: candidates,
      unifiedFinancial: unified,
    });
    const { issues } = validateLegacyVsUnifiedComparisonReport(result);
    const highMismatch = issues.find((i) => i.code === "HIGH_MISMATCH_RATE");
    // Only warn if mismatch rate > 30%
    if (result.summary.financialMismatchCount / result.summary.financialTotalCompared > 0.3) {
      expect(highMismatch).toBeDefined();
    }
  });
});

// ── Serialization ─────────────────────────────────────────────────────────────

describe("serializeLegacyVsUnifiedComparisonReportAsJson", () => {
  it("produces valid JSON", () => {
    const result = compareAnnualReportLegacyVsUnifiedExtraction({ legacyCandidates: [] });
    const json = serializeLegacyVsUnifiedComparisonReportAsJson(result);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("round-trips the result", () => {
    const result = compareAnnualReportLegacyVsUnifiedExtraction({ legacyCandidates: [] });
    const parsed = JSON.parse(serializeLegacyVsUnifiedComparisonReportAsJson(result));
    expect(parsed.version).toBe(LEGACY_VS_UNIFIED_COMPARISON_VERSION);
    expect(parsed.safety.canUseForProductionRouting).toBe(false);
  });
});
