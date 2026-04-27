import { describe, expect, it } from "vitest";

import { classifyPages } from "@/integrations/brreg/annual-report-financials/page-classification";
import { PageTextLayer } from "@/integrations/brreg/annual-report-financials/types";
import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";

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
});
