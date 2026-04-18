import { describe, expect, it } from "vitest";

import { detectUnitScale } from "@/integrations/brreg/annual-report-financials/unit-scale";

describe("detectUnitScale", () => {
  it("detects whole NOK declarations", () => {
    const result = detectUnitScale("Beløp i: NOK Resultatregnskap for 2024");

    expect(result.unitScale).toBe(1);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("detects NOK 1000 declarations", () => {
    const result = detectUnitScale("Beløp i NOK 1 000. Balanse per 31.12.");

    expect(result.unitScale).toBe(1000);
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("returns null when no declaration is present", () => {
    const result = detectUnitScale("Balanse per 31.12.2024");

    expect(result.unitScale).toBeNull();
  });
});
