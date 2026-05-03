import { describe, expect, it } from "vitest";

import {
  buildPdfDecisionArtifactPayload,
  PDF_DECISION_ENGINE_VERSION,
  runPdfDecisionEngine,
} from "./pdf-decision-engine";
import {
  clampPdfDecisionConfidence,
  DEFAULT_PDF_DECISION_RULE_CONFIG,
} from "./pdf-decision-rule-config";
import type { FinancialExtractionPageHints } from "./financial-extraction-page-hints";
import type { AnnualReportDocument, SectionKind } from "./document-model";
import type { PreflightResult } from "./types";

function makePage(pageNumber: number, rawText = "text") {
  return {
    pageNumber,
    rawText,
    normalizedText: rawText.toLowerCase(),
    charCount: rawText.length,
  };
}

function makeDocument(
  sectionKinds: SectionKind[],
  qualityRisk: "LOW" | "MEDIUM" | "HIGH" = "LOW",
): AnnualReportDocument {
  const pages = sectionKinds.map((kind, index) => makePage(index + 1, kind));
  const sections = sectionKinds.map((kind, index) => ({
    kind,
    startPage: index + 1,
    endPage: index + 1,
    pages: [pages[index]],
    confidenceScore: 0.9,
    matchedSignals: [],
    stopReason: null,
  }));

  return {
    pages,
    sections,
    narratives: [],
    diagnostics: {
      pageCount: pages.length,
      sectionsFound: sections.length,
      sectionKinds,
      missingExpectedSections:
        sectionKinds.includes("INCOME_STATEMENT") &&
        sectionKinds.some((kind) => ["BALANCE", "BALANCE_SHEET"].includes(kind))
          ? []
          : ["INCOME_STATEMENT", "BALANCE_SHEET"],
      recommendedRouteHint: qualityRisk === "HIGH" ? "OPENDATALOADER_HYBRID" : "TEXT_LAYER",
      textLayerDensityScore: qualityRisk === "HIGH" ? 0.2 : 0.9,
      likelyImageOnlyPages: qualityRisk === "HIGH" ? [1] : [],
      financialStatementPageCount: sectionKinds.filter((kind) =>
        ["INCOME_STATEMENT", "BALANCE", "BALANCE_SHEET"].includes(kind),
      ).length,
      financialStatementCandidatePages: [],
      narrativeCandidatePages: [],
      boardReportCandidatePages: sectionKinds.includes("BOARD_REPORT") ? [1] : [],
      auditorReportCandidatePages: sectionKinds.includes("AUDITOR_REPORT") ? [2] : [],
      notesCandidatePages: sectionKinds.includes("NOTES") ? [3] : [],
      qualityRisk,
      parserRiskReasons: qualityRisk === "HIGH" ? ["Weak text layer"] : [],
      extractionWarnings: [],
    },
  };
}

function makePreflight(
  doc: AnnualReportDocument | null,
  overrides?: Partial<PreflightResult>,
): PreflightResult {
  return {
    pageCount: doc?.pages.length ?? 0,
    hasTextLayer: true,
    hasReliableTextLayer: true,
    parsedPages: [],
    diagnostics: doc?.diagnostics,
    structuredDocument: doc ?? undefined,
    ...overrides,
  };
}

function makePageHints(
  overrides?: Partial<FinancialExtractionPageHints>,
): FinancialExtractionPageHints {
  return {
    includePages: [1, 2],
    excludePages: new Set<number>(),
    preferredIncomeStatementPages: [1],
    preferredBalancePages: [2],
    notePages: [],
    hasReliableHints: true,
    reasons: ["2 financial statement page(s) detected"],
    ...overrides,
  };
}

