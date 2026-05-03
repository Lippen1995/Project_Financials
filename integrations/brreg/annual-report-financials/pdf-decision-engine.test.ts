import { describe, it, expect } from "vitest";
import { runPdfDecisionEngine, PDF_DECISION_ENGINE_VERSION } from "./pdf-decision-engine";
import type { PreflightResult } from "./types";
import type { FinancialExtractionPageHints } from "./financial-extraction-page-hints";
import type { OpenDataLoaderResolvedConfig } from "@/server/document-understanding/opendataloader-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalPreflight(overrides?: Partial<PreflightResult>): PreflightResult {
  return {
    pageCount: 10,
    hasTextLayer: true,
    hasReliableTextLayer: true,
    parsedPages: [],
    ...overrides,
  };
}

function makePreflightWithDocument(
  sectionKinds: string[],
  qualityRisk: "LOW" | "MEDIUM" | "HIGH" = "LOW",
  overrides?: Partial<PreflightResult>,
): PreflightResult {
  const sections = sectionKinds.map((kind, idx) => ({
    kind: kind as any,
    startPage: idx * 2 + 1,
    endPage: idx * 2 + 2,
    pages: [
      { pageNumber: idx * 2 + 1, rawText: "text", normalizedText: "text", charCount: 100 },
      { pageNumber: idx * 2 + 2, rawText: "text", normalizedText: "text", charCount: 100 },
    ],
    confidenceScore: 0.9,
    matchedSignals: [],
    stopReason: null,
  }));

  const diagnostics = {
    pageCount: sectionKinds.length * 2 + 2,
    sectionsFound: sectionKinds.length,
    sectionKinds: sectionKinds as any[],
    missingExpectedSections: [],
    recommendedRouteHint: "TEXT_LAYER" as const,
    textLayerDensityScore: 0.9,
    likelyImageOnlyPages: [],
    financialStatementPageCount: sectionKinds.filter((k) =>
      ["INCOME_STATEMENT", "BALANCE", "BALANCE_SHEET", "CASH_FLOW"].includes(k),
    ).length * 2,
    financialStatementCandidatePages: [],
    narrativeCandidatePages: [],
    boardReportCandidatePages: [],
    auditorReportCandidatePages: [],
    notesCandidatePages: [],
    qualityRisk,
    parserRiskReasons: [],
    extractionWarnings: [],
  };

  return {
    pageCount: sectionKinds.length * 2 + 2,
    hasTextLayer: true,
    hasReliableTextLayer: true,
    parsedPages: [],
    // Mirror the real preflight: top-level diagnostics mirrors structuredDocument.diagnostics
    diagnostics,
    structuredDocument: {
      pages: [],
      sections,
      narratives: [],
      diagnostics,
    },
    ...overrides,
  };
}

function makePageHints(overrides?: Partial<FinancialExtractionPageHints>): FinancialExtractionPageHints {
  return {
    includePages: [1, 2, 3],
    excludePages: new Set<number>([4, 5]),
    preferredIncomeStatementPages: [1, 2],
    preferredBalancePages: [3],
    notePages: [],
    hasReliableHints: true,
    reasons: ["3 financial statement page(s) detected"],
    ...overrides,
  };
}

