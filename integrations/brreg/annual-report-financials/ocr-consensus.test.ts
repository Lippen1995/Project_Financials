import { describe, expect, it } from "vitest";

import { mergeOcrPageConsensus } from "@/integrations/brreg/annual-report-financials/ocr-consensus";
import { prepareNarrativeOcrPage } from "@/integrations/brreg/annual-report-financials/narrative-ocr-reading-order";
import type { AnnualReportParsedPage } from "@/integrations/brreg/annual-report-financials/types";

function page(engine: string, text: string, confidence: number): AnnualReportParsedPage {
  return {
    pageNumber: 38,
    text,
    normalizedText: text.toLowerCase(),
    lines: [],
    hasEmbeddedText: false,
    blocks: [{
      id: `${engine}-1`,
      kind: "paragraph",
      rawType: `${engine}_line`,
      text,
      normalizedText: text.toLowerCase(),
      bbox: { left: 1910, bottom: 1063, right: 2001, top: 1083 },
      metadata: { confidence },
      source: {
        engine: "LEGACY",
        engineMode: "legacy",
        sourceElementId: `${engine}-1`,
        sourceRawType: `${engine}_line`,
        order: 0,
      },
    }],
    tables: [],
    source: {
      engine: "LEGACY",
      engineMode: "legacy",
      sourceElementId: engine,
      sourceRawType: `${engine}_page`,
      order: 38,
    },
  };
}

describe("mergeOcrPageConsensus", () => {
  it("replaces a matched primary line only when the secondary confidence is materially higher", () => {
    const result = mergeOcrPageConsensus(
      page("tesseract", "President & CFO", 0.846),
      page("rapidocr", "President & CEO", 0.970),
    );
    expect(result.text).toBe("President & CEO");
    expect(result.blocks[0]?.metadata).toMatchObject({ consensusReplaced: true });
    expect(prepareNarrativeOcrPage(result).text).toBe("President & CEO");
  });

  it("keeps the primary text and never appends unmatched secondary lines", () => {
    const primary = page("tesseract", "sale of paints and coatings systems", 0.98);
    const secondary = page("rapidocr", "garbled reversed line", 0.70);
    secondary.blocks[0]!.bbox = { left: 300, bottom: 900, right: 800, top: 920 };
    const result = mergeOcrPageConsensus(primary, secondary);
    expect(result.text).toBe("sale of paints and coatings systems");
    expect(result.text).not.toContain("garbled");
  });

  it("does not remove primary punctuation or Norwegian diacritics", () => {
    expect(
      mergeOcrPageConsensus(
        page("tesseract", "Bjørg Engevik Nilsen", 0.92),
        page("rapidocr", "Bjorg Engevik Nilsen", 0.99),
      ).text,
    ).toBe("Bjørg Engevik Nilsen");
    expect(
      mergeOcrPageConsensus(
        page("tesseract", "Nils K. Selte", 0.9),
        page("rapidocr", "Nils K Selte", 0.98),
      ).text,
    ).toBe("Nils K. Selte");
  });

  it("does not replace a plausible single word on a one-character disagreement", () => {
    expect(
      mergeOcrPageConsensus(
        page("tesseract", "Chairman", 0.75),
        page("rapidocr", "Charman", 0.99),
      ).text,
    ).toBe("Chairman");
  });

  it("supplements a missing large title only when primary text corroborates it", () => {
    const primary = page("tesseract", "Strateei", 0.8);
    const secondary = page("rapidocr", "Strategi", 0.96);
    secondary.blocks[0]!.bbox = { left: 1600, bottom: 1800, right: 2400, top: 1900 };

    const result = mergeOcrPageConsensus(primary, secondary);

    expect(result.blocks.map((block) => block.text)).toEqual(["Strateei", "Strategi"]);
    expect(result.blocks[1]?.metadata).toMatchObject({ consensusSupplemented: true });
  });
});
