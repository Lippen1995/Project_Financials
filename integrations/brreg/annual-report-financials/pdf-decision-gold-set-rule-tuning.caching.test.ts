import { vi, describe, expect, it, beforeEach } from "vitest";
import * as engineModule from "@/integrations/brreg/annual-report-financials/pdf-decision-engine";

vi.mock("@/integrations/brreg/annual-report-financials/pdf-decision-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./pdf-decision-engine")>();
  return {
    ...actual,
    runPdfDecisionEngine: vi.fn(actual.runPdfDecisionEngine),
  };
});

import {
  evaluatePdfDecisionRuleTuningAgainstGoldSetSnapshot,
  type PdfDecisionGoldSetSnapshot,
  type PdfDecisionGoldSetSnapshotItem,
} from "./pdf-decision-gold-set-rule-tuning";
import type { PdfDecisionRuleTuningCandidate } from "./pdf-decision-rule-tuning";

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

function makeCandidate(id: string, overrides: Partial<PdfDecisionRuleTuningCandidate> = {}): PdfDecisionRuleTuningCandidate {
  return {
    id,
    description: `Candidate ${id}`,
    ruleConfigOverride: {},
    ...overrides,
  };
}

describe("engine invocation caching", () => {
  const engineSpy = vi.mocked(engineModule.runPdfDecisionEngine);

  beforeEach(() => {
    engineSpy.mockClear();
  });

  it("calls engine once per item for baseline when a single candidate is evaluated", () => {
    const item: PdfDecisionGoldSetSnapshotItem = {
      filingId: "filing-a",
      expectedRoute: "TEXT_LAYER",
      expectedRiskLevel: "LOW",
      decisionInput: RELIABLE_TEXT_INPUT,
    };
    evaluatePdfDecisionRuleTuningAgainstGoldSetSnapshot({
      snapshot: makeSnapshot([item]),
      candidates: [makeCandidate("c1")],
    });
    // 1 baseline + 1 candidate = 2 total calls for 1 item × 1 candidate
    expect(engineSpy).toHaveBeenCalledTimes(2);
  });

  it("calls engine N baseline + N×M candidate times for N items and M candidates", () => {
    const item1: PdfDecisionGoldSetSnapshotItem = {
      filingId: "filing-a",
      expectedRoute: "TEXT_LAYER",
      expectedRiskLevel: "LOW",
      decisionInput: RELIABLE_TEXT_INPUT,
    };
    const item2: PdfDecisionGoldSetSnapshotItem = {
      filingId: "filing-b",
      expectedRoute: "TEXT_LAYER",
      expectedRiskLevel: "LOW",
      decisionInput: RELIABLE_TEXT_INPUT,
    };
    evaluatePdfDecisionRuleTuningAgainstGoldSetSnapshot({
      snapshot: makeSnapshot([item1, item2]),
      candidates: [makeCandidate("c1"), makeCandidate("c2")],
    });
    // 2 baseline (one per item) + 2 items × 2 candidates = 2 + 4 = 6
    expect(engineSpy).toHaveBeenCalledTimes(6);
  });

  it("does not call engine for items without decisionInput", () => {
    const noInput: PdfDecisionGoldSetSnapshotItem = { filingId: "filing-no-input" };
    const withInput: PdfDecisionGoldSetSnapshotItem = {
      filingId: "filing-with-input",
      decisionInput: RELIABLE_TEXT_INPUT,
    };
    evaluatePdfDecisionRuleTuningAgainstGoldSetSnapshot({
      snapshot: makeSnapshot([noInput, withInput]),
      candidates: [makeCandidate("c1"), makeCandidate("c2")],
    });
    // Only the item with decisionInput contributes: 1 baseline + 1×2 candidates = 3
    expect(engineSpy).toHaveBeenCalledTimes(3);
  });

  it("baseline is computed once per item regardless of candidate count", () => {
    const item: PdfDecisionGoldSetSnapshotItem = {
      filingId: "filing-a",
      decisionInput: RELIABLE_TEXT_INPUT,
    };
    const threeCandiates = [makeCandidate("c1"), makeCandidate("c2"), makeCandidate("c3")];
    evaluatePdfDecisionRuleTuningAgainstGoldSetSnapshot({
      snapshot: makeSnapshot([item]),
      candidates: threeCandiates,
    });
    // 1 baseline (shared) + 3 candidate calls = 4 total; NOT 3 baselines + 3 candidates = 6
    expect(engineSpy).toHaveBeenCalledTimes(4);
  });
});
