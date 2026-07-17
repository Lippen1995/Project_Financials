import { describe, expect, it, vi } from "vitest";

import { buildScannedBoardReportDocument } from "@/integrations/brreg/annual-report-financials/scanned-board-report-document";
import type { AnnualReportParsedPage } from "@/integrations/brreg/annual-report-financials/types";

function page(pageNumber: number, text: string): AnnualReportParsedPage {
  return {
    pageNumber,
    text,
    normalizedText: text.toLowerCase(),
    lines: [],
    hasEmbeddedText: false,
    blocks: [{
      id: `p${pageNumber}`,
      kind: "paragraph",
      rawType: "ocr_text",
      text,
      normalizedText: text.toLowerCase(),
      bbox: null,
      source: {
        engine: "LEGACY",
        engineMode: "legacy",
        sourceElementId: `p${pageNumber}`,
        sourceRawType: "ocr_text",
        order: 0,
      },
    }],
    tables: [],
    source: {
      engine: "LEGACY",
      engineMode: "legacy",
      sourceElementId: `p${pageNumber}`,
      sourceRawType: "ocr_page",
      order: pageNumber,
    },
  };
}

describe("buildScannedBoardReportDocument", () => {
  it("detects rotation, resolves a reference table, and OCRs only missing report pages", async () => {
    const ocr = vi.fn(async (_pdf: Buffer, pageNumbers: number[], options: { rotationDegrees?: number }) => {
      if (pageNumbers.length === 1 && pageNumbers[0] === 59) {
        return {
          pages: options.rotationDegrees === 90
            ? [page(59, "Dette er en lesbar norsk årsrapport med mange ord og riktig orientering.")]
            : [page(59, "| 1 H 1 | 1")],
          diagnostics: {} as never,
        };
      }
      if (pageNumbers.includes(229)) {
        return {
          pages: [page(229, [
            "210 — ÅRS- OG BÆREKRAFTSRAPPORT 2024",
            "Styrets årsberetning er dekket i følgende seksjoner.",
            "§ 2-21 Virksomheten Dette er konsernet 2-5",
            "§ 2-22 Resultatutvikling 7-11",
            "§ 2-9 Ledelse og styring 13-17",
            "Åpenhetsloven 22-25",
            "§ 2-25 Strategi 26-59",
            "§ 2-3 Bærekraft 60-143",
          ].join("\n"))],
          diagnostics: {} as never,
        };
      }
      return {
        pages: pageNumbers.map((pageNumber) => page(pageNumber, `Ordrett innhold på side ${pageNumber}.`)),
        diagnostics: {} as never,
      };
    });

    const result = await buildScannedBoardReportDocument({
      pdfBuffer: Buffer.from("pdf"),
      pageCount: 236,
      source: { filingId: "filing-1", orgNumber: "819731322", fiscalYear: 2024 },
      ocr,
    });

    expect(result.rotationDegrees).toBe(90);
    expect(result.pageRanges).toEqual([
      { pageStart: 21, pageEnd: 24 },
      { pageStart: 26, pageEnd: 30 },
      { pageStart: 32, pageEnd: 36 },
      { pageStart: 41, pageEnd: 162 },
    ]);
    expect(result.document.pages.some((item) => item.pageNumber === 162)).toBe(true);
    expect(ocr).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.arrayContaining([41, 162]),
      expect.objectContaining({ rotationDegrees: 90, recognitionMode: "auto" }),
    );
  });
});
