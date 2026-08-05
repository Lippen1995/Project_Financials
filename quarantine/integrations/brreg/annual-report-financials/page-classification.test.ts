import { describe, expect, it } from "vitest";

import { classifyPages } from "@/integrations/brreg/annual-report-financials/page-classification";
import { PageTextLayer } from "@/integrations/brreg/annual-report-financials/types";
import { normalizeNorwegianText } from "@/lib/norwegian-text";

function buildPage(pageNumber: number, lines: string[]): PageTextLayer {
  return {
    pageNumber,
    text: lines.join("\n"),
    normalizedText: normalizeNorwegianText(lines.join(" ")),
    hasEmbeddedText: true,
    lines: lines.map((line, index) => ({
      text: line,
      normalizedText: normalizeNorwegianText(line),
      x: 0,
      y: index * 16,
      width: Math.max(40, line.length * 8),
      height: 12,
      confidence: 0.95,
      words: line.split(/\s+/).map((word, wordIndex) => ({
        text: word,
        normalizedText: normalizeNorwegianText(word),
        x: wordIndex * 60,
        y: index * 16,
        width: Math.max(8, word.length * 7),
        height: 12,
        confidence: 0.95,
        lineNumber: index,
      })),
    })),
  };
}

describe("classifyPages", () => {
  it("classifies statutory income and balance pages separately", () => {
    const pages = [
      buildPage(2, ["Resultatregnskap", "Belop i: NOK", "2024 2023", "Salgsinntekter 103097000 99210000", "Driftsresultat 21210000 18000000", "Arsresultat 18221000 15120000"]),
      buildPage(3, ["Balanse", "Belop i: NOK", "2024 2023", "Eiendeler", "Sum eiendeler 92155000 84500000", "Sum egenkapital og gjeld 92155000 84500000"]),
    ];
    const result = classifyPages(pages);
    expect(result[0]?.type).toBe("STATUTORY_INCOME");
    expect(result[1]?.type).toBe("STATUTORY_BALANCE");
    expect(result[0]?.unitScale).toBe(1);
    expect(result[1]?.unitScale).toBe(1);
    expect(result[0]?.tableLike).toBe(true);
  });

  it("marks NOK 1000 result pages as supplementary", () => {
    const result = classifyPages([
      buildPage(5, ["Artsinndelt resultatregnskap", "Belop i NOK 1 000", "2024 2023", "Sum driftsinntekter 103097 99210", "Driftsresultat 21210 18000"]),
    ]);
    expect(result[0]?.type).toBe("SUPPLEMENTARY_INCOME");
    expect(result[0]?.unitScale).toBe(1000);
  });

  it("keeps NOK million result pages as statutory statements with million scale", () => {
    const result = classifyPages([
      buildPage(23, [
        "Totalresultat",
        "Belop i NOK mill. Note 2024 2023",
        "Driftsinntekter 111 274 106 069",
        "Arets resultat 3 893 523",
      ]),
    ]);

    expect(result[0]?.type).toBe("STATUTORY_INCOME");
    expect(result[0]?.unitScale).toBe(1_000_000);
  });

  it("does not parse auditor reports as financial statements", () => {
    const result = classifyPages([
      buildPage(7, ["Uavhengig revisors beretning", "Konklusjon", "Grunnlag for konklusjon", "Vi har revidert årsregnskapet"]),
    ]);
    expect(result[0]?.type).toBe("AUDITOR_REPORT");
  });

  it("links equity-and-liabilities page as balance continuation", () => {
    const result = classifyPages([
      buildPage(3, ["Balanse", "Belop i: NOK", "2024 2023", "Eiendeler", "Sum eiendeler 92155000 84500000"]),
      buildPage(4, ["Egenkapital og gjeld", "Belop i: NOK", "2024 2023", "Sum gjeld 55783000 51100000", "Sum egenkapital og gjeld 92155000 84500000"]),
    ]);
    expect(result[0]?.type).toBe("STATUTORY_BALANCE");
    expect(result[1]?.type).toBe("STATUTORY_BALANCE_CONTINUATION");
  });

  it("keeps a balance page as balance even when signature text adds board-report cues", () => {
    const result = classifyPages([
      buildPage(140, [
        "BALANSE",
        "Belop i mill kroner 31.12.2024 31.12.2023",
        "EIENDELER",
        "Immaterielle eiendeler 1 841 1 986",
        "Varige driftsmidler 7 466 7 071",
        "Anleggsmidler 13 276 13 437",
        "Omlopsmidler 6 517 6 179",
        "Eiendeler 20 943 19 625",
        "EGENKAPITAL OG GJELD",
        "Egenkapital 6 101 5 876",
        "Langsiktig gjeld 2 991 3 140",
        "Kortsiktig gjeld 7 659 6 546",
        "Egenkapital og gjeld 20 943 19 625",
        "Styret og konsernsjef",
        "Oslo 8 april 2025",
      ]),
    ]);

    expect(["STATUTORY_BALANCE", "STATUTORY_BALANCE_CONTINUATION"]).toContain(result[0]?.type);
  });

  it("keeps an income page as income even when signature text adds board-report cues", () => {
    const result = classifyPages([
      buildPage(139, [
        "RESULTATREGNSKAP",
        "Belop i mill kroner 2024 2023",
        "Driftsinntekter 24 977 24 497",
        "Vare- og trafikkostnader 9 887 9 977",
        "Lonn og personalkostnader 9 653 9 062",
        "Avskrivninger 1 797 1 600",
        "Andre driftskostnader 3 044 3 039",
        "Driftskostnader 24 381 23 818",
        "Driftsresultat 604 598",
        "Finansinntekter 309 346",
        "Finanskostnader 827 551",
        "Resultat for skattekostnad 86 393",
        "Arsresultat 30 256",
        "Styret og konsernsjef",
        "Oslo 8 april 2025",
      ]),
    ]);

    expect(result[0]?.type).toBe("STATUTORY_INCOME");
  });

  it("treats OCR-style 'Belop 1: NOK' as whole-NOK unit declaration", () => {
    const result = classifyPages([
      buildPage(2, [
        "Resultatregnskap",
        "Belop 1: NOK Note 2024 2023",
        "Salgsinntekter 103097000 95210000",
        "Driftsresultat 21210000 17710000",
      ]),
    ]);

    expect(result[0]?.type).toBe("STATUTORY_INCOME");
    expect(result[0]?.unitScale).toBe(1);
  });

  it("inherits year headers on continuation pages when the layout remains statement-like", () => {
    const result = classifyPages([
      buildPage(3, [
        "Balanse",
        "Belop i: NOK",
        "2024 2023",
        "Eiendeler",
        "Sum eiendeler 92155000 84500000",
      ]),
      buildPage(4, [
        "Egenkapital og gjeld",
        "Sum gjeld 55783000 51100000",
        "Sum egenkapital og gjeld 92155000 84500000",
      ]),
    ]);

    expect(result[1]?.type).toBe("STATUTORY_BALANCE_CONTINUATION");
    expect(result[1]?.yearHeaderYears).toEqual([2024, 2023]);
    expect(result[1]?.reasons).toContain(
      "Inherited year header 2024, 2023 from previous statement page",
    );
  });

  it("defaults every page to COMPANY scope when no group section exists", () => {
    const result = classifyPages([
      buildPage(2, ["Resultatregnskap", "Belop i: NOK", "2024 2023", "Salgsinntekter 103097000 99210000"]),
      buildPage(3, ["Balanse", "Belop i: NOK", "2024 2023", "Sum eiendeler 92155000 84500000"]),
    ]);
    expect(result.every((c) => c.statementScope === "COMPANY")).toBe(true);
    expect(result.every((c) => c.hasExplicitScopeSignal === false)).toBe(true);
  });

  it("flips to CONSOLIDATED scope after a Konsernregnskap heading and back at Selskapsregnskap", () => {
    const result = classifyPages([
      buildPage(1, ["Arsberetning 2024", "Selskapet inngar i et konsern"]),
      buildPage(2, ["Konsernregnskap", "Resultatregnskap", "Belop i NOK 1000", "2024 2023", "Sum driftsinntekter 500000 480000"]),
      buildPage(3, ["Balanse", "Belop i NOK 1000", "2024 2023", "Sum eiendeler 900000 850000"]),
      buildPage(4, ["Selskapsregnskap", "Resultatregnskap", "Belop i NOK 1000", "2024 2023", "Sum driftsinntekter 200000 190000"]),
      buildPage(5, ["Balanse", "Belop i NOK 1000", "2024 2023", "Sum eiendeler 400000 380000"]),
    ]);

    const byPage = new Map(result.map((c) => [c.pageNumber, c]));
    expect(byPage.get(2)?.statementScope).toBe("CONSOLIDATED");
    expect(byPage.get(2)?.hasExplicitScopeSignal).toBe(true);
    // Page 3 has no scope heading — it inherits CONSOLIDATED from page 2.
    expect(byPage.get(3)?.statementScope).toBe("CONSOLIDATED");
    expect(byPage.get(3)?.hasExplicitScopeSignal).toBe(false);
    // Page 4 carries the Selskapsregnskap heading — flips back to COMPANY.
    expect(byPage.get(4)?.statementScope).toBe("COMPANY");
    expect(byPage.get(4)?.hasExplicitScopeSignal).toBe(true);
    expect(byPage.get(5)?.statementScope).toBe("COMPANY");
  });

  it("does not let a board report mentioning the group flip the scope", () => {
    const result = classifyPages([
      buildPage(1, ["Styrets beretning", "Konsernet hadde et godt ar", "Konsernregnskapet viser vekst"]),
      buildPage(2, ["Resultatregnskap", "Belop i: NOK", "2024 2023", "Salgsinntekter 103097000 99210000"]),
    ]);
    // The board report prose mentions konsern, but BOARD_REPORT pages never
    // flip scope — the statement page stays COMPANY.
    expect(result[1]?.statementScope).toBe("COMPANY");
  });

  it("detects CONSOLIDATED from inflected heading 'Konsernregnskapet'", () => {
    // Some annual reports use the definite form as the section heading.
    const result = classifyPages([
      buildPage(1, ["Konsernregnskapet", "Resultatregnskap", "Belop i NOK", "2024 2023", "Salgsinntekter 1000000 900000", "Driftsresultat 200000 180000"]),
      buildPage(2, ["Morselskapsregnskap", "Resultatregnskap", "Belop i NOK", "2024 2023", "Driftsinntekter 500000 450000"]),
    ]);
    const byPage = new Map(result.map((c) => [c.pageNumber, c]));
    expect(byPage.get(1)?.statementScope).toBe("CONSOLIDATED");
    expect(byPage.get(1)?.hasExplicitScopeSignal).toBe(true);
    expect(byPage.get(2)?.statementScope).toBe("COMPANY");
    expect(byPage.get(2)?.hasExplicitScopeSignal).toBe(true);
  });

  it("detects CONSOLIDATED from genitive heading 'Konsernets resultatregnskap'", () => {
    // Some annual reports use the genitive possessive form as the section heading.
    const result = classifyPages([
      buildPage(1, ["Konsernets resultatregnskap", "Belop i NOK", "2024 2023", "Salgsinntekter 1000000 900000", "Driftsresultat 200000 180000"]),
      buildPage(2, ["Morselskapets resultatregnskap", "Belop i NOK", "2024 2023", "Driftsinntekter 500000 450000"]),
    ]);
    const byPage = new Map(result.map((c) => [c.pageNumber, c]));
    expect(byPage.get(1)?.statementScope).toBe("CONSOLIDATED");
    expect(byPage.get(1)?.hasExplicitScopeSignal).toBe(true);
    expect(byPage.get(2)?.statementScope).toBe("COMPANY");
    expect(byPage.get(2)?.hasExplicitScopeSignal).toBe(true);
  });

  it("does not falsely flip scope when 'Konsernregnskapet' appears mid-prose on a non-heading page", () => {
    // "Konsernregnskapet viser..." in body text must NOT flip scope unless it is the heading.
    const result = classifyPages([
      buildPage(1, [
        "Styrets beretning",
        "Virksomheten drives godt.",
        "Konsernregnskapet viser et overskudd pa 50 mill kr.",
        "Styret er fornøyd med resultatet.",
      ]),
      buildPage(2, ["Resultatregnskap", "Belop i: NOK", "2024 2023", "Driftsinntekter 103097000 99210000"]),
    ]);
    expect(result[1]?.statementScope).toBe("COMPANY");
  });
});
