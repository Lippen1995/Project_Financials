import { chooseCanonicalFacts } from "@/integrations/brreg/annual-report-financials/canonical-mapping";
import { CanonicalFactCandidate, ValidationIssueDraft } from "@/integrations/brreg/annual-report-financials/types";

function toleranceFor(values: Array<number | null | undefined>) {
  const defined = values.filter((value): value is number => typeof value === "number");
  if (defined.length === 0) {
    return 1_000;
  }

  const maxValue = Math.max(...defined.map((value) => Math.abs(value)));
  return Math.max(1_000, Math.round(maxValue * 0.005));
}

function approxEqual(left: number | null | undefined, right: number | null | undefined) {
  if (left === null || left === undefined || right === null || right === undefined) {
    return false;
  }

  return Math.abs(left - right) <= toleranceFor([left, right]);
}

function looksLikeScaleMismatch(left: number, right: number) {
  return approxEqual(left, right * 1000) || approxEqual(left * 1000, right);
}

function getValue(facts: Map<string, CanonicalFactCandidate>, metricKey: string) {
  return facts.get(metricKey)?.value ?? null;
}

function compareFactFamilies(
  issues: ValidationIssueDraft[],
  candidates: CanonicalFactCandidate[],
  stats: {
    duplicateComparisons: number;
    duplicateMatches: number;
    noteComparisons: number;
    noteMatches: number;
  },
) {
  const factsByMetric = new Map<string, CanonicalFactCandidate[]>();
  for (const fact of candidates) {
    const list = factsByMetric.get(fact.metricKey) ?? [];
    list.push(fact);
    factsByMetric.set(fact.metricKey, list);
  }

  for (const [metricKey, metricFacts] of factsByMetric.entries()) {
    const statutory = metricFacts.find((fact) => fact.precedence === "STATUTORY_NOK");
    const supplementary = metricFacts.find(
      (fact) => fact.precedence === "SUPPLEMENTARY_NOK_THOUSANDS",
    );
    const noteFacts = metricFacts.filter((fact) => fact.precedence === "NOTE_DERIVED");

    if (statutory && supplementary) {
      stats.duplicateComparisons += 1;

      if (approxEqual(statutory.value, supplementary.value)) {
        stats.duplicateMatches += 1;
      } else if (looksLikeScaleMismatch(statutory.value, supplementary.value)) {
        issues.push({
          severity: "ERROR",
          ruleCode: "SUSPICIOUS_UNIT_MISMATCH",
          message: `Statutory and supplementary values for ${metricKey} look separated by a 1000x scale mismatch.`,
          expectedValue: statutory.value,
          actualValue: supplementary.value,
          context: {
            metricKey,
            statutoryPage: statutory.sourcePage,
            supplementaryPage: supplementary.sourcePage,
          },
        });
      } else {
        issues.push({
          severity: "ERROR",
          ruleCode: "DUPLICATE_SECTION_MISMATCH",
          message: `Statutory and supplementary values disagree materially for ${metricKey}.`,
          expectedValue: statutory.value,
          actualValue: supplementary.value,
          context: {
            metricKey,
            statutoryPage: statutory.sourcePage,
            supplementaryPage: supplementary.sourcePage,
          },
        });
      }
    }

    const primaryFaceValue = statutory?.value ?? supplementary?.value ?? null;
    if (primaryFaceValue === null) {
      continue;
    }

    for (const noteFact of noteFacts) {
      stats.noteComparisons += 1;
      if (approxEqual(primaryFaceValue, noteFact.value)) {
        stats.noteMatches += 1;
        continue;
      }

      issues.push({
        severity: "WARNING",
        ruleCode: "NOTE_TO_STATEMENT_MISMATCH",
        message: `Note-derived value disagrees with face statement for ${metricKey}.`,
        expectedValue: primaryFaceValue,
        actualValue: noteFact.value,
        context: {
          metricKey,
          facePage: statutory?.sourcePage ?? supplementary?.sourcePage ?? null,
          notePage: noteFact.sourcePage,
          noteReference: noteFact.noteReference,
        },
      });
    }
  }
}

