import { describe, expect, it } from "vitest";

import { getFinancialExtractionPageHints } from "@/integrations/brreg/annual-report-financials/financial-extraction-page-hints";
import {
  AnnualReportDocument,
  AnnualReportPage,
  AnnualReportSection,
} from "@/integrations/brreg/annual-report-financials/document-model";

function makePage(pageNumber: number): AnnualReportPage {
  return { pageNumber, rawText: "", normalizedText: "", charCount: 0 };
}

function makeSection(
  kind: AnnualReportSection["kind"],
  startPage: number,
  endPage: number,
  confidenceScore = 0.8,
): AnnualReportSection {
  const pages: AnnualReportPage[] = [];
  for (let p = startPage; p <= endPage; p++) {
    pages.push(makePage(p));
  }
  return {
    kind,
    startPage,
    endPage,
    pages,
    confidenceScore,
    matchedSignals: [],
  };
}

function makeDoc(sections: AnnualReportSection[]): AnnualReportDocument {
  const allPages = sections.flatMap((s) => s.pages);
  const uniquePages = Array.from(
    new Map(allPages.map((p) => [p.pageNumber, p])).values(),
  ).sort((a, b) => a.pageNumber - b.pageNumber);

  return {
    pages: uniquePages,
    sections,
    narratives: [],
    diagnostics: {
      pageCount: uniquePages.length,
      sectionsFound: sections.length,
      sectionKinds: [...new Set(sections.map((s) => s.kind))],
      missingExpectedSections: [],
      recommendedRouteHint: "TEXT_LAYER",
      textLayerDensityScore: 0.9,
      likelyImageOnlyPages: [],
      financialStatementPageCount: 0,
      financialStatementCandidatePages: [],
      narrativeCandidatePages: [],
      boardReportCandidatePages: [],
      auditorReportCandidatePages: [],
      notesCandidatePages: [],
      qualityRisk: "LOW",
      parserRiskReasons: [],
      extractionWarnings: [],
    },
  };
}

describe("getFinancialExtractionPageHints - no sections", () => {
  it("returns no-filter fallback when document has no sections", () => {
    const hints = getFinancialExtractionPageHints(makeDoc([]));
    expect(hints.hasReliableHints).toBe(false);
    expect(hints.excludePages.size).toBe(0);
    expect(hints.includePages).toEqual([]);
    expect(hints.reasons[0]).toMatch(/no sections detected/i);
  });
});

describe("getFinancialExtractionPageHints - financial sections only", () => {
  it("includes income statement pages", () => {
    const hints = getFinancialExtractionPageHints(makeDoc([makeSection("INCOME_STATEMENT", 3, 4)]));
    expect(hints.hasReliableHints).toBe(true);
    expect(hints.includePages).toEqual([3, 4]);
    expect(hints.preferredIncomeStatementPages).toEqual([3, 4]);
    expect(hints.excludePages.size).toBe(0);
  });

  it("includes balance sheet pages", () => {
    const hints = getFinancialExtractionPageHints(makeDoc([makeSection("BALANCE_SHEET", 5, 7)]));
    expect(hints.hasReliableHints).toBe(true);
    expect(hints.includePages).toEqual([5, 6, 7]);
    expect(hints.preferredBalancePages).toEqual([5, 6, 7]);
  });
});

describe("getFinancialExtractionPageHints - exclude narrative/auditor/signature pages", () => {
  it("excludes board report pages when financial pages also exist", () => {
    const hints = getFinancialExtractionPageHints(
      makeDoc([
        makeSection("BOARD_REPORT", 1, 2, 0.9),
        makeSection("INCOME_STATEMENT", 3, 4, 0.9),
      ]),
    );
    expect(hints.excludePages.has(1)).toBe(true);
    expect(hints.excludePages.has(2)).toBe(true);
    expect(hints.excludePages.has(3)).toBe(false);
    expect(hints.excludePages.has(4)).toBe(false);
  });

  it("excludes auditor report pages when financial pages exist", () => {
    const hints = getFinancialExtractionPageHints(
      makeDoc([
        makeSection("AUDITOR_REPORT", 8, 10, 0.85),
        makeSection("BALANCE_SHEET", 5, 7, 0.9),
      ]),
    );
    expect(hints.hasReliableHints).toBe(true);
    expect(hints.excludePages.has(8)).toBe(true);
    expect(hints.excludePages.has(9)).toBe(true);
    expect(hints.excludePages.has(10)).toBe(true);
    expect(hints.excludePages.has(5)).toBe(false);
  });

  it("excludes signatures pages", () => {
    const hints = getFinancialExtractionPageHints(
      makeDoc([
        makeSection("SIGNATURES", 11, 11, 0.9),
        makeSection("INCOME_STATEMENT", 3, 3, 0.9),
      ]),
    );
    expect(hints.excludePages.has(11)).toBe(true);
  });

  it("does not exclude low-confidence narrative pages", () => {
    const hints = getFinancialExtractionPageHints(
      makeDoc([
        makeSection("BOARD_REPORT", 1, 2, 0.2),
        makeSection("INCOME_STATEMENT", 3, 4, 0.9),
      ]),
    );
    expect(hints.excludePages.has(1)).toBe(false);
    expect(hints.excludePages.has(2)).toBe(false);
  });
});

