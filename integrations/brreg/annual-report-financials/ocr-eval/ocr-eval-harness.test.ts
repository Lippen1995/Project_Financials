import { describe, it, expect } from "vitest";

import {
  extractNumericTokens,
  evaluateOcrAgainstGroundTruth,
} from "./ocr-eval-harness";

describe("extractNumericTokens", () => {
  it("collapses Norwegian space-grouped numbers", () => {
    const toks = extractNumericTokens("Sum inntekter 3 398 713 005");
    expect(toks.has("3398713005")).toBe(true);
  });

  it("collapses dot-grouped numbers", () => {
    const toks = extractNumericTokens("1.234.567");
    expect(toks.has("1234567")).toBe(true);
  });

  it("preserves a negative sign and also yields the magnitude", () => {
    const toks = extractNumericTokens("Netto finans -628 054 566");
    expect(toks.has("-628054566")).toBe(true);
    expect(toks.has("628054566")).toBe(true);
  });

  it("treats parenthesised numbers as negative", () => {
    const toks = extractNumericTokens("(10 690 574)");
    expect(toks.has("-10690574")).toBe(true);
  });

  it("strips leading zeros", () => {
    const toks = extractNumericTokens("00123");
    expect(toks.has("123")).toBe(true);
  });
});

describe("evaluateOcrAgainstGroundTruth", () => {
  const groundTruth = [
    { metricKey: "total_revenue", value: "3398713005", sourcePage: 6, rawLabel: "Sum inntekter" },
    { metricKey: "operating_profit", value: "151403113", sourcePage: 6, rawLabel: "Driftsresultat" },
    { metricKey: "total_assets", value: "16478238561", sourcePage: 8, rawLabel: "Sum eiendeler" },
  ];

  it("counts an exact digit string on its source page as a hit", () => {
    const result = evaluateOcrAgainstGroundTruth({
      engineName: "test",
      groundTruth,
      pages: [
        { pageNumber: 6, text: "Sum inntekter 3 398 713 005\nDriftsresultat 151 403 113" },
        { pageNumber: 8, text: "Sum eiendeler 16 478 238 561" },
      ],
    });
    expect(result.matchedOnSourcePage).toBe(3);
    expect(result.sourcePageRecall).toBe(1);
  });

  it("flags a near-miss when OCR garbles one digit", () => {
    const result = evaluateOcrAgainstGroundTruth({
      engineName: "test",
      groundTruth: [groundTruth[0]],
      // 3398713005 -> 3398713006 (last digit wrong)
      pages: [{ pageNumber: 6, text: "Sum inntekter 3 398 713 006" }],
    });
    expect(result.matchedOnSourcePage).toBe(0);
    expect(result.matches[0].foundOnSourcePage).toBe(false);
    expect(result.matches[0].nearMiss).toBe("3398713006");
  });

  it("counts a value fused with the adjacent year column as a substring match", () => {
    const result = evaluateOcrAgainstGroundTruth({
      engineName: "test",
      groundTruth: [groundTruth[0]], // total_revenue 3398713005 on page 6
      // OCR fused current+prior year: 3398713005 immediately followed by 3256853023.
      pages: [{ pageNumber: 6, text: "Sum inntekter 33987130053256853023" }],
    });
    expect(result.matchedOnSourcePage).toBe(1);
    expect(result.exactOnSourcePage).toBe(0);
    expect(result.substringOnSourcePage).toBe(1);
    expect(result.matches[0].sourceMatchKind).toBe("substring");
  });

  it("credits any-page recall when the value is on the wrong page", () => {
    const result = evaluateOcrAgainstGroundTruth({
      engineName: "test",
      groundTruth: [groundTruth[2]], // expects page 8
      pages: [{ pageNumber: 6, text: "16 478 238 561" }], // but appears on page 6
    });
    expect(result.matchedOnSourcePage).toBe(0);
    expect(result.matchedOnAnyPage).toBe(1);
    expect(result.anyPageRecall).toBe(1);
  });
});