export function validateCanonicalFacts(candidates: CanonicalFactCandidate[]) {
  const facts = chooseCanonicalFacts(candidates);
  const issues: ValidationIssueDraft[] = [];
  const stats = {
    duplicateComparisons: 0,
    duplicateMatches: 0,
    noteComparisons: 0,
    noteMatches: 0,
  };

  const totalOperatingIncome = getValue(facts, "total_operating_income");
  const totalOperatingExpenses = getValue(facts, "total_operating_expenses");
  const operatingProfit = getValue(facts, "operating_profit");
  if (
    totalOperatingIncome !== null &&
    totalOperatingExpenses !== null &&
    operatingProfit !== null &&
    !approxEqual(operatingProfit, totalOperatingIncome - totalOperatingExpenses)
  ) {
    issues.push({
      severity: "ERROR",
      ruleCode: "IS_OPERATING_PROFIT_MATCH",
      message: "Operating profit does not reconcile to total operating income minus total operating expenses.",
      expectedValue: totalOperatingIncome - totalOperatingExpenses,
      actualValue: operatingProfit,
    });
  }

  const financialIncome = getValue(facts, "financial_income");
  const financialExpense = getValue(facts, "financial_expense");
  const netFinancialItems = getValue(facts, "net_financial_items");
  if (
    financialIncome !== null &&
    financialExpense !== null &&
    netFinancialItems !== null &&
    !approxEqual(netFinancialItems, financialIncome - financialExpense)
  ) {
    issues.push({
      severity: "WARNING",
      ruleCode: "IS_NET_FINANCIAL_ITEMS_MATCH",
      message: "Net financial items do not reconcile to financial income minus financial expense.",
      expectedValue: financialIncome - financialExpense,
      actualValue: netFinancialItems,
    });
  }

  const profitBeforeTax = getValue(facts, "profit_before_tax");
  if (
    operatingProfit !== null &&
    netFinancialItems !== null &&
    profitBeforeTax !== null &&
    !approxEqual(profitBeforeTax, operatingProfit + netFinancialItems)
  ) {
    issues.push({
      severity: "ERROR",
      ruleCode: "IS_PROFIT_BEFORE_TAX_MATCH",
      message: "Profit before tax does not reconcile to operating profit plus net financial items.",
      expectedValue: operatingProfit + netFinancialItems,
      actualValue: profitBeforeTax,
    });
  }

  const taxExpense = getValue(facts, "tax_expense");
  const netIncome = getValue(facts, "net_income");
  if (
    profitBeforeTax !== null &&
    taxExpense !== null &&
    netIncome !== null &&
    !approxEqual(netIncome, profitBeforeTax - taxExpense)
  ) {
    issues.push({
      severity: "ERROR",
      ruleCode: "IS_NET_INCOME_MATCH",
      message: "Net income does not reconcile to profit before tax minus tax expense.",
      expectedValue: profitBeforeTax - taxExpense,
      actualValue: netIncome,
    });
  }

  const totalAssets = getValue(facts, "total_assets");
  const totalEquityAndLiabilities = getValue(facts, "total_equity_and_liabilities");
  if (
    totalAssets !== null &&
    totalEquityAndLiabilities !== null &&
    !approxEqual(totalAssets, totalEquityAndLiabilities)
  ) {
    issues.push({
      severity: "ERROR",
      ruleCode: "BS_TOTAL_BALANCES",
      message: "Total assets do not match total equity and liabilities.",
      expectedValue: totalAssets,
      actualValue: totalEquityAndLiabilities,
    });
  }

  const longTermLiabilities = getValue(facts, "long_term_liabilities");
  const currentLiabilities = getValue(facts, "current_liabilities");
  const totalLiabilities = getValue(facts, "total_liabilities");
  if (
    longTermLiabilities !== null &&
    currentLiabilities !== null &&
    totalLiabilities !== null &&
    !approxEqual(totalLiabilities, longTermLiabilities + currentLiabilities)
  ) {
    issues.push({
      severity: "ERROR",
      ruleCode: "BS_TOTAL_LIABILITIES_COMPONENTS",
      message: "Total liabilities do not reconcile to long-term plus current liabilities.",
      expectedValue: longTermLiabilities + currentLiabilities,
      actualValue: totalLiabilities,
    });
  }

  const totalEquity = getValue(facts, "total_equity");
  if (
    totalEquity !== null &&
    totalLiabilities !== null &&
    totalEquityAndLiabilities !== null &&
    !approxEqual(totalEquityAndLiabilities, totalEquity + totalLiabilities)
  ) {
    issues.push({
      severity: "ERROR",
      ruleCode: "BS_EQUITY_LIABILITIES_MATCH",
      message: "Total equity and liabilities do not reconcile to total equity plus total liabilities.",
      expectedValue: totalEquity + totalLiabilities,
      actualValue: totalEquityAndLiabilities,
    });
  }

  compareFactFamilies(issues, candidates, stats);

  const blockingErrors = issues.filter((issue) => issue.severity === "ERROR");
  const warningCount = issues.filter((issue) => issue.severity === "WARNING").length;
  const duplicateSupport =
    stats.duplicateComparisons > 0 ? stats.duplicateMatches / stats.duplicateComparisons : 0;
  const noteSupport = stats.noteComparisons > 0 ? stats.noteMatches / stats.noteComparisons : 0;
  const validationScore = Math.max(
    0,
    Math.min(
      1,
      1 -
        blockingErrors.length * 0.18 -
        warningCount * 0.04 +
        duplicateSupport * 0.08 +
        noteSupport * 0.03,
    ),
  );

  return {
    selectedFacts: facts,
    issues,
    validationScore: Number(validationScore.toFixed(4)),
    hasBlockingErrors: blockingErrors.length > 0,
    stats,
  };
}
