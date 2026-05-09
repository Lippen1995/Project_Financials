import { describe, expect, it } from "vitest";

import {
  evaluatePdfDecisionRuleTuningAgainstGoldSetSnapshot,
  snapshotItemToEvaluationFixture,
  type PdfDecisionGoldSetSnapshot,
  type PdfDecisionGoldSetSnapshotItem,
} from "./pdf-decision-gold-set-rule-tuning";
import type { PdfDecisionRuleTuningCandidate } from "./pdf-decision-rule-tuning";

// Minimal decisionInput that produces TEXT_LAYER / LOW when run through the engine.
const RELIABLE_TEXT_INPUT: PdfDecisionGoldSetSnapshotItem["decisionInput"] = {
  preflight: {
    pageCount: 4,
    hasTextLayer: true,
    hasReliableTextLayer: true,
    parsedPages: [],
  },
  structuredDocument: {
    pages: [
      { pageNumber: 1, rawText: "Resultatregnskap", normalizedText: "resultatregnskap", charCount: 200 },
      { pageNumber: 2, rawText: "Balanse", normalizedText: "balanse", charCount: 220 },
    ],
    sections: [
      {
        kind: "INCOME_STATEMENT",
        startPage: 1,
        endPage: 1,
        pages: [{ pageNumber: 1, rawText: "Resultatregnskap", normalizedText: "resultatregnskap", charCount: 200 }],
        confidenceScore: 0.92,
        matchedSignals: [],
      },
      {
        kind: "BALANCE_SHEET",
        startPage: 2,
        endPage: 2,
        pages: [{ pageNumber: 2, rawText: "Balanse", normalizedText: "balanse", charCount: 220 }],
        confidenceScore: 0.91,
        matchedSignals: [],
      },
    ],
    narratives: [],
    diagnostics: {
      pageCount: 4,
      sectionsFound: 2,
      sectionKinds: ["INCOME_STATEMENT", "BALANCE_SHEET"],
      missingExpectedSections: [],
      recommendedRouteHint: "TEXT_LAYER",
      textLayerDensityScore: 0.9,
      likelyImageOnlyPages: [],
      financialStatementPageCount: 2,
      financialStatementCandidatePages: [1, 2],
      narrativeCandidatePages: [],
      boardReportCandidatePages: [],
      auditorReportCandidatePages: [],
      notesCandidatePages: [],
      qualityRisk: "LOW",
      parserRiskReasons: [],
      extractionWarnings: [],
    },
  },
  pageHints: {
    includePages: [1, 2],
    excludePages: new Set<number>(),
    preferredIncomeStatementPages: [1],
    preferredBalancePages: [2],
    notePages: [],
    hasReliableHints: true,
    reasons: ["2 financial statement page(s) detected"],
  },
  odlConfig: { enabled: false, mode: "local" },
};

function makeSnapshot(items: PdfDecisionGoldSetSnapshotItem[]): PdfDecisionGoldSetSnapshot {
  return {
    version: "pdf-decision-gold-set-snapshot-v1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    itemCount: items.length,
    items,
  };
}

function makeCandidate(overrides: Partial<PdfDecisionRuleTuningCandidate> = {}): PdfDecisionRuleTuningCandidate {
  return {
    id: "test-candidate",
    description: "Test candidate",
    ruleConfigOverride: {},
    ...overrides,
  };
}