describe("getFinancialExtractionPageHints - boundary page safety", () => {
  it("does not exclude a page that is both financial and narrative", () => {
    const hints = getFinancialExtractionPageHints(
      makeDoc([
        makeSection("BOARD_REPORT", 1, 3, 0.9),
        makeSection("INCOME_STATEMENT", 3, 5, 0.9),
      ]),
    );
    expect(hints.excludePages.has(3)).toBe(false);
    expect(hints.excludePages.has(1)).toBe(true);
    expect(hints.excludePages.has(2)).toBe(true);
  });
});

describe("getFinancialExtractionPageHints - notes", () => {
  it("excludes note pages from the excludePages set", () => {
    const hints = getFinancialExtractionPageHints(
      makeDoc([
        makeSection("NOTES", 12, 20, 0.9),
        makeSection("INCOME_STATEMENT", 3, 4, 0.9),
      ]),
    );
    for (let p = 12; p <= 20; p++) {
      expect(hints.excludePages.has(p)).toBe(false);
    }
    expect(hints.notePages).toEqual([12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });
});

describe("getFinancialExtractionPageHints - conservative fallback", () => {
  it("returns hasReliableHints=false with empty excludePages when only low-confidence narratives exist", () => {
    const hints = getFinancialExtractionPageHints(
      makeDoc([
        makeSection("BOARD_REPORT", 1, 2, 0.1),
        makeSection("AUDITOR_REPORT", 3, 4, 0.15),
      ]),
    );
    expect(hints.hasReliableHints).toBe(false);
    expect(hints.excludePages.size).toBe(0);
  });

  it("returns hasReliableHints=false when only narrative/auditor/signature pages are detected", () => {
    const hints = getFinancialExtractionPageHints(
      makeDoc([
        makeSection("BOARD_REPORT", 1, 2, 0.9),
        makeSection("AUDITOR_REPORT", 3, 4, 0.9),
        makeSection("SIGNATURES", 5, 5, 0.9),
      ]),
    );
    expect(hints.hasReliableHints).toBe(false);
    expect(hints.excludePages.size).toBe(5);
    expect(hints.reasons).toContain(
      "Skipped financial page filtering because no reliable financial statement pages were detected",
    );
  });

  it("keeps auditor exclusions when financial statement pages exist", () => {
    const hints = getFinancialExtractionPageHints(
      makeDoc([
        makeSection("INCOME_STATEMENT", 2, 2, 0.9),
        makeSection("BALANCE_SHEET", 3, 3, 0.9),
        makeSection("AUDITOR_REPORT", 4, 4, 0.9),
      ]),
    );
    expect(hints.hasReliableHints).toBe(true);
    expect(hints.includePages).toEqual([2, 3]);
    expect(hints.excludePages.has(4)).toBe(true);
  });

  it("returns hasReliableHints=false when exclusions would remove all candidate pages", () => {
    const coverPage = makePage(1);
    const incomeSection = makeSection("INCOME_STATEMENT", 2, 2, 0.9);
    const doc: AnnualReportDocument = {
      ...makeDoc([makeSection("COVER", 1, 1, 0.9), incomeSection]),
      pages: [coverPage],
    };
    const hints = getFinancialExtractionPageHints(doc);
    expect(hints.hasReliableHints).toBe(false);
    expect(hints.excludePages.has(1)).toBe(true);
    expect(hints.reasons).toContain(
      "Skipped financial page filtering because exclusions would remove all candidate pages",
    );
  });
});
