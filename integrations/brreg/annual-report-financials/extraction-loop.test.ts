import { describe, expect, it } from "vitest";

import {
  buildAlternativeRowsForRecovery,
  loopCandidateWins,
  selectRecoveryCandidates,
} from "@/integrations/brreg/annual-report-financials/extraction-loop";
import { PageConfidence } from "@/integrations/brreg/annual-report-financials/page-confidence";
import {
  AnnualReportParsedPage,
  ExtractedLine,
  ExtractedWord,
  PageClassification,
  ReconstructedRow,
} from "@/integrations/brreg/annual-report-financials/types";

function pageConfidence(overrides: Partial<PageConfidence> = {}): PageConfidence {
  return {
    pageNumber: 1,
    sectionType: "STATUTORY_INCOME",
    overall: 0.5,
    classification: 0.9,
    unitScale: 0.9,
    recognition: 0.9,
    reconstruction: 0.4,
    rowCount: 0,
    diagnosis: "reconstruction",
    ...overrides,
  };
}

describe("selectRecoveryCandidates", () => {
  it("picks statement pages diagnosed as reconstruction-weak", () => {
    const candidates = selectRecoveryCandidates([
      pageConfidence({ pageNumber: 2, sectionType: "STATUTORY_INCOME", diagnosis: "reconstruction" }),
      pageConfidence({ pageNumber: 3, sectionType: "STATUTORY_BALANCE", diagnosis: "reconstruction" }),
    ]);

    expect(candidates.map((c) => c.pageNumber)).toEqual([2, 3]);
    expect(candidates.every((c) => c.branch === "geometry-first-reconstruction")).toBe(true);
  });

  it("skips pages with other diagnoses", () => {
    const candidates = selectRecoveryCandidates([
      pageConfidence({ pageNumber: 2, diagnosis: "ok" }),
      pageConfidence({ pageNumber: 3, diagnosis: "recognition" }),
      pageConfidence({ pageNumber: 4, diagnosis: "classification" }),
    ]);

    expect(candidates).toEqual([]);
  });

  it("skips non-statement page types even when reconstruction-weak", () => {
    const candidates = selectRecoveryCandidates([
      pageConfidence({ pageNumber: 5, sectionType: "NOTE", diagnosis: "reconstruction" }),
      pageConfidence({ pageNumber: 6, sectionType: "AUDITOR_REPORT", diagnosis: "reconstruction" }),
    ]);

    expect(candidates).toEqual([]);
  });
});

describe("loopCandidateWins", () => {
  it("prefers a publishable alternative over a non-publishable current", () => {
    expect(
      loopCandidateWins(
        { canPublishSnapshot: true, confidenceScore: 0.5 },
        { canPublishSnapshot: false, confidenceScore: 0.99 },
      ),
    ).toBe(true);
  });

  it("rejects a non-publishable alternative when the current can publish", () => {
    expect(
      loopCandidateWins(
        { canPublishSnapshot: false, confidenceScore: 0.99 },
        { canPublishSnapshot: true, confidenceScore: 0.5 },
      ),
    ).toBe(false);
  });

  it("requires strictly higher confidence to overturn a same-tier draw", () => {
    expect(
      loopCandidateWins(
        { canPublishSnapshot: true, confidenceScore: 0.92 },
        { canPublishSnapshot: true, confidenceScore: 0.92 },
      ),
    ).toBe(false);
    expect(
      loopCandidateWins(
        { canPublishSnapshot: true, confidenceScore: 0.93 },
        { canPublishSnapshot: true, confidenceScore: 0.92 },
      ),
    ).toBe(true);
  });
});

function word(text: string, x: number): ExtractedWord {
  return {
    text,
    normalizedText: text.toLowerCase(),
    x,
    y: 0,
    width: text.length * 8,
    height: 12,
    confidence: 0.9,
    lineNumber: 0,
  };
}

function line(words: ExtractedWord[], y = 0): ExtractedLine {
  const text = words.map((w) => w.text).join(" ");
  const xs = words.map((w) => w.x);
  return {
    text,
    normalizedText: text.toLowerCase(),
    x: xs.length > 0 ? Math.min(...xs) : 0,
    y,
    width: 800,
    height: 12,
    confidence: 0.9,
    words,
  };
}

function ocrPage(pageNumber: number, lines: ExtractedLine[]): AnnualReportParsedPage {
  return {
    pageNumber,
    text: lines.map((l) => l.text).join("\n"),
    normalizedText: "",
    lines,
    hasEmbeddedText: false,
    blocks: [],
    tables: [],
    source: { engine: "LEGACY", engineMode: "legacy" },
    metadata: { ocrDerived: true },
  };
}

function classification(pageNumber: number): PageClassification {
  return {
    pageNumber,
    type: "STATUTORY_INCOME",
    confidence: 0.9,
    unitScale: 1000,
    unitScaleConfidence: 0.9,
    hasConflictingUnitSignals: false,
    statementScope: "COMPANY",
    hasExplicitScopeSignal: false,
    reportingCurrency: "NOK",
    declaredYears: [2024, 2023],
    yearHeaderYears: [2024, 2023],
    heading: "Resultatregnskap",
    numericRowCount: 3,
    tableLike: true,
    reasons: [],
  };
}

function row(pageNumber: number, label: string, y: number): ReconstructedRow {
  return {
    pageNumber,
    sectionType: "STATUTORY_INCOME",
    unitScale: 1000,
    label,
    normalizedLabel: label.toLowerCase(),
    noteReference: null,
    rowText: label,
    y,
    confidence: 0.85,
    values: [],
  };
}

describe("buildAlternativeRowsForRecovery", () => {
  it("replaces rows for candidate pages and carries the rest unchanged", () => {
    const pages = [
      ocrPage(2, [
        line([word("2024", 400), word("2023", 520)], 20),
        line([word("Sum", 50), word("inntekter", 90), word("100", 400), word("90", 520)], 40),
      ]),
      ocrPage(3, [
        line([word("Other page text", 0)], 0),
      ]),
    ];
    const result = buildAlternativeRowsForRecovery({
      originalRows: [
        row(2, "stale-row-from-page-2", 10),
        row(3, "carried-row-from-page-3", 5),
      ],
      classifications: [classification(2), classification(3)],
      parsedPages: pages,
      candidates: [
        { pageNumber: 2, branch: "geometry-first-reconstruction", diagnosis: "reconstruction" },
      ],
    });

    const pageNumbers = result.rows.map((r) => r.pageNumber);
    expect(pageNumbers).toContain(3); // carried
    expect(result.rows.find((r) => r.label === "stale-row-from-page-2")).toBeUndefined();
    // Page 2's row was replaced by geometry-first output (label "Sum inntekter").
    const page2Rows = result.rows.filter((r) => r.pageNumber === 2);
    expect(page2Rows.length).toBeGreaterThanOrEqual(1);
    expect(page2Rows[0]!.label).toContain("Sum");
    expect(result.recoveredRowCount).toBe(page2Rows.length);
  });

  it("reports zero recovered rows when no candidate page has parsable geometry", () => {
    const result = buildAlternativeRowsForRecovery({
      originalRows: [row(2, "stale", 0)],
      classifications: [classification(2)],
      parsedPages: [],
      candidates: [
        { pageNumber: 2, branch: "geometry-first-reconstruction", diagnosis: "reconstruction" },
      ],
    });

    expect(result.recoveredRowCount).toBe(0);
  });
});
