import { chooseCanonicalFacts } from "@/integrations/brreg/annual-report-financials/canonical-mapping";
import { CanonicalFactCandidate, ValidationIssueDraft } from "@/integrations/brreg/annual-report-financials/types";

// ─────────────────────────────────────────────────────────────────────────
// Non-deterministic, graded constraint tolerance
//
// Accounting identities — the balance balances, subtotals sum, profit flows
// through — almost never hold to the last krone. Every figure on a statement
// is independently rounded when it is printed: a statement "in thousands"
// rounds each figure to the nearest 1 000 (±500 NOK of slack per figure);
// one in whole kroner carries ±0.5.
//
// The acceptable slack is therefore not a fixed constant. It is derived from
// the display granularity of the figures involved and from how many
// independently-rounded figures the identity references. Because the
// rounding errors are independent, the expected accumulated error across k
// operands grows like √k (a random walk), not linearly — so the band is
// statistical, not a linear worst case.
//
// And the check is graded, not a cliff. A discrepancy inside the band is
// almost certainly rounding (no issue). A few × the band is suspicious
// (warning, with a penalty that scales continuously with how far out it is).
// Far beyond the band is an extraction error or a gross inconsistency
// (error). There is no single threshold where one extra krone flips it.
//
// Note: a discrepancy this layer cannot explain is not necessarily *our*
// fault — a filed statement can itself be internally inconsistent. Telling
// an extraction error apart from a genuine error in the source needs an
// independent second extraction to compare against; that discrimination
// belongs where dual-run results are reconciled, not here. This layer
// reports the discrepancy faithfully and grades how surprising it is.
// ─────────────────────────────────────────────────────────────────────────

// Widens the √k statistical band. The rounding error has a standard
// deviation of ≈ 0.29·g·√k, so g·√k alone is already ~3.5σ; the extra
// margin absorbs imperfect unit-scale detection and the odd intermediate
// rounding in the original bookkeeping.
const ROUNDING_BAND_SAFETY = 1.5;

// A discrepancy beyond this multiple of the rounding band is no longer
// plausibly rounding — it is treated as a hard error rather than a graded
// warning.
const CONSTRAINT_HARD_ERROR_MULTIPLE = 8;

type ConstraintStatus = "consistent" | "soft" | "hard";

type ConstraintCheck = {
  status: ConstraintStatus;
  discrepancy: number;
  band: number;
  /** discrepancy / band; ≤ 1 means within the rounding band. */
  ratio: number;
};

/**
 * The rounding band for one accounting identity: the discrepancy below which
 * the identity is almost certainly only off by bookkeeping rounding.
 */
function roundingBand(operands: CanonicalFactCandidate[]): number {
  const k = Math.max(operands.length, 2);
  // The coarsest-rounded operand dominates the accumulated error.
  const granularity = Math.max(1, ...operands.map((fact) => fact.unitScale ?? 1));
  // ±0.5·g of rounding per figure; expected accumulated error ≈ g·√k.
  return granularity * Math.sqrt(k) * ROUNDING_BAND_SAFETY;
}

function checkConstraint(
  expected: number,
  actual: number,
  operands: CanonicalFactCandidate[],
): ConstraintCheck {
  const discrepancy = Math.abs(expected - actual);
  const band = roundingBand(operands);
  const ratio = band > 0 ? discrepancy / band : discrepancy === 0 ? 0 : Infinity;
  const status: ConstraintStatus =
    ratio <= 1 ? "consistent" : ratio >= CONSTRAINT_HARD_ERROR_MULTIPLE ? "hard" : "soft";
  return { status, discrepancy, band, ratio };
}

/**
 * The continuous penalty a single constraint contributes to the validation
 * score: zero when consistent, a small amount just past the band, growing
 * to a full error-sized penalty in the hard zone.
 */
function constraintPenalty(check: ConstraintCheck): number {
  if (check.status === "consistent") return 0;
  if (check.status === "hard") return 0.18;
  const progress = (check.ratio - 1) / (CONSTRAINT_HARD_ERROR_MULTIPLE - 1);
  return 0.02 + progress * 0.1;
}

function constraintContext(check: ConstraintCheck): Record<string, unknown> {
  return {
    discrepancy: Math.round(check.discrepancy),
    roundingBand: Math.round(check.band),
    bandRatio: Number(check.ratio.toFixed(2)),
  };
}

