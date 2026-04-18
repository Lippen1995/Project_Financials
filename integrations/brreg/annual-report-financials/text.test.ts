import { describe, expect, it } from "vitest";

import {
  extractIntegers,
  parseFinancialInteger,
  repairOcrTokenBoundaries,
} from "@/integrations/brreg/annual-report-financials/text";

describe("annual-report text helpers", () => {
  it("parses parentheses negatives", () => {
    expect(parseFinancialInteger("(1 234)")).toBe(-1234);
  });

  it("parses trailing negatives", () => {
    expect(parseFinancialInteger("12 450-")).toBe(-12450);
  });

  it("returns null for blank comparative cells", () => {
    expect(parseFinancialInteger("   ")).toBeNull();
  });

  it("repairs OCR token merges and splits", () => {
    expect(repairOcrTokenBoundaries("Salgsinntekter103097000")).toBe(
      "Salgsinntekter 103097000",
    );
    expect(repairOcrTokenBoundaries("Note12(103097)")).toBe("Note 12 (103097)");
  });

  it("extracts merged note-number tokens without losing negatives", () => {
    expect(extractIntegers("Note 8 (1 250) 4 950")).toEqual(["(1 250)", "4 950"]);
  });
});