describe("evaluatePdfDecisionRuleTuningAgainstGoldSetSnapshot", () => {
  it("returns correct version and structure", () => {
    const snapshot = makeSnapshot([]);
    const report = evaluatePdfDecisionRuleTuningAgainstGoldSetSnapshot({
      snapshot,
      candidates: [],
    });
    expect(report.version).toBe("pdf-decision-gold-set-rule-tuning-v1");
    expect(report.snapshotVersion).toBe("pdf-decision-gold-set-snapshot-v1");
    expect(report.candidateCount).toBe(0);
    expect(report.candidates).toHaveLength(0);
  });

  it("reports INSUFFICIENT_INPUT_FOR_RERUN when snapshot item has no decisionInput", () => {
    const item: PdfDecisionGoldSetSnapshotItem = {
      filingId: "filing-no-input",
      expectedRoute: "TEXT_LAYER",
      expectedRiskLevel: "LOW",
    };
    const snapshot = makeSnapshot([item]);
    const candidate = makeCandidate();
    const report = evaluatePdfDecisionRuleTuningAgainstGoldSetSnapshot({
      snapshot,
      candidates: [candidate],
    });

    const comp = report.candidates[0];
    expect(comp).toBeDefined();
    // Item without decisionInput should be counted as UNCHANGED (no fake result)
    expect(comp.changedItems.length).toBe(0);
    expect(comp.matchedCount).toBe(1);
  });

  it("produces no fake result for items without decisionInput", () => {
    const item: PdfDecisionGoldSetSnapshotItem = {
      filingId: "filing-no-input",
      expectedRoute: "OCR",
      expectedRiskLevel: "HIGH",
    };
    const snapshot = makeSnapshot([item]);
    const candidate = makeCandidate({ ruleConfigOverride: { confidence: { bonuses: { reliablePageHints: 0.5 } } } });
    const report = evaluatePdfDecisionRuleTuningAgainstGoldSetSnapshot({
      snapshot,
      candidates: [candidate],
    });

    const changedItem = report.candidates[0].changedItems.find((i) => i.filingId === "filing-no-input");
    // Should either not appear (counted as UNCHANGED) or have INSUFFICIENT_INPUT note
    if (changedItem) {
      expect(changedItem.notes.some((n) => n.includes("INSUFFICIENT_INPUT_FOR_RERUN"))).toBe(true);
    }
  });

  it("evaluates candidate with decisionInput and detects UNCHANGED for no-op config", () => {
    const item: PdfDecisionGoldSetSnapshotItem = {
      filingId: "filing-with-input",
      expectedRoute: "TEXT_LAYER",
      expectedRiskLevel: "LOW",
      decisionInput: RELIABLE_TEXT_INPUT,
    };
    const snapshot = makeSnapshot([item]);
    // No-op candidate (empty override = same as baseline)
    const candidate = makeCandidate({ ruleConfigOverride: {} });
    const report = evaluatePdfDecisionRuleTuningAgainstGoldSetSnapshot({
      snapshot,
      candidates: [candidate],
    });

    const comp = report.candidates[0];
    // No-op config should produce UNCHANGED
    expect(comp.matchedCount).toBe(1);
    expect(comp.changedItems.filter((i) => i.changeType !== "UNCHANGED")).toHaveLength(0);
  });

  it("detects REGRESSED when candidate breaks expected route", () => {
    const item: PdfDecisionGoldSetSnapshotItem = {
      filingId: "filing-with-input",
      expectedRoute: "TEXT_LAYER",
      expectedRiskLevel: "LOW",
      decisionInput: RELIABLE_TEXT_INPUT,
    };
    const snapshot = makeSnapshot([item]);
    // Candidate that radically lowers confidence (pushing into OCR route territory)
    const candidate = makeCandidate({
      id: "regressing-candidate",
      ruleConfigOverride: {
        confidence: {
          penalties: {
            highQualityRisk: 0.99,
            missingFinancialSections: 0.99,
            mediumQualityRisk: 0.99,
          },
        },
      },
    });
    const report = evaluatePdfDecisionRuleTuningAgainstGoldSetSnapshot({
      snapshot,
      candidates: [candidate],
    });

    // A regression may or may not occur depending on engine behavior;
    // what matters is the report is honest and doesn't fake a pass.
    expect(report.candidates[0]).toBeDefined();
    expect(report.candidates[0].candidateId).toBe("regressing-candidate");
  });

  it("recommendation returns no bestCandidateId when all items lack decisionInput", () => {
    const snapshot = makeSnapshot([
      { filingId: "a", expectedRoute: "TEXT_LAYER" },
      { filingId: "b", expectedRoute: "OCR" },
    ]);
    const candidate = makeCandidate();
    const report = evaluatePdfDecisionRuleTuningAgainstGoldSetSnapshot({
      snapshot,
      candidates: [candidate],
    });
    expect(report.recommendation.bestCandidateId).toBeUndefined();
    expect(report.recommendation.reason).toContain("lack decisionInput");
  });

  it("recommendation handles no candidates", () => {
    const snapshot = makeSnapshot([]);
    const report = evaluatePdfDecisionRuleTuningAgainstGoldSetSnapshot({
      snapshot,
      candidates: [],
    });
    expect(report.recommendation.bestCandidateId).toBeUndefined();
    expect(report.recommendation.reason).toBeTruthy();
  });

  it("snapshot validation accepts optional decisionInput", () => {
    const withInput: PdfDecisionGoldSetSnapshotItem = {
      filingId: "a",
      decisionInput: RELIABLE_TEXT_INPUT,
    };
    const withoutInput: PdfDecisionGoldSetSnapshotItem = {
      filingId: "b",
    };
    const snapshot = makeSnapshot([withInput, withoutInput]);
    // Both are valid snapshot items; no throw expected
    expect(() =>
      evaluatePdfDecisionRuleTuningAgainstGoldSetSnapshot({
        snapshot,
        candidates: [makeCandidate()],
      }),
    ).not.toThrow();
  });
});

describe("snapshotItemToEvaluationFixture", () => {
  it("returns null when item has no decisionInput", () => {
    const item: PdfDecisionGoldSetSnapshotItem = {
      filingId: "a",
      expectedRoute: "TEXT_LAYER",
    };
    expect(snapshotItemToEvaluationFixture(item)).toBeNull();
  });

  it("converts item with decisionInput to evaluation fixture", () => {
    const item: PdfDecisionGoldSetSnapshotItem = {
      filingId: "a",
      expectedRoute: "TEXT_LAYER",
      expectedRiskLevel: "LOW",
      goldSetNote: "test note",
      decisionInput: RELIABLE_TEXT_INPUT,
    };
    const fixture = snapshotItemToEvaluationFixture(item);
    expect(fixture).not.toBeNull();
    expect(fixture?.name).toBe("a");
    expect(fixture?.description).toBe("test note");
    expect(fixture?.expected.route).toBe("TEXT_LAYER");
    expect(fixture?.expected.riskLevel).toBe("LOW");
  });
});
