import { describe, expect, it } from "vitest";

import { extractBoardReport } from "@/integrations/brreg/annual-report-financials/board-report-extractor";
import type {
  UnifiedParserDocument,
  UnifiedParserTextBlock,
} from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";

function block(pageNumber: number, index: number, text: string): UnifiedParserTextBlock {
  return {
    blockId: `p${pageNumber}-b${index}`,
    kind: "TEXT",
    text,
    normalizedText: text.toLowerCase(),
    bbox: null,
    confidence: 0.99,
    source: { route: "TEXT_LAYER", pageNumber, rawBlockId: null },
  };
}

function documentWithPages(pages: string[][]): UnifiedParserDocument {
  const unifiedPages = pages.map((texts, pageIndex) => {
    const pageNumber = pageIndex + 1;
    const blocks = texts.map((text, blockIndex) => block(pageNumber, blockIndex, text));
    return {
      pageNumber,
      width: null,
      height: null,
      rotation: null,
      textCharCount: texts.join("\n").length,
      normalizedTextCharCount: texts.join("\n").length,
      hasUsefulText: true,
      hasTableLikeText: false,
      routeConfidence: 0.99,
      warnings: [],
      blocks,
    };
  });

  return {
    version: "unified-parser-document-v1",
    generatedAt: "2026-07-14T10:00:00.000Z",
    source: {
      route: "TEXT_LAYER",
      documentEngine: "pdfjs",
      parserVersion: "test",
      filingId: "filing-1",
      extractionRunId: null,
      orgNumber: "974760673",
      fiscalYear: 2025,
    },
    safety: {
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
      shadowOnly: true,
      canUseForProductionRouting: false,
    },
    metrics: {
      pageCount: unifiedPages.length,
      processedPageCount: unifiedPages.length,
      textCharCount: unifiedPages.reduce((sum, page) => sum + page.textCharCount, 0),
      normalizedTextCharCount: unifiedPages.reduce(
        (sum, page) => sum + page.normalizedTextCharCount,
        0,
      ),
      tableCount: 0,
      sectionCount: 0,
      warningCount: 0,
      errorCount: 0,
    },
    pages: unifiedPages,
    sections: [],
    tables: [],
    warnings: [],
    errors: [],
  };
}

const source = {
  sourceSystem: "BRREG" as const,
  sourceEntityType: "ANNUAL_REPORT_PDF" as const,
  sourceId: "974760673-2025",
  sourceUrl: "https://data.brreg.no/example.pdf",
  sourceDocumentHash: "a".repeat(64),
  fetchedAt: "2026-07-14T09:00:00.000Z",
};