function makeOdlConfig(
  enabled: boolean,
  mode: OpenDataLoaderResolvedConfig["mode"] = "auto",
): Pick<OpenDataLoaderResolvedConfig, "enabled" | "mode"> {
  return { enabled, mode };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("runPdfDecisionEngine", () => {
  // Test 1: Reliable text + financial sections → TEXT_LAYER, LOW risk, financialFacts=true
  it("returns TEXT_LAYER route with LOW risk for reliable text layer and financial sections", () => {
    const preflight = makePreflightWithDocument(
      ["INCOME_STATEMENT", "BALANCE_SHEET"],
      "LOW",
    );
    const result = runPdfDecisionEngine({
      preflight,
      pageHints: makePageHints(),
      odlConfig: makeOdlConfig(false),
    });

    expect(result.route).toBe("TEXT_LAYER");
    expect(result.risk).toBe("LOW");
    expect(result.financialFacts).toBe(true);
    expect(result.manualReviewRequired).toBe(false);
    expect(result.manualReviewReasons).toHaveLength(0);
    expect(result.engineVersion).toBe(PDF_DECISION_ENGINE_VERSION);
  });

  // Test 2: Unreliable text + HIGH risk + ODL enabled → OPENDATALOADER_HYBRID, HIGH risk
  it("returns OPENDATALOADER_HYBRID route with HIGH risk for unreliable text and ODL enabled", () => {
    const preflight = makePreflightWithDocument(
      ["INCOME_STATEMENT", "BALANCE_SHEET"],
      "HIGH",
      { hasTextLayer: false, hasReliableTextLayer: false },
    );
    const result = runPdfDecisionEngine({
      preflight,
      pageHints: makePageHints({ hasReliableHints: false }),
      odlConfig: makeOdlConfig(true, "auto"),
    });

    expect(result.route).toBe("OPENDATALOADER_HYBRID");
    expect(result.risk).toBe("HIGH");
    expect(result.odlEnabled).toBe(true);
  });

  // Test 3: Unreliable text + HIGH risk + ODL disabled → FORCE_OCR (no financial facts → MANUAL_REVIEW)
  it("returns MANUAL_REVIEW for unreliable text, ODL disabled, and no financial sections", () => {
    const preflight = makePreflightWithDocument(
      [],
      "HIGH",
      { hasTextLayer: false, hasReliableTextLayer: false },
    );
    const result = runPdfDecisionEngine({
      preflight,
      odlConfig: makeOdlConfig(false),
    });

    // No financial sections → manual review required → route = MANUAL_REVIEW
    expect(result.route).toBe("MANUAL_REVIEW");
    expect(result.manualReviewRequired).toBe(true);
    expect(result.risk).toBe("HIGH");
  });

  it("returns FORCE_OCR for unreliable text, ODL disabled, but has financial sections", () => {
    const preflight = makePreflightWithDocument(
      ["INCOME_STATEMENT", "BALANCE_SHEET"],
      "MEDIUM",
      { hasTextLayer: false, hasReliableTextLayer: false },
    );
    const result = runPdfDecisionEngine({
      preflight,
      odlConfig: makeOdlConfig(false),
    });

    expect(result.route).toBe("FORCE_OCR");
    expect(result.manualReviewRequired).toBe(false);
    expect(result.risk).toBe("HIGH"); // unreliable text → HIGH
  });

  // Test 4: No financial sections → manualReviewReasons includes financial warning, financialFacts=false
  it("sets financialFacts=false and includes a manual review reason when no financial sections exist", () => {
    const preflight = makePreflightWithDocument([], "LOW");
    const result = runPdfDecisionEngine({
      preflight,
      odlConfig: makeOdlConfig(false),
    });

    expect(result.financialFacts).toBe(false);
    expect(result.manualReviewRequired).toBe(true);
    expect(
      result.manualReviewReasons.some((r) => r.includes("financial statement sections")),
    ).toBe(true);
  });

  // Test 5: Validation blocking errors → manualReviewReasons includes blocking codes, risk HIGH
  it("includes blocking codes in manualReviewReasons and sets risk=HIGH", () => {
    const preflight = makePreflightWithDocument(["INCOME_STATEMENT", "BALANCE_SHEET"], "LOW");
    const result = runPdfDecisionEngine({
      preflight,
      odlConfig: makeOdlConfig(false),
      blockingRuleCodes: ["BALANCE_SHEET_MISMATCH", "SCALE_CONFLICT"],
    });

    expect(result.risk).toBe("HIGH");
    expect(result.manualReviewRequired).toBe(true);
    expect(result.blockingRuleCodes).toContain("BALANCE_SHEET_MISMATCH");
    expect(result.blockingRuleCodes).toContain("SCALE_CONFLICT");
    expect(
      result.manualReviewReasons.some((r) => r.includes("BALANCE_SHEET_MISMATCH")),
    ).toBe(true);
  });

  // Test 6: Board/auditor narratives but no financial sections → manual review reason
  it("flags manual review when only narrative sections exist without financial sections", () => {
    const preflight = makePreflightWithDocument(["BOARD_REPORT", "AUDITOR_REPORT"], "LOW");
    const result = runPdfDecisionEngine({
      preflight,
      odlConfig: makeOdlConfig(false),
    });

    expect(result.financialFacts).toBe(false);
    expect(result.manualReviewRequired).toBe(true);
    expect(
      result.manualReviewReasons.some((r) =>
        r.includes("board/auditor narratives") || r.includes("financial statement sections"),
      ),
    ).toBe(true);
  });

  // Test 7: Page hints reliable → included in output
  it("includes reliable page hint summary in output", () => {
    const preflight = makePreflightWithDocument(["INCOME_STATEMENT", "BALANCE_SHEET"], "LOW");
    const hints = makePageHints({
      hasReliableHints: true,
      includePages: [1, 2, 3, 4],
      excludePages: new Set<number>([5, 6]),
      preferredIncomeStatementPages: [1, 2],
      preferredBalancePages: [3, 4],
    });
    const result = runPdfDecisionEngine({
      preflight,
      pageHints: hints,
      odlConfig: makeOdlConfig(false),
    });

    expect(result.pageHintSummary).not.toBeNull();
    expect(result.pageHintSummary?.hasReliableHints).toBe(true);
    expect(result.pageHintSummary?.includePageCount).toBe(4);
    expect(result.pageHintSummary?.excludePageCount).toBe(2);
    expect(result.pageHintSummary?.preferredIncomeStatementPageCount).toBe(2);
    expect(result.pageHintSummary?.preferredBalancePageCount).toBe(2);
  });

  // Test 8: Sparse / empty input → no throw, returns UNKNOWN or MANUAL_REVIEW
  it("handles sparse input without throwing and returns a valid result", () => {
    const preflight: PreflightResult = {
      pageCount: 0,
      hasTextLayer: false,
      hasReliableTextLayer: false,
      parsedPages: [],
    };

    let result;
    expect(() => {
      result = runPdfDecisionEngine({ preflight });
    }).not.toThrow();

    expect(result).toBeDefined();
    expect(result!.engineVersion).toBe(PDF_DECISION_ENGINE_VERSION);
    // No financial sections → manual review
    expect(result!.manualReviewRequired).toBe(true);
    expect(["MANUAL_REVIEW", "FORCE_OCR", "UNKNOWN"]).toContain(result!.route);
  });

  it("handles completely minimal preflight without structuredDocument", () => {
    const preflight = makeMinimalPreflight();
    const result = runPdfDecisionEngine({ preflight });

    expect(result).toBeDefined();
    expect(result.decidedAt).toBeTruthy();
    // No document → no financial sections → manual review
    expect(result.financialFacts).toBe(false);
    expect(result.manualReviewRequired).toBe(true);
  });

  it("returns null pageHintSummary when no hints provided", () => {
    const preflight = makePreflightWithDocument(["INCOME_STATEMENT"], "LOW");
    const result = runPdfDecisionEngine({ preflight, odlConfig: makeOdlConfig(false) });

    expect(result.pageHintSummary).toBeNull();
  });

  it("returns OPENDATALOADER_LOCAL when text is reliable and ODL is enabled", () => {
    const preflight = makePreflightWithDocument(["INCOME_STATEMENT", "BALANCE_SHEET"], "LOW");
    const result = runPdfDecisionEngine({
      preflight,
      odlConfig: makeOdlConfig(true, "local"),
    });

    expect(result.route).toBe("OPENDATALOADER_LOCAL");
    expect(result.odlEnabled).toBe(true);
  });

  it("reflects preflight signals correctly in output", () => {
    const preflight = makePreflightWithDocument(
      ["INCOME_STATEMENT", "BALANCE_SHEET", "NOTES"],
      "MEDIUM",
    );
    const result = runPdfDecisionEngine({ preflight, odlConfig: makeOdlConfig(false) });

    expect(result.preflightSignals.hasTextLayer).toBe(true);
    expect(result.preflightSignals.hasReliableTextLayer).toBe(true);
    expect(result.preflightSignals.sectionKinds).toContain("INCOME_STATEMENT");
    expect(result.preflightSignals.sectionKinds).toContain("NOTES");
    expect(result.preflightSignals.qualityRisk).toBe("MEDIUM");
  });
});