function getFact(facts: Map<string, CanonicalFactCandidate>, metricKey: string) {
  return facts.get(metricKey) ?? null;
}

function looksLikeScaleMismatch(
  left: CanonicalFactCandidate,
  right: CanonicalFactCandidate,
) {
  // Is one value ≈ 1000× the other — i.e. one side simply was not scaled?
  return (
    checkConstraint(left.value, right.value * 1000, [left, right]).status === "consistent" ||
    checkConstraint(left.value * 1000, right.value, [left, right]).status === "consistent"
  );
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
  constraintChecks: ConstraintCheck[],
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
      const check = checkConstraint(statutory.value, supplementary.value, [
        statutory,
        supplementary,
      ]);
      constraintChecks.push(check);

      if (check.status === "consistent") {
        stats.duplicateMatches += 1;
      } else if (looksLikeScaleMismatch(statutory, supplementary)) {
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
            ...constraintContext(check),
          },
        });
      } else {
        issues.push({
          severity: check.status === "hard" ? "ERROR" : "WARNING",
          ruleCode: "DUPLICATE_SECTION_MISMATCH",
          message: `Statutory and supplementary values disagree for ${metricKey} beyond the rounding band.`,
          expectedValue: statutory.value,
          actualValue: supplementary.value,
          context: {
            metricKey,
            statutoryPage: statutory.sourcePage,
            supplementaryPage: supplementary.sourcePage,
            ...constraintContext(check),
          },
        });
      }
    }

    const primaryFaceFact = statutory ?? supplementary ?? null;
    if (!primaryFaceFact) {
      continue;
    }

    for (const noteFact of noteFacts) {
      stats.noteComparisons += 1;
      const check = checkConstraint(primaryFaceFact.value, noteFact.value, [
        primaryFaceFact,
        noteFact,
      ]);
      constraintChecks.push(check);

      if (check.status === "consistent") {
        stats.noteMatches += 1;
        continue;
      }

      // A note tie-out is advisory — it never hard-blocks on its own.
      issues.push({
        severity: "WARNING",
        ruleCode: "NOTE_TO_STATEMENT_MISMATCH",
        message: `Note-derived value disagrees with face statement for ${metricKey} beyond the rounding band.`,
        expectedValue: primaryFaceFact.value,
        actualValue: noteFact.value,
        context: {
          metricKey,
          facePage: primaryFaceFact.sourcePage,
          notePage: noteFact.sourcePage,
          noteReference: noteFact.noteReference,
          ...constraintContext(check),
        },
      });
    }
  }
}

