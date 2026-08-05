import { describe, expect, it } from "vitest";

import { resolveBoardReportPageRangesFromReferenceText } from "@/integrations/brreg/annual-report-financials/board-report-page-range-resolver";

describe("resolveBoardReportPageRangesFromReferenceText", () => {
  it("maps a distributed board report from the report page references to PDF pages", () => {
    const result = resolveBoardReportPageRangesFromReferenceText({
      pdfPageNumber: 229,
      text: [
        "210 — NORGESGRUPPENS ÅRS- OG BÆREKRAFTSRAPPORT 2024",
        "Referanser",
        "Styrets årsberetning er dekket i følgende seksjoner.",
        "§ 2-21. ledd Arten av virksomheten og hvor den drives. Dette er NorgesGruppen — 2-5",
        "§ 2-22 ledd Rettvisende oversikt over utviklingen og resultatet. Resultatutvikling 7-11",
        "§ 2-9 Redegjørelse om foretaksstyring Ledelse og styring 13-17",
        "§ 2-2 12. ledd Forsikring for styrets medlemmer Folk og organisasjon 15",
        "Åpenhetsloven Redegjørelse for aktsomhetsvurderinger 22-25",
        "§ 2-25 ledd Framtidig utvikling Strategi 26-59",
        "§ 2-3-§ 2-5 Plikt til å utarbeide bærekraftsrapportering Bærekraft 60-143",
      ].join("\n"),
    });

    expect(result).toEqual({
      evidencePdfPageNumber: 229,
      printedReferencePageNumber: 210,
      pageOffset: 19,
      pageRanges: [
        { pageStart: 21, pageEnd: 24 },
        { pageStart: 26, pageEnd: 30 },
        { pageStart: 32, pageEnd: 36 },
        { pageStart: 41, pageEnd: 162 },
      ],
    });
  });

  it("does not treat ordinary legislation references as board-report page mappings", () => {
    expect(
      resolveBoardReportPageRangesFromReferenceText({
        pdfPageNumber: 12,
        text: "Regnskapsloven § 2-2 og § 2-5 gjelder for rapporteringen.",
      }),
    ).toBeNull();
  });

  it("accepts a printed page footer when OCR drops the dash before the report title", () => {
    const result = resolveBoardReportPageRangesFromReferenceText({
      pdfPageNumber: 229,
      text: [
        "Styrets årsberetning er dekket i følgende seksjoner.",
        "§ 2-21 Dette er konsernet 2-5",
        "210 NORGESGRUPPENS ÅRS- OG BÆREKRAFTSRAPPORT 2024",
      ].join("\n"),
    });
    expect(result?.pageOffset).toBe(19);
    expect(result?.pageRanges).toEqual([{ pageStart: 21, pageEnd: 24 }]);
  });

  it("accepts a printed page number split onto its own OCR line", () => {
    const result = resolveBoardReportPageRangesFromReferenceText({
      pdfPageNumber: 229,
      text: [
        "210",
        "NORGESGRUPPENS ÅRS5- OG BÆREK RAFTSRAPP ORT 2024",
        "Styrets årsberetning er dekket i følgende seksjoner.",
        "Dette er NorgesGruppen 2-5",
      ].join("\n"),
    });

    expect(result?.pageOffset).toBe(19);
    expect(result?.pageRanges).toEqual([{ pageStart: 21, pageEnd: 24 }]);
  });
});
