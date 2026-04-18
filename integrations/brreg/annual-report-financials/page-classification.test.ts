import { describe, expect, it } from "vitest";

import { classifyPages } from "@/integrations/brreg/annual-report-financials/page-classification";
import { PageTextLayer } from "@/integrations/brreg/annual-report-financials/types";

function buildPage(pageNumber: number, text: string): PageTextLayer {
  return {
    pageNumber,
    text,
    normalizedText: text.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a"),
    hasEmbeddedText: true,
    lines: [],
  };
}

describe("classifyPages", () => {
  it("classifies statutory income and balance pages separately", () => {
    const pages = [
      buildPage(2, "Resultatregnskap Driftsinntekter Driftsresultat Årsresultat Beløp i: NOK 2024 2023"),
      buildPage(3, "Balanse Eiendeler Sum eiendeler Sum egenkapital og gjeld Beløp i: NOK 2024 2023"),
    ];

    const result = classifyPages(pages);

    expect(result[0]?.type).toBe("STATUTORY_INCOME");
    expect(result[1]?.type).toBe("STATUTORY_BALANCE");
    expect(result[0]?.unitScale).toBe(1);
    expect(result[1]?.unitScale).toBe(1);
  });

  it("marks NOK 1000 result pages as supplementary", () => {
    const result = classifyPages([
      buildPage(5, "Resultatregnskap Sum driftsinntekter Driftsresultat Beløp i NOK 1000 2024 2023"),
    ]);

    expect(result[0]?.type).toBe("SUPPLEMENTARY_INCOME");
    expect(result[0]?.unitScale).toBe(1000);
  });
});
