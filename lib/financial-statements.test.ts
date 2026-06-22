import { describe, expect, it } from "vitest";

import { getHeadlineFinancialStatements } from "@/lib/financial-statements";
import { NormalizedFinancialStatement } from "@/lib/types";

function statement(
  fiscalYear: number,
  statementScope: "COMPANY" | "CONSOLIDATED",
  revenue: number,
): NormalizedFinancialStatement {
  const timestamp = new Date("2026-06-12T00:00:00.000Z");

  return {
    sourceSystem: "BRREG",
    sourceEntityType: "financial-statement",
    sourceId: `${fiscalYear}-${statementScope}`,
    fetchedAt: timestamp,
    normalizedAt: timestamp,
    rawPayload: {},
    fiscalYear,
    statementScope,
    currency: "NOK",
    revenue,
  };
}

describe("getHeadlineFinancialStatements", () => {
  it("keeps one statement per year and prefers consolidated accounts", () => {
    const result = getHeadlineFinancialStatements([
      statement(2024, "COMPANY", 100),
      statement(2023, "COMPANY", 80),
      statement(2024, "CONSOLIDATED", 150),
    ]);

    expect(
      result.map(({ fiscalYear, statementScope, revenue }) => ({
        fiscalYear,
        statementScope,
        revenue,
      })),
    ).toEqual([
      { fiscalYear: 2024, statementScope: "CONSOLIDATED", revenue: 150 },
      { fiscalYear: 2023, statementScope: "COMPANY", revenue: 80 },
    ]);
  });

  it("keeps the available statement when a year has only one scope", () => {
    const result = getHeadlineFinancialStatements([
      statement(2022, "COMPANY", 60),
      statement(2023, "CONSOLIDATED", 90),
    ]);

    expect(result.map((item) => item.fiscalYear)).toEqual([2023, 2022]);
  });
});