describe("extractBoardReport", () => {
  it("extracts the board report and stops before a financial statement on the same page", () => {
    const document = documentWithPages([
      [
        "Styrets arsberetning",
        "Virksomhetens art\nSelskapets virksomhet drives i Norge.",
      ],
      [
        "Fortsatt drift\nStyret bekrefter forutsetningen om fortsatt drift.",
        "Resultatregnskap",
        "Driftsinntekter 1000",
      ],
    ]);

    const result = extractBoardReport(document, source);

    expect(result.status).toBe("EXTRACTED");
    expect(result.text).toContain("Styrets arsberetning");
    expect(result.text).toContain("Fortsatt drift");
    expect(result.text).not.toContain("Resultatregnskap");
    expect(result.text).not.toContain("Driftsinntekter");
    expect(result.pageStart).toBe(1);
    expect(result.pageEnd).toBe(2);
    expect(result.endBoundary).toMatchObject({ pageNumber: 2, blockId: "p2-b1" });
  });

  it("stops an English board report at the financial-statements section cover", () => {
    const document = documentWithPages([
      [
        "Board of Directors' report",
        "The Board expects continued profitable growth and considers the company well positioned for the coming year.",
      ],
      ["Financial statements", "Jotun Group", "Consolidated income statement"],
    ]);

    const result = extractBoardReport(document, source);

    expect(result.pageStart).toBe(1);
    expect(result.pageEnd).toBe(1);
    expect(result.text).toContain("continued profitable growth");
    expect(result.text).not.toContain("Financial statements");
    expect(result.endBoundary).toMatchObject({ pageNumber: 2, blockId: "p2-b0" });
  });

  it("prefers a bounded report over a later navigation heading", () => {
    const document = documentWithPages([
      [
        "Board of Directors' report",
        "The Board expects continued profitable growth and considers the company well positioned for the coming year.",
      ],
      ["Financial statements"],
      ["Consolidated income statement"],
      ["Board of Directors' report", "Sustainability disclosure navigation"],
      ...Array.from({ length: 15 }, () => ["Sustainability disclosure content"]),
      ["Independent auditor's report"],
    ]);

    const result = extractBoardReport(document, source);

    expect(result.status).not.toBe("MANUAL_REVIEW");
    expect(result.pageStart).toBe(1);
    expect(result.pageEnd).toBe(1);
  });

  it("cuts at line offsets when the board report and next section share one text block", () => {
    const document = documentWithPages([
      [
        [
          "Styrets beretning",
          "Virksomhetens art",
          "Foretakets virksomhet er beskrevet i dette avsnittet.",
          "Fortsatt drift",
          "Styret legger fortsatt drift til grunn for regnskapet.",
          "Resultatregnskap",
          "Driftsinntekter 1000",
        ].join("\n"),
      ],
    ]);

    const result = extractBoardReport(document, source);

    expect(result.status).toBe("EXTRACTED");
    expect(result.text).not.toContain("Resultatregnskap");
    expect(result.includedBlocks).toHaveLength(1);
    expect(result.includedBlocks[0]?.endOffset).toBe(result.endBoundary?.charOffset);
    expect(result.endBoundary?.charOffset).toBeGreaterThan(0);
  });

  it("does not treat a table-of-contents entry as the board-report start", () => {
    const document = documentWithPages([
      [["Innhold", "Styrets arsberetning ........ 2", "Resultatregnskap ........ 5", "Balanse ........ 6"].join("\n")],
      ["Resultatregnskap", "Driftsinntekter 1000"],
    ]);

    const result = extractBoardReport(document, source);

    expect(result.status).toBe("NOT_FOUND");
    expect(result.text).toBeNull();
  });

  it("accepts a report heading suffixed with the fiscal year", () => {
    const document = documentWithPages([[
      "Styrets årsberetning 2025",
      "Virksomhetens art\nSelskapet beskriver virksomheten og årets utvikling.",
      "Fortsatt drift\nStyret legger fortsatt drift til grunn.",
      "Resultatregnskap 2025",
    ]]);

    const result = extractBoardReport(document, source);

    expect(result.status).toBe("EXTRACTED");
    expect(result.title).toBe("Styrets årsberetning 2025");
  });

  it("withholds a plausible report when no safe stop boundary exists", () => {
    const document = documentWithPages([
      ["Styrets arsberetning", "Virksomhetens art\nVirksomheten drives i Norge."],
      ["Fortsatt drift\nStyret legger fortsatt drift til grunn for arsregnskapet."],
    ]);

    const result = extractBoardReport(document, source);

    expect(result.status).toBe("MANUAL_REVIEW");
    expect(result.text).toContain("Styrets arsberetning");
    expect(result.endBoundary).toBeNull();
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "BOARD_REPORT_STOP_NOT_FOUND" }),
    );
  });

  it("recognizes Norwegian diacritics and stops before the auditor report", () => {
    const document = documentWithPages([
      [
        "Styrets årsberetning",
        "Virksomhetens art\nSelskapet utvikler løsninger og beskriver årets virksomhet.",
        "Fortsatt drift\nÅrsregnskapet er avlagt under forutsetning om fortsatt drift.",
      ],
      ["Uavhengig revisors beretning", "Til generalforsamlingen"],
    ]);

    const result = extractBoardReport(document, source);

    expect(result.status).toBe("EXTRACTED");
    expect(result.title).toBe("Styrets årsberetning");
    expect(result.text).not.toContain("Uavhengig revisors beretning");
    expect(result.matchedStopSignals[0]?.keyword).toBe("uavhengig revisors beretning");
  });

  it("withholds a span when auditor text leaked in before the detected stop heading", () => {
    const document = documentWithPages([
      [
        "Styrets arsberetning",
        "Virksomhetens art\nVirksomheten drives i Norge og utviklingen omtales her.",
        "Vi har revidert selskapets arsregnskap og mener det gir et rettvisende bilde.",
        "Resultatregnskap",
      ],
    ]);

    const result = extractBoardReport(document, source);

    expect(result.status).toBe("MANUAL_REVIEW");
    expect(result.quality.contaminationRisk).toBeGreaterThan(0.05);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "AUDITOR_TEXT_CONTAMINATION" }),
    );
  });

  it("preserves the parser-provided reading order for multi-column pages", () => {
    const document = documentWithPages([[
      "Styrets arsberetning",
      "Venstre kolonne beskriver virksomhetens art og utvikling gjennom året.",
      "Høyre kolonne omtaler fortsatt drift og styrets vurderinger.",
      "Resultatregnskap",
    ]]);
    const blocks = document.pages[0]!.blocks;
    blocks[0]!.bbox = { x0: 0, y0: 0, x1: 100, y1: 10 };
    blocks[1]!.bbox = { x0: 0, y0: 30, x1: 45, y1: 90 };
    blocks[2]!.bbox = { x0: 55, y0: 20, x1: 100, y1: 90 };
    blocks[3]!.bbox = { x0: 0, y0: 100, x1: 100, y1: 110 };

    const result = extractBoardReport(document, source);

    expect(result.status).toBe("EXTRACTED");
    expect(result.text!.indexOf("Venstre kolonne")).toBeLessThan(
      result.text!.indexOf("Høyre kolonne"),
    );
  });
});
