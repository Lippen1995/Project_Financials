import { describe, expect, it } from "vitest";

import { computePageConfidences } from "@/integrations/brreg/annual-report-financials/page-confidence";
import {
  AnnualReportParsedPage,
  ExtractedLine,
  PageClassification,
  PageTextLayer,
  ReconstructedRow,
} from "@/integrations/brreg/annual-report-financials/types";

function line(confidence: number): ExtractedLine {
  return {
    text: "Sum driftsinntekter 1 2",
    normalizedText: "sum driftsinntekter 1 2",
    x: 0,
    y: 0,
    width: 100,
    height: 12,
    confidence,
    words: [],
  };
}

function classification(overrides: Partial<PageClassification> = {}): PageClassification {
  return {
    pageNumber: 1,
    type: "STATUTORY_INCOME",
    confidence: 0.92,
    unitScale: 1000,
    unitScaleConfidence: 0.9,
    hasConflictingUnitSignals: false,
    statementScope: "COMPANY",
    hasExplicitScopeSignal: false,
    reportingCurrency: "NOK",
    declaredYears: [2024, 2023],
    yearHeaderYears: [2024, 2023],
    heading: "Resultatregnskap",
    numericRowCount: 5,
    tableLike: true,
    reasons: [],
    ...overrides,
  };
}

function embeddedPage(pageNumber: number, lineConfidence = 0.95): PageTextLayer {
  return {
    pageNumber,
    text: "Resultatregnskap",
    normalizedText: "resultatregnskap",
    lines: [line(lineConfidence), line(lineConfidence), line(lineConfidence)],
    hasEmbeddedText: true,
  };
}

function ocrPage(
  pageNumber: number,
  opts: { lineConfidence: number; rowCandidateCount: number; ambiguousRowCount: number },
): AnnualReportParsedPage {
  return {
    pageNumber,
    text: "Resultatregnskap",
    normalizedText: "resultatregnskap",
    lines: [line(opts.lineConfidence), line(opts.lineConfidence)],
    hasEmbeddedText: false,
    blocks: [],
    tables: [],
    source: { engine: "LEGACY", engineMode: "legacy" },
    metadata: {
      ocrDerived: true,
      rowCandidateCount: opts.rowCandidateCount,
      ambiguousRowCount: opts.ambiguousRowCount,
    },
  };
}

function row(pageNumber: number): ReconstructedRow {
  return {
    pageNumber,
    sectionType: "STATUTORY_INCOME",
    unitScale: 1000,
    label: "Sum driftsinntekter",
    normalizedLabel: "sum driftsinntekter",
    noteReference: null,
    rowText: "Sum driftsinntekter 1 2",
    y: 0,
    confidence: 0.9,
    values: [],
  };
}

describe("computePageConfidences", () => {
  it("scores a clean embedded-text statement page as ok", () => {
    const result = computePageConfidences({
      parsedPages: [embeddedPage(1)],
      classifications: [classification({ pageNumber: 1, numericRowCount: 5 })],
      rows: [row(1), row(1), row(1), row(1), row(1)],
    });

    expect(result).toHaveLength(1);
    expect(result[0].diagnosis).toBe("ok");
    expect(result[0].recognition).toBe(1);
    expect(result[0].overall).toBeGreaterThan(0.85);
    expect(result[0].rowCount).toBe(5);
  });

  it("diagnoses a clean OCR read with ambiguous rows as a reconstruction problem", () => {
    const result = computePageConfidences({
      parsedPages: [ocrPage(1, { lineConfidence: 0.9, rowCandidateCount: 10, ambiguousRowCount: 8 })],
      classifications: [classification({ pageNumber: 1 })],
      rows: [],
    });

    expect(result[0].recognition).toBeGreaterThanOrEqual(0.7);
    expect(result[0].reconstruction).toBeLessThan(0.7);
    expect(result[0].diagnosis).toBe("reconstruction");
  });

  it("diagnoses weak OCR character confidence as a recognition problem", () => {
    const result = computePageConfidences({
      parsedPages: [ocrPage(1, { lineConfidence: 0.4, rowCandidateCount: 10, ambiguousRowCount: 1 })],
      classifications: [classification({ pageNumber: 1 })],
      rows: [],
    });

    expect(result[0].recognition).toBeLessThan(0.7);
    expect(result[0].diagnosis).toBe("recognition");
  });

  it("diagnoses an uncertain page classification as a classification problem", () => {
    const result = computePageConfidences({
      parsedPages: [embeddedPage(1)],
      classifications: [classification({ pageNumber: 1, confidence: 0.5, numericRowCount: 4 })],
      rows: [row(1), row(1), row(1), row(1)],
    });

    expect(result[0].recognition).toBe(1);
    expect(result[0].reconstruction).toBeGreaterThanOrEqual(0.7);
    expect(result[0].diagnosis).toBe("classification");
  });
});
