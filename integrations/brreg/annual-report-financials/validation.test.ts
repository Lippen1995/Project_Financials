import { describe, expect, it } from "vitest";

import { validateCanonicalFacts } from "@/integrations/brreg/annual-report-financials/validation";
import { CanonicalFactCandidate } from "@/integrations/brreg/annual-report-financials/types";

function buildFact(metricKey: CanonicalFactCandidate["metricKey"], value: number): CanonicalFactCandidate {
  return {
    fiscalYear: 2024,
    statementType:
      metricKey.includes("assets") ||
      metricKey.includes("liabilities") ||
      metricKey.includes("equity") ||
      metricKey === "inventory" ||
      metricKey === "trade_receivables" ||
      metricKey === "other_receivables" ||
      metricKey === "cash_and_cash_equivalents"
        ? "BALANCE_SHEET"
        : "INCOME_STATEMENT",
    metricKey,
    rawLabel: metricKey,
    normalizedLabel: metricKey,
    value,
    currency: "NOK",
    unitScale: 1,
    sourcePage: 2,
    sourceSection: "STATUTORY_INCOME",
    sourceRowText: metricKey,
    noteReference: null,
    confidenceScore: 0.95,
    precedence: "STATUTORY_NOK",
    isDerived: false,
  };
}

describe("validateCanonicalFacts", () => {
  it("passes balanced statements", () => {
    const facts = [
      buildFact("total_operating_income", 103_097_000),
      buildFact("total_operating_expenses", 81_887_000),
      buildFact("operating_profit", 21_210_000),
      buildFact("financial_income", 500_000),
      buildFact("financial_expense", 1_000_000),
      buildFact("net_financial_items", -500_000),
      buildFact("profit_before_tax", 20_710_000),
      buildFact("tax_expense", 2_489_000),
      buildFact("net_income", 18_221_000),
      buildFact("total_assets", 92_155_000),
      buildFact("total_equity", 36_372_000),
      buildFact("long_term_liabilities", 20_000_000),
      buildFact("current_liabilities", 35_783_000),
      buildFact("total_liabilities", 55_783_000),
      buildFact("total_equity_and_liabilities", 92_155_000),
    ];

    const result = validateCanonicalFacts(facts);

    expect(result.hasBlockingErrors).toBe(false);
    expect(result.issues).toEqual([]);
    expect(result.validationScore).toBeGreaterThan(0.9);
  });

  it("blocks publication for unbalanced balance sheets", () => {
    const facts = [
      buildFact("total_assets", 92_155_000),
      buildFact("total_equity", 36_372_000),
      buildFact("long_term_liabilities", 20_000_000),
      buildFact("current_liabilities", 35_000_000),
      buildFact("total_liabilities", 55_000_000),
      buildFact("total_equity_and_liabilities", 91_372_000),
    ];

    const result = validateCanonicalFacts(facts);

    expect(result.hasBlockingErrors).toBe(true);
    expect(result.issues.some((issue) => issue.ruleCode === "BS_TOTAL_BALANCES")).toBe(true);
  });
});
