import { describe, expect, it } from "vitest";

import {
  combineFinancialValueOrigins,
  financialHeadlineOrigins,
} from "@/lib/financial-value-origin";

describe("financial value provenance", () => {
  it("keeps a reported anchor reported inside a hybrid statement", () => {
    expect(
      financialHeadlineOrigins([
        {
          conceptKey: "OperatingIncomeTotal",
          metricKey: "total_operating_income",
          value: 100n,
          valueOrigin: "reported",
        },
        {
          conceptKey: "OperatingResult",
          metricKey: "operating_profit",
          value: 20n,
          valueOrigin: "synthetic",
        },
      ]),
    ).toMatchObject({ revenue: "reported", operatingProfit: "synthetic" });
  });

  it("marks a derived value synthetic if any operand is synthetic", () => {
    expect(combineFinancialValueOrigins("reported", "synthetic")).toBe("synthetic");
    expect(combineFinancialValueOrigins("reported", "reported")).toBe("reported");
    expect(combineFinancialValueOrigins("reported", null)).toBeNull();
  });
});
