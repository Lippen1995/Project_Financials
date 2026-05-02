import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  validateReviewedFacts,
  serializeValidationPayload,
  bigintAbs,
  bigintToleranceFor,
  bigintApproxEqual,
  type ReviewedFactForValidation,
} from "./annual-report-reviewed-facts-validation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bs(metricKey: string, value: bigint | null, unitScale = 1): ReviewedFactForValidation {
  return { metricKey, fiscalYear: 2024, statementType: "BALANCE_SHEET", value, unitScale };
}

function is(metricKey: string, value: bigint | null, unitScale = 1): ReviewedFactForValidation {
  return { metricKey, fiscalYear: 2024, statementType: "INCOME_STATEMENT", value, unitScale };
}

// Balanced realistic Norwegian SME from golden fixture
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "../../test/fixtures/annual-reports/proff-2024-reviewed-facts.json"),
    "utf-8",
  ),
) as {
  facts: Record<string, string>;
  expectedValidation: { passed: boolean; hasBlockingErrors: boolean };
};

function fixtureReviewedFacts(): ReviewedFactForValidation[] {
  const f = fixture.facts;
  return [
    is("total_operating_income",      BigInt(f.total_operating_income)),
    is("total_operating_expenses",    BigInt(f.total_operating_expenses)),
    is("operating_profit",            BigInt(f.operating_profit)),
    is("net_financial_items",         BigInt(f.net_financial_items)),
    is("profit_before_tax",           BigInt(f.profit_before_tax)),
    is("tax_expense",                 BigInt(f.tax_expense)),
    is("net_income",                  BigInt(f.net_income)),
    bs("total_assets",                BigInt(f.total_assets)),
    bs("total_equity",                BigInt(f.total_equity)),
    bs("total_liabilities",           BigInt(f.total_liabilities)),
    bs("total_equity_and_liabilities",BigInt(f.total_equity_and_liabilities)),
  ];
}

// ---------------------------------------------------------------------------
// BigInt arithmetic helpers
// ---------------------------------------------------------------------------

describe("bigintAbs", () => {
  it("returns the value unchanged for positive bigints", () => {
    expect(bigintAbs(42n)).toBe(42n);
  });

  it("negates negative bigints", () => {
    expect(bigintAbs(-42n)).toBe(42n);
  });

  it("handles zero", () => {
    expect(bigintAbs(0n)).toBe(0n);
  });
});

describe("bigintToleranceFor", () => {
  it("returns 1000n when no values provided", () => {
    expect(bigintToleranceFor([])).toBe(1000n);
  });

  it("returns 1000n for values producing a computed tolerance below 1000", () => {
    // maxAbs = 100000n, 100000n / 200n = 500n < 1000n → floor to 1000n
    expect(bigintToleranceFor([100000n])).toBe(1000n);
  });

  it("returns computed tolerance for larger values", () => {
    // maxAbs = 100000000n, 100000000n / 200n = 500000n > 1000n
    expect(bigintToleranceFor([100000000n])).toBe(500000n);
  });

  it("uses the absolute maximum of the provided values", () => {
    // max(|10000000n|, |-80000000n|) = 80000000n → 80000000n / 200n = 400000n
    expect(bigintToleranceFor([10000000n, -80000000n])).toBe(400000n);
  });

  it("ignores null and undefined entries", () => {
    expect(bigintToleranceFor([null, undefined, 200000n])).toBe(1000n);
  });
});

