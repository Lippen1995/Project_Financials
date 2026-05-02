import { FinancialFactStatementType } from "@prisma/client";

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export type ReviewedFactForValidation = {
  metricKey: string;
  fiscalYear: number;
  statementType: FinancialFactStatementType;
  value: bigint | null;
  unitScale: number;
  sourcePage?: number | null;
  rawLabel?: string | null;
};

// ---------------------------------------------------------------------------
// Issue types — internal uses bigint, serialized uses string
// ---------------------------------------------------------------------------

export type ReviewedFactsValidationIssue = {
  severity: "INFO" | "WARNING" | "ERROR";
  ruleCode: string;
  message: string;
  expectedValue?: bigint | null;
  actualValue?: bigint | null;
  context?: Record<string, unknown>;
};

export type ReviewedFactsValidationIssuePayload = {
  severity: "INFO" | "WARNING" | "ERROR";
  ruleCode: string;
  message: string;
  expectedValue?: string | null;
  actualValue?: string | null;
  context?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ReviewedFactsValidationResult = {
  passed: boolean;
  validationScore: number;
  hasBlockingErrors: boolean;
  blockingIssues: ReviewedFactsValidationIssue[];
  warnings: ReviewedFactsValidationIssue[];
  issues: ReviewedFactsValidationIssue[];
  selectedFacts: Map<string, ReviewedFactForValidation>;
};

export type ReviewedFactsValidationPayload = {
  passed: boolean;
  validationScore: number;
  hasBlockingErrors: boolean;
  blockingIssues: ReviewedFactsValidationIssuePayload[];
  warnings: ReviewedFactsValidationIssuePayload[];
  issues: ReviewedFactsValidationIssuePayload[];
  reviewedFactCount: number;
};

// ---------------------------------------------------------------------------
// BigInt arithmetic helpers
// ---------------------------------------------------------------------------

export function bigintAbs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export function bigintToleranceFor(values: Array<bigint | null | undefined>): bigint {
  const defined = values.filter((v): v is bigint => v !== null && v !== undefined);
  if (defined.length === 0) return 1000n;
  const maxAbs = defined.reduce((max, v) => {
    const abs = bigintAbs(v);
    return abs > max ? abs : max;
  }, 0n);
  // Equivalent to max(1000, round(maxAbs * 0.005)): use maxAbs / 200n since 0.005 = 1/200
  const computed = maxAbs / 200n;
  return computed > 1000n ? computed : 1000n;
}

export function bigintApproxEqual(
  left: bigint | null | undefined,
  right: bigint | null | undefined,
): boolean {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  return bigintAbs(left - right) <= bigintToleranceFor([left, right]);
}

function getFactValue(
  map: Map<string, ReviewedFactForValidation>,
  metricKey: string,
): bigint | null {
  return map.get(metricKey)?.value ?? null;
}

// ---------------------------------------------------------------------------
// BigInt-safe validator
// ---------------------------------------------------------------------------

export function validateReviewedFacts(
  facts: ReviewedFactForValidation[],
): ReviewedFactsValidationResult {
  // Build selected facts map: one entry per metricKey, prefer non-null values
  const selectedFacts = new Map<string, ReviewedFactForValidation>();
  for (const fact of facts) {
    const existing = selectedFacts.get(fact.metricKey);
    if (!existing || (existing.value === null && fact.value !== null)) {
      selectedFacts.set(fact.metricKey, fact);
    }
  }

  const issues: ReviewedFactsValidationIssue[] = [];

  // Unit scale consistency across non-null facts
  const nonNullFacts = facts.filter((f) => f.value !== null);
  const unitScales = new Set(nonNullFacts.map((f) => f.unitScale));
  if (unitScales.size > 1) {
    issues.push({
      severity: "ERROR",
      ruleCode: "UNIT_SCALE_INCONSISTENCY",
      message: `Motstridende enhetsskalaer funnet: ${Array.from(unitScales).join(", ")}.`,
    });
  }

  // Fiscal year consistency
  const fiscalYears = new Set(facts.map((f) => f.fiscalYear));
  if (fiscalYears.size > 1) {
    issues.push({
      severity: "ERROR",
      ruleCode: "MIXED_FISCAL_YEARS",
      message: `Reviewed facts har blandede regnskapsår: ${Array.from(fiscalYears).join(", ")}.`,
    });
  }

  // IS: operating_profit = total_operating_income - total_operating_expenses
  const totalOperatingIncome = getFactValue(selectedFacts, "total_operating_income");
  const totalOperatingExpenses = getFactValue(selectedFacts, "total_operating_expenses");
  const operatingProfit = getFactValue(selectedFacts, "operating_profit");
  if (
    totalOperatingIncome !== null &&
    totalOperatingExpenses !== null &&
    operatingProfit !== null &&
    !bigintApproxEqual(operatingProfit, totalOperatingIncome - totalOperatingExpenses)
  ) {
    issues.push({
      severity: "ERROR",
      ruleCode: "IS_OPERATING_PROFIT_MATCH",
      message:
        "Operating profit does not reconcile to total operating income minus total operating expenses.",
      expectedValue: totalOperatingIncome - totalOperatingExpenses,
      actualValue: operatingProfit,
    });
  }

  // IS: net_financial_items = financial_income - financial_expense (warning)
  const financialIncome = getFactValue(selectedFacts, "financial_income");
  const financialExpense = getFactValue(selectedFacts, "financial_expense");
  const netFinancialItems = getFactValue(selectedFacts, "net_financial_items");
  if (
    financialIncome !== null &&
    financialExpense !== null &&
    netFinancialItems !== null &&
    !bigintApproxEqual(netFinancialItems, financialIncome - financialExpense)
  ) {
    issues.push({
      severity: "WARNING",
      ruleCode: "IS_NET_FINANCIAL_ITEMS_MATCH",
      message:
        "Net financial items do not reconcile to financial income minus financial expense.",
      expectedValue: financialIncome - financialExpense,
      actualValue: netFinancialItems,
    });
  }

  // IS: profit_before_tax = operating_profit + net_financial_items
  const profitBeforeTax = getFactValue(selectedFacts, "profit_before_tax");
  if (
    operatingProfit !== null &&
    netFinancialItems !== null &&
    profitBeforeTax !== null &&
    !bigintApproxEqual(profitBeforeTax, operatingProfit + netFinancialItems)
  ) {
    issues.push({
      severity: "ERROR",
      ruleCode: "IS_PROFIT_BEFORE_TAX_MATCH",
      message:
        "Profit before tax does not reconcile to operating profit plus net financial items.",
      expectedValue: operatingProfit + netFinancialItems,
      actualValue: profitBeforeTax,
    });
  }

  // IS: net_income = profit_before_tax - tax_expense
  const taxExpense = getFactValue(selectedFacts, "tax_expense");
  const netIncome = getFactValue(selectedFacts, "net_income");
  if (
    profitBeforeTax !== null &&
    taxExpense !== null &&
    netIncome !== null &&
    !bigintApproxEqual(netIncome, profitBeforeTax - taxExpense)
  ) {
    issues.push({
      severity: "ERROR",
      ruleCode: "IS_NET_INCOME_MATCH",
      message: "Net income does not reconcile to profit before tax minus tax expense.",
      expectedValue: profitBeforeTax - taxExpense,
      actualValue: netIncome,
    });
  }

  // BS: total_assets = total_equity_and_liabilities
  const totalAssets = getFactValue(selectedFacts, "total_assets");
  const totalEquityAndLiabilities = getFactValue(selectedFacts, "total_equity_and_liabilities");
  if (
    totalAssets !== null &&
    totalEquityAndLiabilities !== null &&
    !bigintApproxEqual(totalAssets, totalEquityAndLiabilities)
  ) {
    issues.push({
      severity: "ERROR",
      ruleCode: "BS_TOTAL_BALANCES",
      message: "Total assets do not match total equity and liabilities.",
      expectedValue: totalAssets,
      actualValue: totalEquityAndLiabilities,
    });
  }

  // BS: total_equity_and_liabilities = total_equity + total_liabilities
  const totalEquity = getFactValue(selectedFacts, "total_equity");
  const totalLiabilities = getFactValue(selectedFacts, "total_liabilities");
  if (
    totalEquity !== null &&
    totalLiabilities !== null &&
    totalEquityAndLiabilities !== null &&
    !bigintApproxEqual(totalEquityAndLiabilities, totalEquity + totalLiabilities)
  ) {
    issues.push({
      severity: "ERROR",
      ruleCode: "BS_EQUITY_LIABILITIES_MATCH",
      message:
        "Total equity and liabilities do not reconcile to total equity plus total liabilities.",
      expectedValue: totalEquity + totalLiabilities,
      actualValue: totalEquityAndLiabilities,
    });
  }

  // BS: total_liabilities = long_term_liabilities + current_liabilities
  const longTermLiabilities = getFactValue(selectedFacts, "long_term_liabilities");
  const currentLiabilities = getFactValue(selectedFacts, "current_liabilities");
  if (
    longTermLiabilities !== null &&
    currentLiabilities !== null &&
    totalLiabilities !== null &&
    !bigintApproxEqual(totalLiabilities, longTermLiabilities + currentLiabilities)
  ) {
    issues.push({
      severity: "ERROR",
      ruleCode: "BS_TOTAL_LIABILITIES_COMPONENTS",
      message:
        "Total liabilities do not reconcile to long-term plus current liabilities.",
      expectedValue: longTermLiabilities + currentLiabilities,
      actualValue: totalLiabilities,
    });
  }

  const blockingIssues = issues.filter((i) => i.severity === "ERROR");
  const warnings = issues.filter((i) => i.severity === "WARNING");
  const validationScore = Number(
    Math.max(
      0,
      Math.min(1, 1 - blockingIssues.length * 0.18 - warnings.length * 0.04),
    ).toFixed(4),
  );

  return {
    passed: blockingIssues.length === 0,
    validationScore,
    hasBlockingErrors: blockingIssues.length > 0,
    blockingIssues,
    warnings,
    issues,
    selectedFacts,
  };
}

// ---------------------------------------------------------------------------
// JSON-safe serializer — converts bigint values to strings
// ---------------------------------------------------------------------------

function serializeIssue(
  issue: ReviewedFactsValidationIssue,
): ReviewedFactsValidationIssuePayload {
  return {
    severity: issue.severity,
    ruleCode: issue.ruleCode,
    message: issue.message,
    ...(issue.expectedValue !== undefined && {
      expectedValue: issue.expectedValue !== null ? String(issue.expectedValue) : null,
    }),
    ...(issue.actualValue !== undefined && {
      actualValue: issue.actualValue !== null ? String(issue.actualValue) : null,
    }),
    ...(issue.context !== undefined && { context: issue.context }),
  };
}

export function serializeValidationPayload(
  result: ReviewedFactsValidationResult,
  reviewedFactCount: number,
): ReviewedFactsValidationPayload {
  return {
    passed: result.passed,
    validationScore: result.validationScore,
    hasBlockingErrors: result.hasBlockingErrors,
    blockingIssues: result.blockingIssues.map(serializeIssue),
    warnings: result.warnings.map(serializeIssue),
    issues: result.issues.map(serializeIssue),
    reviewedFactCount,
  };
}
