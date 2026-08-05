import { describe, expect, it } from "vitest";

import {
  detectYearColumnAnchorsForPage,
  reconcileStatementRowsAcrossOcrScales,
  reconstructStatementRowsGeometryFirst,
} from "@/integrations/brreg/annual-report-financials/geometry-first-reconstruction";
import {
  AnnualReportParsedPage,
  ExtractedLine,
  ExtractedWord,
  PageClassification,
  ReconstructedRow,
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

function reconstructedRow(input: {
  label: string;
  normalizedLabel: string;
  values: [number, number];
  liabilitySection?: ReconstructedRow["liabilitySection"];
  y?: number;
}): ReconstructedRow {
  return {
    pageNumber: 7,
    sectionType: "STATUTORY_BALANCE_CONTINUATION",
    unitScale: 1,
    label: input.label,
    normalizedLabel: input.normalizedLabel,
    noteReference: null,
    rowText: input.label,
    y: input.y ?? 0,
    confidence: 0.9,
    values: [
      { value: input.values[0], columnIndex: 0, x: 0 },
      { value: input.values[1], columnIndex: 1, x: 100 },
    ],
    liabilitySection: input.liabilitySection ?? null,
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

  it("excludes the note-reference column so it does not fuse onto the value", () => {
    // Brønnøysund layout: label, a "Note" column, then the year columns. The
    // single-digit note reference sits at the note-header x and must NOT be
    // bucketed into the first year column (which would make note "2" + 3398713
    // read as "23398713").
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("Note", 250), word("2024", 400), word("2023", 520)], 20),
        line(
          [
            word("Sum", 50),
            word("inntekter", 90),
            word("2", 250), // note reference — at the Note column x
            word("3398713", 400), // 2024 value
            word("3256853", 520), // 2023 value
          ],
          40,
        ),
      ]),
      classification(),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.values).toEqual([
      { value: 3398713, columnIndex: 0, x: 400 },
      { value: 3256853, columnIndex: 1, x: 520 },
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

  it("assigns each numeric cluster to the nearest year anchor", () => {
    // Two separate column values, each a single-token cluster near its anchor.
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("2024", 400), word("2023", 700)], 20),
        line(
          [word("Inntekter", 50), word("100", 380), word("200", 680)],
          40,
        ),
      ]),
      classification(),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.values).toEqual([
      { value: 100, columnIndex: 0, x: 380 },
      { value: 200, columnIndex: 1, x: 680 },
    ]);
  });

  it("keeps a wide multi-group number whole instead of fusing the next column's leading group", () => {
    // Regression for the Canica balance-total over-fusion: an 11-digit number's
    // leftmost group reaches the midpoint between anchors, so per-token nearest-
    // anchor assignment pulled the NEXT column's leading group into this value
    // ("16 021 578 171" + "16" → 1602117…). Clustering by gap keeps each printed
    // number whole. Here 2024 = "16 021" and 2023 = "16 802"; the 2023 "16" sits
    // near the midpoint (550) and must stay with the 2023 cluster.
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("2024", 400), word("2023", 700)], 20),
        line(
          [
            word("Sum", 40),
            word("16", 360, 16),
            word("021", 400, 24),
            word("16", 540, 16),
            word("802", 580, 24),
          ],
          40,
        ),
      ]),
      classification(),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.values).toEqual([
      { value: 16021, columnIndex: 0, x: 360 },
      { value: 16802, columnIndex: 1, x: 540 },
    ]);
  });

  it("rejoins a stranded leading thousands group before note-zone filtering", () => {
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("2024", 400), word("2023", 700)], 20),
        line(
          [
            word("Kundefordringer", 50),
            // OCR occasionally leaves the leading group far enough left that
            // the basic cluster gap sees it as a separate note-zone cluster.
            word("12", 210, 16),
            word("560", 320, 24),
            word("000", 356, 24),
            word("9", 560, 8),
            word("531", 620, 24),
            word("000", 656, 24),
          ],
          40,
        ),
      ]),
      classification({ type: "STATUTORY_BALANCE", unitScale: 1 }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.values).toEqual([
      { value: 12560000, columnIndex: 0, x: 210 },
      { value: 9531000, columnIndex: 1, x: 560 },
    ]);
  });

  it("detects period-date and OCR-truncated year headers", () => {
    expect(
      detectYearColumnAnchorsForPage(
        page([
          line([
            word("Belop", 40),
            word("i", 100),
            word("NOK", 130),
            word("mill.", 180),
            word("Note", 300),
            word("31.12.24", 500),
            word("31.12.23", 650),
          ], 20),
          line([word("Sum", 40), word("eiendeler", 100), word("115004", 500), word("101", 610), word("813", 650)], 60),
        ]),
      ),
    ).toEqual([
      { year: 2024, x: 500 },
      { year: 2023, x: 650 },
    ]);

    expect(
      detectYearColumnAnchorsForPage(
        page([
          line([word("Belop", 40), word("Note", 300), word("024", 500), word("2023", 650)], 20),
          line([word("Driftsresultat", 40), word("5105", 500), word("1335", 650)], 60),
        ]),
      ),
    ).toEqual([
      { year: 2024, x: 500 },
      { year: 2023, x: 650 },
    ]);
  });

  it("repairs values from row text when geometry strands leading digit groups", () => {
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("2024", 400), word("2023", 700)], 20),
        line(
          [
            word("Finansielle", 50),
            word("eiendeler", 140),
            // Both leading groups sit too far left to be safely joined by
            // geometry alone, so the row-text fallback must recover them.
            word("7", 180, 8),
            word("345", 320, 24),
            word("508", 356, 24),
            word("000", 392, 24),
            word("7", 500, 8),
            word("926", 620, 24),
            word("023", 656, 24),
            word("000", 692, 24),
          ],
          40,
        ),
      ]),
      classification({ type: "STATUTORY_BALANCE", unitScale: 1 }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.values).toEqual([
      { value: 7345508000, columnIndex: 0, x: 0 },
      { value: 7926023000, columnIndex: 1, x: 100 },
    ]);
  });

  it("does not fuse a note reference when repairing values from row text", () => {
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("2024", 400), word("2023", 700)], 20),
        line(
          [
            word("Andre", 50),
            word("fordringer", 110),
            word("6", 250, 8),
            word("171", 320, 24),
            word("000", 356, 24),
            word("7", 500, 8),
            word("203", 620, 24),
            word("000", 656, 24),
          ],
          40,
        ),
      ]),
      classification({ type: "STATUTORY_BALANCE", unitScale: 1 }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.values).toEqual([
      { value: 6171000, columnIndex: 0, x: 0 },
      { value: 7203000, columnIndex: 1, x: 100 },
    ]);
  });

  it("prefers skipping a strict note-column token in row-text repair", () => {
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("Note", 250), word("2024", 400), word("2023", 700)], 20),
        line(
          [
            word("Bankinnskudd,", 50),
            word("kontanter", 145),
            word("og", 220),
            word("lignende", 245),
            word("3", 250, 8),
            word("251", 320, 24),
            word("569", 356, 24),
            word("000", 392, 24),
            word("2", 500, 8),
            word("320", 620, 24),
            word("814", 656, 24),
            word("000", 692, 24),
          ],
          40,
        ),
      ]),
      classification({ type: "STATUTORY_BALANCE", unitScale: 1 }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.values).toEqual([
      { value: 251569000, columnIndex: 0, x: 0 },
      { value: 2320814000, columnIndex: 1, x: 100 },
    ]);
  });

  it("infers a leading note reference from balanced grouped values without a note header", () => {
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("2024", 400), word("2023", 700)], 20),
        line(
          [
            word("Betalbar", 50),
            word("skatt", 115),
            word("11", 210, 16),
            word("358", 320, 24),
            word("899", 356, 24),
            word("000", 392, 24),
            word("292", 620, 24),
            word("496", 656, 24),
            word("000", 692, 24),
          ],
          40,
        ),
      ]),
      classification({ type: "STATUTORY_BALANCE", unitScale: 1 }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.values).toEqual([
      { value: 358899000, columnIndex: 0, x: 0 },
      { value: 292496000, columnIndex: 1, x: 100 },
    ]);
  });

  it("does not infer a note reference from a single leading digit without a note header", () => {
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("2024", 400), word("2023", 700)], 20),
        line(
          [
            word("Ordinært", 50),
            word("utbytte", 125),
            word("1", 210, 8),
            word("011", 320, 24),
            word("787", 356, 24),
            word("000", 392, 24),
            word("856", 620, 24),
            word("513", 656, 24),
            word("000", 692, 24),
          ],
          40,
        ),
      ]),
      classification({ type: "STATUTORY_INCOME", unitScale: 1 }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.values).toEqual([
      { value: 1011787000, columnIndex: 0, x: 210 },
      { value: 856513000, columnIndex: 1, x: 620 },
    ]);
  });

  it("repairs missing leading one after a two-digit note reference and zero-prefixed groups", () => {
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("2024", 400), word("2023", 700)], 20),
        line(
          [
            word("Utsatt", 50),
            word("skatt", 105),
            word("18", 210, 16),
            word("076", 320, 24),
            word("818", 356, 24),
            word("000", 392, 24),
            word("030", 620, 24),
            word("722", 656, 24),
            word("000", 692, 24),
          ],
          40,
        ),
      ]),
      classification({ type: "STATUTORY_BALANCE", unitScale: 1 }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.values).toEqual([
      { value: 1076818000, columnIndex: 0, x: 0 },
      { value: 1030722000, columnIndex: 1, x: 100 },
    ]);
  });

  it("repairs provision subtotals from immediately preceding provision lines", () => {
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("2024", 400), word("2023", 700)], 20),
        line(
          [
            word("Pensjonsforpliktelser", 50),
            word("771", 320, 24),
            word("274", 356, 24),
            word("000", 392, 24),
            word("728", 620, 24),
            word("943", 656, 24),
            word("000", 692, 24),
          ],
          40,
        ),
        line(
          [
            word("Utsatt", 50),
            word("skatt", 105),
            word("1", 300, 8),
            word("076", 320, 24),
            word("818", 356, 24),
            word("000", 392, 24),
            word("1", 600, 8),
            word("030", 620, 24),
            word("722", 656, 24),
            word("000", 692, 24),
          ],
          60,
        ),
        line(
          [
            word("Sum", 50),
            word("avsetninger", 90),
            word("for", 190),
            word("forpliktelser", 220),
            word("848", 320, 24),
            word("092", 356, 24),
            word("000", 392, 24),
            word("759", 620, 24),
            word("665", 656, 24),
            word("000", 692, 24),
          ],
          80,
        ),
      ]),
      classification({ type: "STATUTORY_BALANCE_CONTINUATION", unitScale: 1 }),
    );

    expect(result.at(-1)!.values).toEqual([
      { value: 1848092000, columnIndex: 0, x: 320 },
      { value: 1759665000, columnIndex: 1, x: 620 },
    ]);
  });

  it("repairs one grouped value that geometry split across year columns", () => {
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("2024", 400), word("2023", 700)], 20),
        line(
          [
            word("Skattekostnad", 50),
            word("på", 155),
            word("resultat", 180),
            word("8", 240, 8),
            word("-172", 320, 32),
            word("197", 356, 24),
            word("735", 392, 24),
          ],
          40,
        ),
      ]),
      classification({ type: "STATUTORY_INCOME", unitScale: 1 }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.values).toEqual([
      { value: -172197735, columnIndex: 0, x: 0 },
    ]);
  });

  it("tags rows with the running liability sub-section", () => {
    const result = reconstructStatementRowsGeometryFirst(
      page([
        line([word("2024", 400), word("2023", 700)], 20),
        line([word("Kortsiktig", 50), word("gjeld", 130)], 30),
        line(
          [
            word("Gjeld", 50),
            word("til", 105),
            word("kredittinstitusjoner", 130),
            word("595", 320, 24),
            word("238", 356, 24),
            word("000", 392, 24),
            word("825", 620, 24),
            word("402", 656, 24),
            word("000", 692, 24),
          ],
          40,
        ),
      ]),
      classification({ type: "STATUTORY_BALANCE", unitScale: 1 }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.liabilitySection).toBe("CURRENT");
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

  it("reconciles OCR scales and repairs liability rows from subtotal equations", () => {
    const primaryRows = [
      reconstructedRow({
        label: "Sum langsiktig gjeld",
        normalizedLabel: "sum langsiktig gjeld",
        values: [3521000000, 2770000000],
        liabilitySection: "LONG_TERM",
        y: 10,
      }),
      reconstructedRow({
        label: "Interest-bearing debt",
        normalizedLabel: "interest-bearing debt",
        values: [2007000000, 2163000000],
        liabilitySection: "CURRENT",
        y: 20,
      }),
      reconstructedRow({
        label: "Sum gjeld",
        normalizedLabel: "sum gjeld",
        values: [13243000000, 11756000000],
        liabilitySection: "CURRENT",
        y: 90,
      }),
    ];
    const secondaryRows = [
      reconstructedRow({
        label: "Leverandørgjeld",
        normalizedLabel: "leverandorgjeld",
        values: [955000000, 407000000],
        liabilitySection: "CURRENT",
        y: 30,
      }),
      reconstructedRow({
        label: "Tax pavable",
        normalizedLabel: "tax pavable",
        values: [579000000, 560000000],
        liabilitySection: "CURRENT",
        y: 40,
      }),
      reconstructedRow({
        label: "Other current liabilities",
        normalizedLabel: "other current liabilities",
        values: [3181000000, 856000000],
        liabilitySection: "CURRENT",
        y: 50,
      }),
      reconstructedRow({
        label: "Sum kortsiktig gjeld",
        normalizedLabel: "sum kortsiktig gjeld",
        values: [9722000000, 986000000],
        liabilitySection: "CURRENT",
        y: 60,
      }),
      reconstructedRow({
        label: "Sum gjeld",
        normalizedLabel: "sum gjeld",
        values: [13243000000, 11756000000],
        liabilitySection: "CURRENT",
        y: 70,
      }),
    ];

    const result = reconcileStatementRowsAcrossOcrScales(primaryRows, secondaryRows);
    const byLabel = new Map(result.map((row) => [row.normalizedLabel, row]));

    expect(byLabel.get("sum kortsiktig gjeld")!.values.map((value) => value.value)).toEqual([
      9722000000,
      8986000000,
    ]);
    expect(byLabel.get("leverandorgjeld")!.values.map((value) => value.value)).toEqual([
      3955000000,
      3407000000,
    ]);
    expect(byLabel.get("other current liabilities")!.values.map((value) => value.value)).toEqual([
      3181000000,
      2856000000,
    ]);
  });
});
