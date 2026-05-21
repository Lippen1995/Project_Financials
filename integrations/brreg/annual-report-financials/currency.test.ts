import { describe, expect, it } from "vitest";

import { detectCurrency } from "@/integrations/brreg/annual-report-financials/currency";

describe("detectCurrency", () => {
  it("defaults to NOK when no currency is declared", () => {
    const result = detectCurrency("Resultatregnskap 2024 Salgsinntekter 100 000");
    expect(result.currency).toBe("NOK");
  });

  it("keeps NOK for an explicit NOK declaration", () => {
    expect(detectCurrency("Beløp i NOK").currency).toBe("NOK");
    expect(detectCurrency("Beløp i NOK 1000").currency).toBe("NOK");
  });

  it("detects USD from a Norwegian header declaration", () => {
    expect(detectCurrency("Beløp i USD").currency).toBe("USD");
    expect(detectCurrency("Beløp i USD 1000").currency).toBe("USD");
    expect(detectCurrency("Alle tall i USD 1 000").currency).toBe("USD");
  });

  it("detects USD from an English header declaration", () => {
    expect(detectCurrency("Amounts in USD thousands").currency).toBe("USD");
    expect(detectCurrency("Figures in USD").currency).toBe("USD");
  });

  it("detects EUR and GBP", () => {
    expect(detectCurrency("Beløp i EUR 1000").currency).toBe("EUR");
    expect(detectCurrency("Amounts in GBP").currency).toBe("GBP");
  });

  it("does NOT switch currency for a passing prose mention of USD", () => {
    // A note about a foreign subsidiary mentions USD, but it is not a
    // header declaration — the statement currency must stay NOK.
    const result = detectCurrency(
      "Datterselskapet i utlandet har inntekter som omregnes fra USD til norske kroner ved arets slutt.",
    );
    expect(result.currency).toBe("NOK");
  });
});