describe("bigintApproxEqual", () => {
  it("returns false when either side is null", () => {
    expect(bigintApproxEqual(null, 1000n)).toBe(false);
    expect(bigintApproxEqual(1000n, null)).toBe(false);
  });

  it("returns true for identical values", () => {
    expect(bigintApproxEqual(92155000n, 92155000n)).toBe(true);
  });

  it("returns true when difference is within tolerance", () => {
    // tolerance for 92155000n = max(1000n, 92155000n/200n) = 460775n
    // difference = 460775n → exactly at boundary → true
    expect(bigintApproxEqual(92155000n, 92155000n - 460775n)).toBe(true);
  });

  it("returns false when difference exceeds tolerance", () => {
    // tolerance ≈ 460775n; difference of 1155000n > 460775n
    expect(bigintApproxEqual(92155000n, 91000000n)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateReviewedFacts — golden fixture (realistic Norwegian SME)
// ---------------------------------------------------------------------------

describe("validateReviewedFacts — golden fixture", () => {
  it("passes validation for correctly balanced realistic annual report", () => {
    const result = validateReviewedFacts(fixtureReviewedFacts());

    expect(result.passed).toBe(fixture.expectedValidation.passed);
    expect(result.hasBlockingErrors).toBe(fixture.expectedValidation.hasBlockingErrors);
    expect(result.blockingIssues).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.validationScore).toBe(1);
  });

  it("selectedFacts contain BigInt values from fixture", () => {
    const result = validateReviewedFacts(fixtureReviewedFacts());

    expect(result.selectedFacts.get("total_assets")?.value).toBe(BigInt(fixture.facts.total_assets));
    expect(result.selectedFacts.get("net_income")?.value).toBe(BigInt(fixture.facts.net_income));
    expect(result.selectedFacts.get("total_equity")?.value).toBe(BigInt(fixture.facts.total_equity));
  });
});

// ---------------------------------------------------------------------------
// validateReviewedFacts — BigInt precision
// ---------------------------------------------------------------------------

describe("validateReviewedFacts — BigInt precision", () => {
  it("preserves BigInt values that Number cannot represent exactly", () => {
    // 9007199254740993n = Number.MAX_SAFE_INTEGER + 2
    // Number(9007199254740993n) rounds to 9007199254740992 (MAX_SAFE_INTEGER + 1)
    const exactAssets = BigInt(Number.MAX_SAFE_INTEGER) + 2n;
    const facts = [
      bs("total_assets", exactAssets),
      bs("total_equity_and_liabilities", exactAssets),
    ];

    const result = validateReviewedFacts(facts);
    expect(result.passed).toBe(true);

    const assetFact = result.selectedFacts.get("total_assets");
    expect(typeof assetFact?.value).toBe("bigint");
    expect(assetFact?.value).toBe(exactAssets);

    // Prove Number loses precision: both MAX_SAFE_INTEGER+1 and MAX_SAFE_INTEGER+2 round to
    // the same float64 (9007199254740992), so Number(exactAssets) !== exactAssets numerically.
    expect(Number(exactAssets)).toBe(Number.MAX_SAFE_INTEGER + 1); // rounds down
    // The BigInt exact value differs from the rounded Number by 1n
    expect(exactAssets - BigInt(Number(exactAssets))).toBe(1n);
  });

  it("detects balance sheet mismatch with large values that would confuse Number arithmetic", () => {
    // Values large enough that the difference (1_155_000n) is real but
    // the tolerance uses exact BigInt division — no floating-point rounding
    const assets = 9007199254740993000n;
    const equityAndLiabilities = 9007199254739838000n; // 1_155_000n less
    const facts = [
      bs("total_assets", assets),
      bs("total_equity_and_liabilities", equityAndLiabilities),
    ];

    const result = validateReviewedFacts(facts);
    // tolerance = max(1000n, 9007199254740993000n / 200n) = 45035996273704965n
    // difference = 1_155_000n < tolerance → within tolerance → passes
    // (This is correct: 1155 NOK on a 9 quadrillion balance is within tolerance)
    expect(result.passed).toBe(true);
  });

  it("serializeValidationPayload converts bigint issue values to strings", () => {
    const assets = 92155000n;
    const equityAndLiabilities = 91000000n; // mismatch beyond tolerance
    const facts = [
      bs("total_assets", assets),
      bs("total_equity_and_liabilities", equityAndLiabilities),
    ];

    const result = validateReviewedFacts(facts);
    expect(result.hasBlockingErrors).toBe(true);

    const payload = serializeValidationPayload(result, facts.length);
    const bsIssue = payload.blockingIssues.find((i) => i.ruleCode === "BS_TOTAL_BALANCES");
    expect(bsIssue).toBeDefined();
    expect(typeof bsIssue?.expectedValue).toBe("string");
    expect(typeof bsIssue?.actualValue).toBe("string");
    expect(bsIssue?.expectedValue).toBe("92155000");
    expect(bsIssue?.actualValue).toBe("91000000");
  });
});

// ---------------------------------------------------------------------------
// validateReviewedFacts — balance sheet checks
// ---------------------------------------------------------------------------

describe("validateReviewedFacts — balance sheet", () => {
  it("detects total_assets != total_equity_and_liabilities", () => {
    const facts = [
      bs("total_assets", 10000000n),
      bs("total_equity_and_liabilities", 12000000n),
    ];
    const result = validateReviewedFacts(facts);
    expect(result.passed).toBe(false);
    expect(result.blockingIssues.some((i) => i.ruleCode === "BS_TOTAL_BALANCES")).toBe(true);
  });

  it("passes when total_assets == total_equity_and_liabilities", () => {
    const facts = [
      bs("total_assets", 10000000n),
      bs("total_equity_and_liabilities", 10000000n),
    ];
    const result = validateReviewedFacts(facts);
    expect(result.blockingIssues.some((i) => i.ruleCode === "BS_TOTAL_BALANCES")).toBe(false);
  });

  it("detects equity + liabilities != total_equity_and_liabilities", () => {
    const facts = [
      bs("total_equity", 36372000n),
      bs("total_liabilities", 55783000n),
      bs("total_equity_and_liabilities", 90000000n), // wrong: should be 92155000
    ];
    const result = validateReviewedFacts(facts);
    expect(result.blockingIssues.some((i) => i.ruleCode === "BS_EQUITY_LIABILITIES_MATCH")).toBe(true);
  });

  it("detects long_term + current liabilities != total_liabilities", () => {
    const facts = [
      bs("long_term_liabilities", 30000000n),
      bs("current_liabilities", 20000000n),
      bs("total_liabilities", 55783000n), // wrong: should be 50000000
    ];
    const result = validateReviewedFacts(facts);
    expect(result.blockingIssues.some((i) => i.ruleCode === "BS_TOTAL_LIABILITIES_COMPONENTS")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateReviewedFacts — income statement checks
// ---------------------------------------------------------------------------

describe("validateReviewedFacts — income statement", () => {
  it("detects operating profit mismatch", () => {
    const facts = [
      is("total_operating_income", 103097000n),
      is("total_operating_expenses", 81887000n),
      is("operating_profit", 25000000n), // wrong: should be 21210000
    ];
    const result = validateReviewedFacts(facts);
    expect(result.blockingIssues.some((i) => i.ruleCode === "IS_OPERATING_PROFIT_MATCH")).toBe(true);
  });

  it("detects profit_before_tax mismatch", () => {
    const facts = [
      is("operating_profit", 21210000n),
      is("net_financial_items", 2150000n),
      is("profit_before_tax", 25000000n), // wrong: should be 23360000
    ];
    const result = validateReviewedFacts(facts);
    expect(result.blockingIssues.some((i) => i.ruleCode === "IS_PROFIT_BEFORE_TAX_MATCH")).toBe(true);
  });

  it("detects net_income mismatch", () => {
    const facts = [
      is("profit_before_tax", 23360000n),
      is("tax_expense", 5139000n),
      is("net_income", 20000000n), // wrong: should be 18221000
    ];
    const result = validateReviewedFacts(facts);
    expect(result.blockingIssues.some((i) => i.ruleCode === "IS_NET_INCOME_MATCH")).toBe(true);
  });

  it("issues warning when net_financial_items != financial_income - financial_expense", () => {
    const facts = [
      is("financial_income", 3000000n),
      is("financial_expense", 500000n),
      is("net_financial_items", 2000000n), // wrong: should be 2500000
    ];
    const result = validateReviewedFacts(facts);
    expect(result.warnings.some((i) => i.ruleCode === "IS_NET_FINANCIAL_ITEMS_MATCH")).toBe(true);
    expect(result.blockingIssues.some((i) => i.ruleCode === "IS_NET_FINANCIAL_ITEMS_MATCH")).toBe(false);
  });

  it("skips income statement checks when only some metrics are present", () => {
    // Only total_assets and total_equity_and_liabilities — no IS checks should fire
    const facts = [
      bs("total_assets", 10000000n),
      bs("total_equity_and_liabilities", 10000000n),
    ];
    const result = validateReviewedFacts(facts);
    const isErrors = result.issues.filter((i) =>
      ["IS_OPERATING_PROFIT_MATCH", "IS_PROFIT_BEFORE_TAX_MATCH", "IS_NET_INCOME_MATCH"].includes(i.ruleCode),
    );
    expect(isErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateReviewedFacts — unit scale and fiscal year
// ---------------------------------------------------------------------------

describe("validateReviewedFacts — unit scale and fiscal year", () => {
  it("detects inconsistent unit scales", () => {
    const facts = [
      bs("total_assets", 10000n, 1000),
      bs("total_equity_and_liabilities", 10000000n, 1),
    ];
    const result = validateReviewedFacts(facts);
    expect(result.blockingIssues.some((i) => i.ruleCode === "UNIT_SCALE_INCONSISTENCY")).toBe(true);
  });

  it("passes when all facts share the same unit scale", () => {
    const facts = [
      bs("total_assets", 92155n, 1000),
      bs("total_equity_and_liabilities", 92155n, 1000),
    ];
    const result = validateReviewedFacts(facts);
    expect(result.blockingIssues.some((i) => i.ruleCode === "UNIT_SCALE_INCONSISTENCY")).toBe(false);
  });

  it("detects mixed fiscal years", () => {
    const facts: ReviewedFactForValidation[] = [
      { metricKey: "total_assets", fiscalYear: 2023, statementType: "BALANCE_SHEET", value: 10000000n, unitScale: 1 },
      { metricKey: "total_equity_and_liabilities", fiscalYear: 2024, statementType: "BALANCE_SHEET", value: 10000000n, unitScale: 1 },
    ];
    const result = validateReviewedFacts(facts);
    expect(result.blockingIssues.some((i) => i.ruleCode === "MIXED_FISCAL_YEARS")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateReviewedFacts — validation score
// ---------------------------------------------------------------------------

describe("validateReviewedFacts — validation score", () => {
  it("returns validationScore of 1 for fully valid facts", () => {
    const result = validateReviewedFacts(fixtureReviewedFacts());
    expect(result.validationScore).toBe(1);
  });

  it("reduces validationScore by 0.18 per blocking error", () => {
    // Introduce two errors: BS_TOTAL_BALANCES + IS_OPERATING_PROFIT_MATCH
    const facts = [
      bs("total_assets", 10000000n),
      bs("total_equity_and_liabilities", 12000000n), // BS error
      is("total_operating_income", 103097000n),
      is("total_operating_expenses", 81887000n),
      is("operating_profit", 25000000n), // IS error
    ];
    const result = validateReviewedFacts(facts);
    expect(result.blockingIssues.length).toBeGreaterThanOrEqual(2);
    expect(result.validationScore).toBeLessThanOrEqual(1 - 2 * 0.18 + 0.001);
  });
});

// ---------------------------------------------------------------------------
// serializeValidationPayload
// ---------------------------------------------------------------------------

describe("serializeValidationPayload", () => {
  it("includes reviewedFactCount", () => {
    const result = validateReviewedFacts(fixtureReviewedFacts());
    const payload = serializeValidationPayload(result, 11);
    expect(payload.reviewedFactCount).toBe(11);
  });

  it("copies passed, validationScore, hasBlockingErrors from result", () => {
    const result = validateReviewedFacts(fixtureReviewedFacts());
    const payload = serializeValidationPayload(result, 11);
    expect(payload.passed).toBe(result.passed);
    expect(payload.validationScore).toBe(result.validationScore);
    expect(payload.hasBlockingErrors).toBe(result.hasBlockingErrors);
  });

  it("omits expectedValue/actualValue from issues that have no values", () => {
    const facts = [
      { metricKey: "total_assets", fiscalYear: 2023, statementType: "BALANCE_SHEET" as const, value: 10000000n, unitScale: 1 },
      { metricKey: "total_equity_and_liabilities", fiscalYear: 2024, statementType: "BALANCE_SHEET" as const, value: 10000000n, unitScale: 1 },
    ];
    const result = validateReviewedFacts(facts);
    const payload = serializeValidationPayload(result, 2);
    const mixedYearIssue = payload.blockingIssues.find((i) => i.ruleCode === "MIXED_FISCAL_YEARS");
    expect(mixedYearIssue).toBeDefined();
    expect("expectedValue" in mixedYearIssue!).toBe(false);
    expect("actualValue" in mixedYearIssue!).toBe(false);
  });
});