export function validateCanonicalFacts(
  candidates: CanonicalFactCandidate[],
  scope?: CanonicalFactCandidate["statementScope"],
) {
  const facts = chooseCanonicalFacts(candidates, scope);
  const issues: ValidationIssueDraft[] = [];
  const stats = {
    duplicateComparisons: 0,
    duplicateMatches: 0,
    noteComparisons: 0,
    noteMatches: 0,
  };
  const constraintChecks: ConstraintCheck[] = [];

  /**
   * Runs one accounting-identity check and records a graded issue when the
   * discrepancy falls outside the rounding band. `maxSeverity` caps how
   * severe the issue can get — advisory identities never escalate past a
   * warning even when wildly off.
   */
  function runIdentity(input: {
    ruleCode: string;
    message: string;
    expected: number;
    actual: number;
    operands: CanonicalFactCandidate[];
    maxSeverity?: "WARNING" | "ERROR";
  }) {
    const check = checkConstraint(input.expected, input.actual, input.operands);
    constraintChecks.push(check);
    if (check.status === "consistent") {
      return;
    }
    const hardSeverity = input.maxSeverity ?? "ERROR";
    issues.push({
      severity: check.status === "hard" ? hardSeverity : "WARNING",
      ruleCode: input.ruleCode,
      message: input.message,
      expectedValue: input.expected,
      actualValue: input.actual,
      context: constraintContext(check),
    });
  }

  const totalOperatingIncome = getFact(facts, "total_operating_income");
  const totalOperatingExpenses = getFact(facts, "total_operating_expenses");
  const operatingProfit = getFact(facts, "operating_profit");
  if (totalOperatingIncome && totalOperatingExpenses && operatingProfit) {
    runIdentity({
      ruleCode: "IS_OPERATING_PROFIT_MATCH",
      message:
        "Operating profit does not reconcile to total operating income minus total operating expenses.",
      expected: totalOperatingIncome.value - totalOperatingExpenses.value,
      actual: operatingProfit.value,
      operands: [totalOperatingIncome, totalOperatingExpenses, operatingProfit],
    });
  }

  const financialIncome = getFact(facts, "financial_income");
  const financialExpense = getFact(facts, "financial_expense");
  const netFinancialItems = getFact(facts, "net_financial_items");
  if (financialIncome && financialExpense && netFinancialItems) {
    runIdentity({
      ruleCode: "IS_NET_FINANCIAL_ITEMS_MATCH",
      message:
        "Net financial items do not reconcile to financial income minus financial expense.",
      expected: financialIncome.value - financialExpense.value,
      actual: netFinancialItems.value,
      operands: [financialIncome, financialExpense, netFinancialItems],
      // Financial-items reconciliation is advisory — never a blocking error.
      maxSeverity: "WARNING",
    });
  }

  const profitBeforeTax = getFact(facts, "profit_before_tax");
  if (operatingProfit && netFinancialItems && profitBeforeTax) {
    runIdentity({
      ruleCode: "IS_PROFIT_BEFORE_TAX_MATCH",
      message:
        "Profit before tax does not reconcile to operating profit plus net financial items.",
      expected: operatingProfit.value + netFinancialItems.value,
      actual: profitBeforeTax.value,
      operands: [operatingProfit, netFinancialItems, profitBeforeTax],
    });
  }

  const taxExpense = getFact(facts, "tax_expense");
  const netIncome = getFact(facts, "net_income");
  if (profitBeforeTax && taxExpense && netIncome) {
    runIdentity({
      ruleCode: "IS_NET_INCOME_MATCH",
      message: "Net income does not reconcile to profit before tax minus tax expense.",
      expected: profitBeforeTax.value - taxExpense.value,
      actual: netIncome.value,
      operands: [profitBeforeTax, taxExpense, netIncome],
    });
  }

  const totalAssets = getFact(facts, "total_assets");
  const totalEquityAndLiabilities = getFact(facts, "total_equity_and_liabilities");
  if (totalAssets && totalEquityAndLiabilities) {
    runIdentity({
      ruleCode: "BS_TOTAL_BALANCES",
      message: "Total assets do not match total equity and liabilities.",
      expected: totalAssets.value,
      actual: totalEquityAndLiabilities.value,
      operands: [totalAssets, totalEquityAndLiabilities],
    });
  }

  const longTermLiabilities = getFact(facts, "long_term_liabilities");
  const currentLiabilities = getFact(facts, "current_liabilities");
  const totalLiabilities = getFact(facts, "total_liabilities");
  if (longTermLiabilities && currentLiabilities && totalLiabilities) {
    runIdentity({
      ruleCode: "BS_TOTAL_LIABILITIES_COMPONENTS",
      message: "Total liabilities do not reconcile to long-term plus current liabilities.",
      expected: longTermLiabilities.value + currentLiabilities.value,
      actual: totalLiabilities.value,
      operands: [longTermLiabilities, currentLiabilities, totalLiabilities],
    });
  }

  const totalEquity = getFact(facts, "total_equity");
  if (totalEquity && totalLiabilities && totalEquityAndLiabilities) {
    runIdentity({
      ruleCode: "BS_EQUITY_LIABILITIES_MATCH",
      message:
        "Total equity and liabilities do not reconcile to total equity plus total liabilities.",
      expected: totalEquity.value + totalLiabilities.value,
      actual: totalEquityAndLiabilities.value,
      operands: [totalEquity, totalLiabilities, totalEquityAndLiabilities],
    });
  }

  compareFactFamilies(issues, candidates, stats, constraintChecks);

  const blockingErrors = issues.filter((issue) => issue.severity === "ERROR");
  const duplicateSupport =
    stats.duplicateComparisons > 0 ? stats.duplicateMatches / stats.duplicateComparisons : 0;
  const noteSupport = stats.noteComparisons > 0 ? stats.noteMatches / stats.noteComparisons : 0;
  // Each constraint contributes a continuous penalty sized by how far past
  // the rounding band it landed — a graded loss, not a count of failures.
  const constraintPenaltyTotal = constraintChecks.reduce(
    (sum, check) => sum + constraintPenalty(check),
    0,
  );
  const validationScore = Math.max(
    0,
    Math.min(
      1,
      1 - constraintPenaltyTotal + duplicateSupport * 0.08 + noteSupport * 0.03,
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