describe("runPdfDecisionEngine", () => {
  it("returns low risk and high confidence for reliable text with income and balance", () => {
    const doc = makeDocument(["INCOME_STATEMENT", "BALANCE_SHEET"]);
    const decision = runPdfDecisionEngine({
      preflight: makePreflight(doc),
      pageHints: makePageHints(),
      odlConfig: { enabled: false, mode: "local" },
    });

    expect(decision.version).toBe(PDF_DECISION_ENGINE_VERSION);
    expect(decision.ruleConfigVersion).toBe(DEFAULT_PDF_DECISION_RULE_CONFIG.version);
    expect(decision.diagnostics.ruleConfigVersion).toBe(DEFAULT_PDF_DECISION_RULE_CONFIG.version);
    expect(decision.route).toBe("TEXT_LAYER");
    expect(decision.riskLevel).toBe("LOW");
    expect(decision.confidenceScore).toBeGreaterThan(0.85);
    expect(decision.reasons.length).toBeGreaterThan(0);
    expect(decision.enabledExtractors.financialFacts).toBe(true);
    expect(decision.enabledExtractors.boardReport).toBe(false);
    expect(decision.pageHints.includePages).toEqual([1, 2]);
    expect(JSON.stringify(decision)).toContain("pdf-decision-engine-v1");
  });

  it("custom high quality risk penalty lowers confidence", () => {
    const doc = makeDocument(["INCOME_STATEMENT", "BALANCE_SHEET"], "HIGH");
    const baseDecision = runPdfDecisionEngine({
      preflight: makePreflight(doc),
      pageHints: makePageHints(),
    });
    const tunedDecision = runPdfDecisionEngine(
      {
        preflight: makePreflight(doc),
        pageHints: makePageHints(),
      },
      { ruleConfig: { confidence: { penalties: { highQualityRisk: 0.5 } } } },
    );

    expect(tunedDecision.confidenceScore).toBeLessThan(baseDecision.confidenceScore);
  });

  it("custom reliable page hints bonus raises confidence", () => {
    const doc = makeDocument(["INCOME_STATEMENT", "BALANCE_SHEET"]);
    const baseDecision = runPdfDecisionEngine({
      preflight: makePreflight(doc),
      pageHints: makePageHints(),
    });
    const tunedDecision = runPdfDecisionEngine(
      {
        preflight: makePreflight(doc),
        pageHints: makePageHints(),
      },
      { ruleConfig: { confidence: { bonuses: { reliablePageHints: 0.15 } } } },
    );

    expect(tunedDecision.confidenceScore).toBeGreaterThan(baseDecision.confidenceScore);
  });

  it("clamps confidence scores through rule config", () => {
    expect(clampPdfDecisionConfidence(-10)).toBe(0);
    expect(clampPdfDecisionConfidence(10)).toBe(1);
    expect(clampPdfDecisionConfidence(Number.NaN)).toBe(0);
  });

  it("routes high-risk unreliable text to OpenDataLoader hybrid when enabled", () => {
    const doc = makeDocument(["INCOME_STATEMENT", "BALANCE_SHEET"], "HIGH");
    const decision = runPdfDecisionEngine({
      preflight: makePreflight(doc, { hasTextLayer: false, hasReliableTextLayer: false }),
      pageHints: makePageHints({ hasReliableHints: false }),
      odlConfig: { enabled: true, mode: "auto" },
    });

    expect(decision.route).toBe("OPENDATALOADER_HYBRID");
    expect(decision.riskLevel).toBe("HIGH");
    expect(decision.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(decision.confidenceScore).toBeLessThanOrEqual(1);
    expect(decision.manualReviewReasons.some((reason) => reason.includes("High document quality risk"))).toBe(true);
  });

  it("routes unreliable text to OCR when OpenDataLoader is disabled and financial sections exist", () => {
    const doc = makeDocument(["INCOME_STATEMENT", "BALANCE_SHEET"], "MEDIUM");
    const decision = runPdfDecisionEngine({
      preflight: makePreflight(doc, { hasTextLayer: false, hasReliableTextLayer: false }),
      odlConfig: { enabled: false, mode: "local" },
    });

    expect(decision.route).toBe("FORCE_OCR");
    expect(decision.riskLevel).toBe("HIGH");
    expect(decision.enabledExtractors.financialFacts).toBe(true);
  });

  it("adds validation blocking errors to manual review reasons and high risk", () => {
    const doc = makeDocument(["INCOME_STATEMENT", "BALANCE_SHEET"]);
    const decision = runPdfDecisionEngine({
      preflight: makePreflight(doc),
      pageHints: makePageHints(),
      validationSummary: {
        hasBlockingErrors: true,
        blockingRuleCodes: ["BS_TOTAL_BALANCES"],
        warningRuleCodes: [],
        validationScore: 0.3,
      },
    });

    expect(decision.route).toBe("MANUAL_REVIEW");
    expect(decision.riskLevel).toBe("HIGH");
    expect(decision.enabledExtractors.financialFacts).toBe(false);
    expect(decision.manualReviewReasons.some((reason) => reason.includes("BS_TOTAL_BALANCES"))).toBe(true);
  });

  it("flags narratives present without financial sections", () => {
    const doc = makeDocument(["BOARD_REPORT", "AUDITOR_REPORT"]);
    const decision = runPdfDecisionEngine({
      preflight: makePreflight(doc),
      pageHints: makePageHints({
        includePages: [],
        preferredIncomeStatementPages: [],
        preferredBalancePages: [],
        hasReliableHints: false,
      }),
    });

    expect(decision.route).toBe("MANUAL_REVIEW");
    expect(decision.enabledExtractors.financialFacts).toBe(false);
    expect(decision.enabledExtractors.boardReport).toBe(true);
    expect(decision.enabledExtractors.auditorReport).toBe(true);
    expect(
      decision.manualReviewReasons.some((reason) => reason.includes("board/auditor narratives")),
    ).toBe(true);
  });

  it("handles sparse input without throwing", () => {
    const decision = runPdfDecisionEngine({
      preflight: {
        pageCount: 0,
        hasTextLayer: false,
        hasReliableTextLayer: false,
        parsedPages: [],
      },
    });

    expect(decision.route).toBe("MANUAL_REVIEW");
    expect(decision.riskLevel).toBe("HIGH");
    expect(decision.reasons.length).toBeGreaterThan(0);
    expect(decision.pageHints.includePages).toEqual([]);
    expect(decision.diagnostics.detectedSections).toEqual([]);
    expect(decision.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(decision.confidenceScore).toBeLessThanOrEqual(1);
  });

  it("builds a JSON-safe artifact wrapper", () => {
    const doc = makeDocument(["INCOME_STATEMENT", "BALANCE_SHEET"]);
    const decision = runPdfDecisionEngine({
      preflight: makePreflight(doc),
      pageHints: makePageHints(),
    });
    const payload = buildPdfDecisionArtifactPayload({
      decision,
      orgNumber: "928846466",
      fiscalYear: 2024,
      filingId: "filing-1",
      extractionRunId: "run-1",
      phase: "post_validation",
      hasPreflight: true,
      hasStructuredDocument: true,
      hasPageHints: true,
      hasValidationSummary: true,
      openDataLoaderEnabled: false,
    });

    expect(payload).toMatchObject({
      version: PDF_DECISION_ENGINE_VERSION,
      phase: "post_validation",
      source: "annual-report-financials-service",
      inputSummary: {
        orgNumber: "928846466",
        fiscalYear: 2024,
        filingId: "filing-1",
        extractionRunId: "run-1",
      },
    });
    expect(payload.decision).toEqual(decision);
    expect(() => JSON.stringify(payload)).not.toThrow();
  });
});
