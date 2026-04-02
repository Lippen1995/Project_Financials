import { describe, expect, it } from "vitest";

import {
  ExtractedPage,
  extractSectionExcerptsFromPages,
} from "@/integrations/brreg/annual-report-document-extractor";

function buildPage(pageNumber: number, text: string): ExtractedPage {
  return {
    pageNumber,
    text,
    normalizedText: text
      .toLowerCase()
      .replace(/æ/g, "ae")
      .replace(/ø/g, "o")
      .replace(/å/g, "a")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    lines: text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length >= 4),
  };
}

describe("extractSectionExcerptsFromPages", () => {
  it("finner arsberetning, noter og revisjon fra sider med tydelige overskrifter", () => {
    const pages = [
      buildPage(
        2,
        [
          "Styrets årsberetning",
          "Virksomhetens art er utvikling av maritime tjenester og prosjektleveranser.",
          "Forutsetningen om fortsatt drift er lagt til grunn i årsregnskapet.",
        ].join("\n"),
      ),
      buildPage(
        6,
        [
          "Noter til årsregnskapet",
          "Note 1 Regnskapsprinsipper",
          "Lønnskostnadene for året omfatter faste ansatte og innleid kapasitet.",
        ].join("\n"),
      ),
      buildPage(
        9,
        [
          "Uavhengig revisors beretning",
          "Konklusjon",
          "Etter vår mening er årsregnskapet avgitt i samsvar med lov og forskrifter.",
        ].join("\n"),
      ),
    ];

    const result = extractSectionExcerptsFromPages(pages, 2024, "https://example.test/report.pdf");

    expect(result.annualReportExcerpts).toHaveLength(1);
    expect(result.notesExcerpts).toHaveLength(1);
    expect(result.auditExcerpts).toHaveLength(1);
    expect(result.annualReportExcerpts[0]?.pageNumber).toBe(2);
    expect(result.notesExcerpts[0]?.pageNumber).toBe(6);
    expect(result.auditExcerpts[0]?.pageNumber).toBe(9);
  });

  it("returnerer tomme lister nar ingen seksjoner kan identifiseres", () => {
    const pages = [
      buildPage(1, "Forside med selskapsnavn og regnskapsar."),
      buildPage(2, "Balansesammendrag uten tydelige overskrifter for noter eller revisjon."),
    ];

    const result = extractSectionExcerptsFromPages(pages, 2023, null);

    expect(result.annualReportExcerpts).toEqual([]);
    expect(result.notesExcerpts).toEqual([]);
    expect(result.auditExcerpts).toEqual([]);
  });
});
