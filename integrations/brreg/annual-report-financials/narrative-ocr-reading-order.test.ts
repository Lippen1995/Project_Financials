import { describe, expect, it } from "vitest";

import {
  prepareNarrativeOcrPage,
  removeRepeatedNarrativeChrome,
} from "@/integrations/brreg/annual-report-financials/narrative-ocr-reading-order";
import type { AnnualReportParsedPage } from "@/integrations/brreg/annual-report-financials/types";

function page(): AnnualReportParsedPage {
  const rows = [
    ["Contents Our business Board of Directors' report Sustainability statements", 300, 120, 1050, 140],
    ["Left paragraph one.", 300, 300, 850, 320],
    ["Middle paragraph one.", 950, 280, 1500, 300],
    ["Right paragraph one.", 1600, 290, 2150, 310],
    ["Left paragraph two.", 300, 350, 850, 370],
    ["Middle paragraph two.", 950, 340, 1500, 360],
    ["Right paragraph two.", 1600, 330, 2150, 350],
    ["Sandefjord, Norway, 14 February 2025", 300, 1000, 1000, 1020],
    ["The Board of Directors", 300, 1040, 900, 1060],
    ["Chairman", 300, 1120, 600, 1140],
    ["President & CEO", 950, 1120, 1300, 1140],
    ["This file is sealed with a digital signature.", 1700, 1450, 2200, 1470],
  ] as const;
  const blocks = rows.map(([text, left, bottom, right, top], index) => ({
    id: `b${index}`,
    kind: "paragraph" as const,
    rawType: "ocr_line",
    text,
    normalizedText: text.toLowerCase(),
    bbox: { left, bottom, right, top },
    source: {
      engine: "LEGACY" as const,
      engineMode: "legacy" as const,
      sourceElementId: `b${index}`,
      sourceRawType: "ocr_line",
      order: index,
    },
  }));
  return {
    pageNumber: 38,
    text: blocks.map((block) => block.text).join("\n"),
    normalizedText: blocks.map((block) => block.normalizedText).join(" "),
    lines: [],
    hasEmbeddedText: false,
    blocks,
    tables: [],
    source: {
      engine: "LEGACY",
      engineMode: "legacy",
      sourceElementId: "p38",
      sourceRawType: "ocr_page",
      order: 38,
    },
  };
}

describe("prepareNarrativeOcrPage", () => {
  it("removes Brreg chrome and reads body columns before the signature area", () => {
    const result = prepareNarrativeOcrPage(page());

    expect(result.text).not.toContain("Contents Our business");
    expect(result.text).not.toContain("digital signature");
    expect(result.text.indexOf("Left paragraph two")).toBeLessThan(
      result.text.indexOf("Middle paragraph one"),
    );
    expect(result.text.indexOf("Middle paragraph two")).toBeLessThan(
      result.text.indexOf("Right paragraph one"),
    );
    expect(result.text.indexOf("Right paragraph two")).toBeLessThan(
      result.text.indexOf("Sandefjord"),
    );
    expect(result.text).toContain("President & CEO");
  });

  it("preserves large editorial titles even when the same text repeats", () => {
    const pages = [1, 2, 3].map((pageNumber) => {
      const value = page();
      value.pageNumber = pageNumber;
      value.blocks = [{
        ...value.blocks[0]!,
        id: `title-${pageNumber}`,
        text: "Bærekraftsresultater 2024",
        bbox: { left: 1600, bottom: 2100, right: 3200, top: 2200 },
        metadata: { confidence: 0.94 },
      }];
      return value;
    });

    expect(removeRepeatedNarrativeChrome(pages).every((item) => item.blocks.length === 1)).toBe(true);
  });
});
