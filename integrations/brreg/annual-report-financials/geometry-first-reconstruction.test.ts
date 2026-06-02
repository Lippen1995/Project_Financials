import { describe, expect, it } from "vitest";

import { reconstructStatementRowsGeometryFirst } from "@/integrations/brreg/annual-report-financials/geometry-first-reconstruction";
import {
  AnnualReportParsedPage,
  ExtractedLine,
  ExtractedWord,
  PageClassification,
} from "@/integrations/brreg/annual-report-financials/types";

function word(text: string, x: number, width?: number): ExtractedWord {
  return {
    text,
    normalizedText: text.toLowerCase(),
    x,
    y: 0,
    width: width ?? Math.max(8, text.length * 8),
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

function page(lines: ExtractedLine[]): AnnualReportParsedPage {
  return {
    pageNumber: 5,
    text: lines.map((l) => l.text).join("\n"),
    normalizedText: lines
      .map((l) => l.text)
      .join("\n")
      .toLowerCase(),
    lines,
    hasEmbeddedText: false,
    blocks: [],
    tables: [],
    source: { engine: "LEGACY", engineMode: "legacy" },
    metadata: { ocrDerived: true },
  };
}

function classification(
  overrides: Partial<PageClassification> = {},
): PageClassification {
  return {
    pageNumber: 5,
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
    ...overrides,
  };
}

describe("reconstructStatementRowsGeometryFirst", () => {
  it("assigns values to year columns by x-distance to the year header", () => {
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("Resultatregnskap", 50)]),
        line([word("2024", 400), word("2023", 520)], 20),
        line(
          [
            word("Sum", 50),
            word("driftsinntekter", 90),
            word("1234567", 400),
            word("1100000", 520),
          ],
          40,
        ),
        line(
          [word("Egenkapital", 50), word("500", 400), word("400", 520)],
          60,
        ),
      ]),
      classification(),
    );

    expect(result).toHaveLength(2);
    expect(result[0]!.values).toEqual([
      { value: 1234567, columnIndex: 0, x: 400 },
      { value: 1100000, columnIndex: 1, x: 520 },
    ]);
    expect(result[1]!.values).toEqual([
      { value: 500, columnIndex: 0, x: 400 },
      { value: 400, columnIndex: 1, x: 520 },
    ]);
  });

  it("concatenates thousand-separated tokens that share a column lane", () => {
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("2024", 400), word("2023", 520)], 20),
        line(
          [
            word("Sum", 50),
            word("driftsinntekter", 90),
            // "1 234 567" — three tokens, all close to the 2024 anchor.
            word("1", 380),
            word("234", 395),
            word("567", 410),
            // "1 100 000" — three tokens close to the 2023 anchor.
            word("1", 500),
            word("100", 515),
            word("000", 530),
          ],
          40,
        ),
      ]),
      classification(),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.values).toEqual([
      { value: 1234567, columnIndex: 0, x: 380 },
      { value: 1100000, columnIndex: 1, x: 500 },
    ]);
  });

  it("returns no rows when the page has no year header", () => {
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("Resultatregnskap", 50)]),
        line(
          [word("Sum", 50), word("driftsinntekter", 90), word("123", 400)],
          40,
        ),
      ]),
      classification(),
    );

    expect(result).toEqual([]);
  });

  it("returns no rows for narrative page types", () => {
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("2024", 400), word("2023", 520)], 20),
        line(
          [word("Sum", 50), word("driftsinntekter", 90), word("123", 400)],
          40,
        ),
      ]),
      classification({ type: "AUDITOR_REPORT" }),
    );

    expect(result).toEqual([]);
  });

  it("assigns each numeric token to the nearest year anchor", () => {
    // Midpoint between anchors is 450. A token at 440 belongs to col 0; a
    // token at 460 belongs to col 1.
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("2024", 400), word("2023", 500)], 20),
        line(
          [word("Inntekter", 50), word("100", 440), word("200", 460)],
          40,
        ),
      ]),
      classification(),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.values).toEqual([
      { value: 100, columnIndex: 0, x: 440 },
      { value: 200, columnIndex: 1, x: 460 },
    ]);
  });

  it("parses parenthesised negatives correctly", () => {
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("2024", 400), word("2023", 520)], 20),
        line(
          [
            word("Driftsresultat", 50),
            word("(1234)", 400),
            word("(2000)", 520),
          ],
          40,
        ),
      ]),
      classification(),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.values[0]!.value).toBe(-1234);
    expect(result[0]!.values[1]!.value).toBe(-2000);
  });

  it("skips noise lines such as currency declarations", () => {
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("2024", 400), word("2023", 520)], 20),
        line([word("Beløp", 50), word("i", 110), word("hele", 140), word("tusen", 200)], 30),
        line(
          [word("Sum", 50), word("driftsinntekter", 90), word("1234567", 400), word("1100000", 520)],
          40,
        ),
      ]),
      classification(),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.label).toContain("Sum");
  });
});
