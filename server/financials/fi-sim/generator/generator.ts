import {
  FI_SIM_TAXONOMY_VERSION,
  findConcept,
  requireConcept,
  type StatementFamily,
} from "../catalog/concepts";
import { calculationFor, type CalculationOperand } from "../catalog/calculations";
import {
  FI_SIM_PROFILES,
  permittedConcepts,
  type FiSimProfileKey,
} from "../catalog/profiles";
import {
  FI_SIM_PROFILE_RULESET_VERSION,
  selectSimulationProfile,
  type CompanyProfileSignals,
} from "../catalog/profile-selection";
import {
  FI_SIM_ASSUMPTIONS,
  FI_SIM_ASSUMPTION_VERSION,
  type Band,
  type FiSimProfileAssumptions,
} from "./assumptions";
import {
  absolute as absoluteValue,
  distribute,
  fromNumber,
  fromRate,
  identityTolerances,
} from "./amounts";
import {
  FiSimGenerationError,
  toGenerationFailure,
  type FiSimErrorCode,
  type FiSimGenerationFailure,
} from "./errors";
import {
  anchorDigest,
  companySeed,
  createValueStream,
  fiscalYearSeed,
  type FiSimValueStream,
} from "./seed";

/**
 * The FI-SIM generator, from spec section 9.
 *
 * The whole module is pure: it takes company metadata and a frozen set of reported anchors, and
 * returns statement packages. Nothing here touches the database, the clock or the environment,
 * which is what makes "same input, byte-identical output" a property a test can actually hold it
 * to rather than a claim in a document.
 *
 * Two rules shape every line below. Reported anchors are hard constraints — the generator solves
 * around them and never scales, reclassifies or overwrites one. And a difference it cannot solve
 * becomes a visible residual line or a controlled error, never an adjustment quietly folded into a
 * plausible operating cost.
 */

export const FI_SIM_GENERATOR_VERSION = "fi-sim-generator-2026.1";

/** The most completed fiscal years one company may be given, from spec section 7. */
export const FI_SIM_MAX_FISCAL_YEARS = 5;

export const FI_SIM_DERIVATION_RULES = {
  operatingIncome: "income.operating-income-total.assumed",
  operatingIncomeChild: "income.operating-income.distributed",
  operatingResult: "income.operating-result.assumed-margin",
  operatingExpenseTotal: "income.operating-expense-total.identity",
  operatingExpenseChild: "income.operating-expense.distributed",
  financialItem: "income.financial-item.assumed-rate",
  financialItemBalancing: "income.financial-item.identity-balanced",
  netFinancialResult: "income.net-financial-result.identity",
  profitBeforeTax: "income.profit-before-tax.identity",
  taxExpense: "income.tax-expense.assumed-rate",
  profitForPeriod: "income.profit-for-period.identity",
  assets: "balance.assets-total.assumed-turnover",
  assetSubtotal: "balance.asset-subtotal.assumed-share",
  assetChild: "balance.asset.distributed",
  shareCapital: "balance.share-capital.assumed",
  paidInPremium: "balance.paid-in-premium.assumed",
  accumulatedResults: "balance.accumulated-results.multi-year-bridge",
  equityTotal: "balance.equity-total.identity",
  liabilitiesTotal: "balance.liabilities-total.identity",
  liabilitySubtotal: "balance.liability-subtotal.assumed-share",
  liabilityChild: "balance.liability.distributed",
  equityAndLiabilities: "balance.equity-and-liabilities-total.identity",
  /**
   * A line the profile would not have chosen, carrying a subtotal that follows from reported
   * figures. Its own rule id, so the validator can tell it apart from a line the generator simply
   * invented outside the profile — which would be a bug.
   */
  reportedStructureFallback: "structure.child.reported-subtotal-fallback",
  /**
   * A synthetic line carrying a figure the company actually reported at statement level.
   *
   * The schema binds an anchor to a `FinancialLineItem`, so a reported statement with headline
   * figures and no line items — the normal shape of anything ingested from an annual report — has
   * nothing to anchor to. The value is still the reported one, and it is still marked synthetic,
   * because provenance is about where a number came from and this one was not resolved through a
   * reported line. Its own rule id says which of the two it is.
   */
  reportedHeadline: "calibration.reported-headline",
  /** A figure grown from the nearest year the company has reported figures for. */
  calibratedScale: "calibration.nearest-reported-year",
  residual: "residual.identity-difference",
} as const;

export type FiSimAnchor = {
  /** The FI-SIM concept the reported line stands in for. */
  conceptKey: string;
  /** The reported `FinancialLineItem` this line references. Never copied into a value. */
  reportedFinancialLineItemId: string;
  value: bigint;
  currency: string;
  unitScale: number;
};

export type FiSimCompanyInput = {
  companyId: string;
  orgNumber: string;
  /** Registration date from the register. Null means the founding date is unknown. */
  registeredAt: Date | null;
  /**
   * Fiscal years the company actually filed accounts for. A filed statement is evidence the
   * company existed that year, which is the only evidence available for the companies the
   * register mirror has no row for.
   */
  reportedFiscalYears?: readonly number[];
  signals: CompanyProfileSignals;
  /**
   * A profile the operator classified by hand in the dataset manifest. It replaces the industry
   * rule and is recorded with its own rule id, so a hand-classified statement still says why it
   * looks the way it does. Without it the profile comes from the catalog's deterministic rules.
   */
  profileOverride?: FiSimProfileKey;
  /** Completed fiscal years to attempt, in any order. */
  fiscalYears: readonly number[];
  /** The newest fiscal year that has closed. No period may fall after it. */
  latestCompletedFiscalYear: number;
  statementScope: "COMPANY" | "CONSOLIDATED";
  currency: string;
  unitScale: number;
  anchorsByFiscalYear: Readonly<Record<number, readonly FiSimAnchor[]>>;
  /**
   * Reported headline figures per year, in whole units. They are not anchors — nothing in the
   * schema lets a line reference them — but they are the company's real size, and generating a
   * year without consulting them is how a group with 2,7 milliarder in reported revenue ends up
   * simulated at 27 millioner the year before.
   */
  reportedHeadlineByFiscalYear?: Readonly<Record<number, FiSimReportedHeadlineInput>>;
};

export type FiSimReportedHeadlineInput = {
  revenue: bigint | null;
  operatingProfit: bigint | null;
  netIncome: bigint | null;
  equity: bigint | null;
  assets: bigint | null;
};

export type FiSimGeneratedLine = {
  conceptKey: string;
  conceptQName: string;
  sourceLabel: string;
  presentationRole: string;
  sortOrder: number;
  reportedFinancialLineItemId: string | null;
  syntheticValue: bigint | null;
  derivationRuleId: string | null;
  /** The figure the identities are checked against: the anchor's value or the synthetic one. */
  resolvedValue: bigint;
};

export type FiSimGeneratedStatement = {
  statementFamily: StatementFamily;
  statementOrigin: "HYBRID" | "SIMULATED";
  lines: FiSimGeneratedLine[];
  /**
   * Every identity difference the solver could not remove without moving an anchor, at most one
   * per identity. They are published as at most two lines — one for rounding, one for the
   * differences big enough to need a human — while the validator checks them identity by identity.
   */
  residuals: FiSimResidual[];
};

export type FiSimResidual = {
  /** The parent concept of the failing calculation, or `BalanceEquation`. */
  identityId: string;
  conceptKey: string;
  amount: bigint;
  severity: "ROUNDING" | "REVIEW";
};

/**
 * Bridge metadata from spec section 9.4. It is generator bookkeeping, never a published cash-flow
 * or note disclosure, so it stays on the package and out of the line set.
 */
export type FiSimBridgeStep = {
  openingAccumulatedResults: bigint;
  profitForPeriod: bigint;
  assumedDistribution: bigint;
  explicitCapitalAdjustment: bigint;
  closingAccumulatedResults: bigint;
};

export type FiSimGeneratedPackage = {
  companyId: string;
  orgNumber: string;
  fiscalYear: number;
  statementScope: "COMPANY" | "CONSOLIDATED";
  profile: FiSimProfileKey;
  profileRuleId: string;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
  unitScale: number;
  seed: string;
  income: FiSimGeneratedStatement;
  balance: FiSimGeneratedStatement;
  validationStatus: "VALID" | "MANUAL_REVIEW";
  residualAmount: bigint | null;
  bridge: FiSimBridgeStep;
};

export type FiSimSkippedYear = {
  fiscalYear: number;
  reason: string;
};

export type FiSimCompanyGeneration = {
  companyId: string;
  orgNumber: string;
  statementScope: "COMPANY" | "CONSOLIDATED";
  profile: FiSimProfileKey | null;
  profileRuleId: string;
  profileRulesetVersion: string;
  taxonomyVersion: string;
  assumptionVersion: string;
  generatorVersion: string;
  seed: string;
  packages: FiSimGeneratedPackage[];
  skipped: FiSimSkippedYear[];
  failures: FiSimGenerationFailure[];
};

const RESIDUAL_CONCEPTS = new Set([
  "RoundingDifferenceIncome",
  "UnallocatedResidualIncome",
  "RoundingDifferenceBalance",
  "UnallocatedResidualBalance",
]);

function operandsOf(parentConceptKey: string): readonly CalculationOperand[] {
  const relationship = calculationFor(parentConceptKey);
  if (!relationship) {
    throw new Error(`FI-SIM catalog has no calculation for ${parentConceptKey}`);
  }
  return relationship.operands;
}

function childKeysOf(parentConceptKey: string) {
  return operandsOf(parentConceptKey).map((operand) => operand.conceptKey);
}

export function conceptQName(conceptKey: string) {
  // The database constrains this exact shape; the catalog's `fi-sim:` prefix form is for display.
  return `urn:fjord-insight:taxonomy:fi-sim:2026.1#${conceptKey}`;
}

function bandValue(stream: FiSimValueStream, label: string, band: Band) {
  return stream.between(label, band.min, band.max);
}

function periodFor(fiscalYear: number) {
  return {
    periodStart: new Date(Date.UTC(fiscalYear, 0, 1)),
    periodEnd: new Date(Date.UTC(fiscalYear, 11, 31)),
  };
}

type ResolvedValue = {
  value: bigint;
  anchor: FiSimAnchor | null;
  derivationRuleId: string | null;
};

class StatementSolution {
  readonly values = new Map<string, ResolvedValue>();
  readonly residuals: FiSimResidual[] = [];

  constructor(
    private readonly family: StatementFamily,
    private readonly unitScale: number,
    private readonly fiscalYear: number,
  ) {}

  set(conceptKey: string, value: bigint, derivationRuleId: string) {
    this.values.set(conceptKey, { value, anchor: null, derivationRuleId });
  }

  bind(conceptKey: string, anchor: FiSimAnchor) {
    this.values.set(conceptKey, { value: anchor.value, anchor, derivationRuleId: null });
  }

  /**
   * Records a difference the solver could not remove without moving an anchor.
   *
   * Several small ones on the same statement is ordinary: reported figures are rounded, and a
   * filing can be a krone out in two places at once. Several *material* ones is not, and the
   * second one is a controlled failure rather than a second balancing line — a demo that quietly
   * absorbs two contradictions between reported figures is a demo that has stopped meaning
   * anything.
   */
  recordResidual(params: {
    identityId: string;
    parentTotal: bigint;
    difference: bigint;
    code: FiSimErrorCode;
  }) {
    if (params.difference === 0n) return;
    const { rounding, review } = identityTolerances(params.parentTotal, this.unitScale);
    const magnitude = absoluteValue(params.difference);
    const income = this.family === "INCOME_STATEMENT";
    if (magnitude <= rounding) {
      this.residuals.push({
        identityId: params.identityId,
        conceptKey: income ? "RoundingDifferenceIncome" : "RoundingDifferenceBalance",
        amount: params.difference,
        severity: "ROUNDING",
      });
      return;
    }
    if (magnitude <= review) {
      const existingReview = this.residuals.find((residual) => residual.severity === "REVIEW");
      if (existingReview) {
        throw new FiSimGenerationError(
          "UNSOLVABLE_STATEMENT_IDENTITY",
          `More than one material identity difference on the same statement: ${existingReview.identityId} and ${params.identityId}`,
          this.fiscalYear,
        );
      }
      this.residuals.push({
        identityId: params.identityId,
        conceptKey: income ? "UnallocatedResidualIncome" : "UnallocatedResidualBalance",
        amount: params.difference,
        severity: "REVIEW",
      });
      return;
    }
    throw new FiSimGenerationError(
      params.code,
      `${params.identityId} is off by ${params.difference} against reported anchors, beyond the review tolerance of ${review}`,
      this.fiscalYear,
    );
  }
}

function selectActiveConcepts(params: {
  profileKey: FiSimProfileKey;
  family: StatementFamily;
  stream: FiSimValueStream;
  anchoredConcepts: ReadonlySet<string>;
  optionalConceptRate: number;
}) {
  const profile = FI_SIM_PROFILES[params.profileKey];
  const active = new Set<string>();
  const belongs = (conceptKey: string) =>
    findConcept(conceptKey)?.statementFamily === params.family;

  for (const conceptKey of profile.required) {
    if (belongs(conceptKey)) active.add(conceptKey);
  }
  for (const conceptKey of profile.optional) {
    if (!belongs(conceptKey) || RESIDUAL_CONCEPTS.has(conceptKey)) continue;
    if (params.stream.chance(`optional:${conceptKey}`, params.optionalConceptRate)) {
      active.add(conceptKey);
    }
  }
  // A reported anchor is published whatever the profile would have chosen. The profile decides
  // which lines are invented; it does not get to suppress a figure the company actually reported.
  for (const conceptKey of params.anchoredConcepts) {
    if (belongs(conceptKey)) active.add(conceptKey);
  }
  return active;
}

/**
 * Guarantees a non-zero subtotal has somewhere to sit.
 *
 * A profile decides what gets invented, not what gets shown. When a subtotal follows from reported
 * figures — a service company whose reported total debt exceeds its reported current debt has
 * long-term debt, whatever its profile expected — the line has to appear even though the profile
 * would never have chosen it. The generic "other" bucket is preferred for that case, because
 * putting a real amount on `Langsiktig bankgjeld` would assert a bank loan nobody reported.
 *
 * The pick is structural rather than seeded: which line appears when a company has debt at all is
 * not a coin toss, and a seeded pick would make two otherwise identical companies differ for no
 * reason.
 */
function ensureChildForTotal(params: {
  total: bigint;
  active: Set<string>;
  outsideProfile: Set<string>;
  parentConceptKey: string;
  profileKey: FiSimProfileKey;
  fiscalYear: number;
}) {
  if (params.total === 0n) return;
  const children = childKeysOf(params.parentConceptKey);
  if (children.some((conceptKey) => params.active.has(conceptKey))) return;

  const permitted = permittedConcepts(params.profileKey);
  const ordered = [...children].sort(
    (left, right) => requireConcept(left).sortOrder - requireConcept(right).sortOrder,
  );
  const candidate =
    ordered.find((conceptKey) => permitted.has(conceptKey)) ??
    ordered.find((conceptKey) => conceptKey.startsWith("Other")) ??
    ordered[0];
  if (!candidate) {
    throw new FiSimGenerationError(
      "UNSOLVABLE_STATEMENT_IDENTITY",
      `${params.parentConceptKey} is ${params.total} but the catalog has no child to carry it`,
      params.fiscalYear,
    );
  }
  params.active.add(candidate);
  if (!permitted.has(candidate)) params.outsideProfile.add(candidate);
}

function distributeChildren(params: {
  total: bigint;
  parentConceptKey: string;
  active: ReadonlySet<string>;
  anchors: ReadonlyMap<string, FiSimAnchor>;
  weights: Readonly<Record<string, number>>;
  solution: StatementSolution;
  derivationRuleId: string;
  outsideProfile?: ReadonlySet<string>;
}) {
  const children = childKeysOf(params.parentConceptKey).filter((conceptKey) =>
    params.active.has(conceptKey),
  );
  let fixed = 0n;
  const free: string[] = [];
  for (const conceptKey of children) {
    const anchor = params.anchors.get(conceptKey);
    if (anchor) {
      params.solution.bind(conceptKey, anchor);
      fixed += anchor.value;
      continue;
    }
    free.push(conceptKey);
  }

  const remaining = params.total - fixed;
  if (free.length === 0) return remaining;

  const distributed = distribute(
    remaining,
    free.map((conceptKey) => ({
      conceptKey,
      weight: params.weights[conceptKey] ?? 1,
    })),
  );
  for (const [conceptKey, value] of distributed) {
    params.solution.set(
      conceptKey,
      value,
      params.outsideProfile?.has(conceptKey)
        ? FI_SIM_DERIVATION_RULES.reportedStructureFallback
        : params.derivationRuleId,
    );
  }
  return 0n;
}

/** The nearest year the company reported figures for, used to keep an invented series continuous. */
export type FiSimScaleReference = {
  fiscalYear: number;
  revenue: bigint;
  assets: bigint | null;
};

function solveIncomeStatement(params: {
  fiscalYear: number;
  yearIndex: number;
  profileKey: FiSimProfileKey;
  assumptions: FiSimProfileAssumptions;
  companyStream: FiSimValueStream;
  yearStream: FiSimValueStream;
  anchors: ReadonlyMap<string, FiSimAnchor>;
  headline: FiSimReportedHeadlineInput | null;
  scaleReference: FiSimScaleReference | null;
  unitScale: number;
}) {
  const { assumptions, yearStream, anchors, fiscalYear } = params;
  const solution = new StatementSolution("INCOME_STATEMENT", params.unitScale, fiscalYear);
  const active = selectActiveConcepts({
    profileKey: params.profileKey,
    family: "INCOME_STATEMENT",
    stream: params.companyStream,
    anchoredConcepts: new Set(anchors.keys()),
    optionalConceptRate: assumptions.optionalConceptRate,
  });
  // Concepts published only because a reported subtotal needs somewhere to sit.
  const outsideProfile = new Set<string>();
  const anchorOf = (conceptKey: string) => anchors.get(conceptKey) ?? null;

  // 1. Operating income. The base is drawn once per company so the series has a shape, and each
  //    later year compounds a growth rate drawn for that year.
  const anchoredIncome = anchorOf("OperatingIncomeTotal");
  const headlineIncome = params.headline?.revenue ?? null;
  let operatingIncome: bigint;
  let operatingIncomeRule: string = FI_SIM_DERIVATION_RULES.operatingIncome;
  if (anchoredIncome) {
    operatingIncome = anchoredIncome.value;
  } else if (headlineIncome !== null) {
    // The company reported this figure. It could not be anchored because the statement has no
    // line items, but inventing a different number next to it would be worse than useless.
    operatingIncome = headlineIncome;
    operatingIncomeRule = FI_SIM_DERIVATION_RULES.reportedHeadline;
  } else {
    const growth = bandValue(
      yearStream,
      "operating-income-growth",
      assumptions.operatingIncomeGrowth,
    );
    if (params.scaleReference) {
      // Grow from the nearest year the company actually reported, so the series is continuous
      // instead of jumping two orders of magnitude between a reported year and its neighbour.
      operatingIncome = fromRate(
        params.scaleReference.revenue,
        Math.pow(1 + growth, params.fiscalYear - params.scaleReference.fiscalYear),
      );
      operatingIncomeRule = FI_SIM_DERIVATION_RULES.calibratedScale;
    } else {
      const base = bandValue(
        params.companyStream,
        "base-operating-income",
        assumptions.baseOperatingIncome,
      );
      operatingIncome = fromRate(fromNumber(base), Math.pow(1 + growth, params.yearIndex));
    }
  }

  // 2. Operating result, then the expense total that the identity forces.
  const anchoredResult = anchorOf("OperatingResult");
  const headlineResult = params.headline?.operatingProfit ?? null;
  let operatingResultRule: string = FI_SIM_DERIVATION_RULES.operatingResult;
  let operatingResult: bigint;
  if (anchoredResult) {
    operatingResult = anchoredResult.value;
  } else if (headlineResult !== null) {
    operatingResult = headlineResult;
    operatingResultRule = FI_SIM_DERIVATION_RULES.reportedHeadline;
  } else if (operatingIncome === 0n) {
    operatingResult = -fromNumber(
      bandValue(yearStream, "base-operating-expense", assumptions.baseOperatingExpense),
    );
  } else {
    operatingResult = fromRate(
      operatingIncome,
      bandValue(yearStream, "operating-margin", assumptions.operatingMargin),
    );
  }

  const anchoredExpense = anchorOf("OperatingExpenseTotal");
  let operatingExpense: bigint;
  if (anchoredExpense) {
    operatingExpense = anchoredExpense.value;
    if (anchoredResult) {
      solution.recordResidual({
        identityId: "OperatingResult",
        parentTotal: operatingResult,
        difference: operatingResult - (operatingIncome - operatingExpense),
        code: "CONTRADICTORY_REPORTED_ANCHORS",
      });
    } else {
      operatingResult = operatingIncome - operatingExpense;
    }
  } else {
    operatingExpense = operatingIncome - operatingResult;
  }

  // A reported `revenue` field is not always the whole operating income: a company with modest
  // sales and large other operating income reports a driftsresultat larger than its salgsinntekt,
  // and reading the first as `OperatingIncomeTotal` then implies negative costs. When that
  // happens the headline is simply the wrong figure for this concept, so it stops being used —
  // the operating result keeps its reported value and the income total is solved above it.
  if (operatingExpense < 0n && !anchoredIncome && !anchoredExpense) {
    operatingExpense = fromNumber(
      bandValue(yearStream, "base-operating-expense", assumptions.baseOperatingExpense),
    );
    operatingIncome = operatingResult + operatingExpense;
    operatingIncomeRule = FI_SIM_DERIVATION_RULES.operatingIncome;
  }
  if (operatingExpense < 0n) {
    throw new FiSimGenerationError(
      "UNSOLVABLE_STATEMENT_IDENTITY",
      `Operating expenses solve to ${operatingExpense}, which no statement can publish`,
      fiscalYear,
    );
  }

  // 3. Financial items. Their gross values are assumed, then the last active one absorbs the
  //    difference so the subtotal is exact. Absorbing inside the financial block is allowed:
  //    these are the lines the subtotal is defined over, not a plausible operating cost.
  const financialOperands = operandsOf("NetFinancialResult");
  const anchoredNetFinancial = anchorOf("NetFinancialResult");
  const financialBase = operatingIncome === 0n
    ? fromNumber(bandValue(yearStream, "financial-base", assumptions.baseOperatingExpense))
    : operatingIncome;
  const grossFinancial = new Map<string, bigint>();
  for (const operand of financialOperands) {
    if (!active.has(operand.conceptKey)) continue;
    const anchor = anchorOf(operand.conceptKey);
    if (anchor) {
      grossFinancial.set(operand.conceptKey, anchor.value);
      continue;
    }
    const rate = bandValue(
      yearStream,
      `financial-rate:${operand.conceptKey}`,
      operand.weight === 1 ? assumptions.financialIncomeRate : assumptions.financialExpenseRate,
    );
    grossFinancial.set(operand.conceptKey, fromRate(financialBase, rate));
  }
  const signedFinancialSum = () =>
    financialOperands.reduce(
      (sum, operand) => sum + BigInt(operand.weight) * (grossFinancial.get(operand.conceptKey) ?? 0n),
      0n,
    );

  let netFinancial = anchoredNetFinancial ? anchoredNetFinancial.value : signedFinancialSum();

  const anchoredProfitBeforeTax = anchorOf("ProfitBeforeTax");
  let profitBeforeTax: bigint;
  if (anchoredProfitBeforeTax) {
    profitBeforeTax = anchoredProfitBeforeTax.value;
    if (anchoredNetFinancial) {
      solution.recordResidual({
        identityId: "ProfitBeforeTax",
        parentTotal: profitBeforeTax,
        difference: profitBeforeTax - (operatingResult + netFinancial),
        code: "CONTRADICTORY_REPORTED_ANCHORS",
      });
    } else {
      netFinancial = profitBeforeTax - operatingResult;
    }
  } else {
    profitBeforeTax = operatingResult + netFinancial;
  }

  // 4. Tax and the result for the period.
  const anchoredTax = anchorOf("TaxExpense");
  const anchoredProfit = anchorOf("ProfitForPeriod");
  let taxExpense: bigint;
  let profitForPeriod: bigint;
  if (anchoredTax && anchoredProfit) {
    taxExpense = anchoredTax.value;
    profitForPeriod = anchoredProfit.value;
    solution.recordResidual({
      identityId: "ProfitForPeriod",
      parentTotal: profitForPeriod,
      difference: profitForPeriod - (profitBeforeTax - taxExpense),
      code: "CONTRADICTORY_REPORTED_ANCHORS",
    });
  } else if (anchoredTax) {
    taxExpense = anchoredTax.value;
    profitForPeriod = profitBeforeTax - taxExpense;
  } else if (anchoredProfit) {
    profitForPeriod = anchoredProfit.value;
    taxExpense = profitBeforeTax - profitForPeriod;
  } else if (params.headline?.netIncome != null) {
    // The reported result for the period settles the tax line, exactly as an anchored one would.
    profitForPeriod = params.headline.netIncome;
    taxExpense = profitBeforeTax - profitForPeriod;
  } else {
    taxExpense = profitBeforeTax > 0n ? fromRate(profitBeforeTax, assumptions.taxRate) : 0n;
    profitForPeriod = profitBeforeTax - taxExpense;
  }

  // 5. Write the totals, then the detail lines they are made of.
  const setTotal = (conceptKey: string, value: bigint, rule: string) => {
    const anchor = anchorOf(conceptKey);
    if (anchor) solution.bind(conceptKey, anchor);
    else solution.set(conceptKey, value, rule);
  };
  setTotal("OperatingIncomeTotal", operatingIncome, operatingIncomeRule);
  setTotal("OperatingExpenseTotal", operatingExpense, FI_SIM_DERIVATION_RULES.operatingExpenseTotal);
  setTotal("OperatingResult", operatingResult, operatingResultRule);
  setTotal("NetFinancialResult", netFinancial, FI_SIM_DERIVATION_RULES.netFinancialResult);
  setTotal("ProfitBeforeTax", profitBeforeTax, FI_SIM_DERIVATION_RULES.profitBeforeTax);
  setTotal("TaxExpense", taxExpense, FI_SIM_DERIVATION_RULES.taxExpense);
  setTotal("ProfitForPeriod", profitForPeriod, FI_SIM_DERIVATION_RULES.profitForPeriod);

  ensureChildForTotal({
    total: operatingExpense,
    active,
    outsideProfile,
    parentConceptKey: "OperatingExpenseTotal",
    profileKey: params.profileKey,
    fiscalYear,
  });
  ensureChildForTotal({
    total: operatingIncome,
    active,
    outsideProfile,
    parentConceptKey: "OperatingIncomeTotal",
    profileKey: params.profileKey,
    fiscalYear,
  });

  const unexplainedIncome = distributeChildren({
    total: operatingIncome,
    parentConceptKey: "OperatingIncomeTotal",
    active,
    anchors,
    weights: assumptions.incomeWeights,
    solution,
    outsideProfile,
    derivationRuleId: FI_SIM_DERIVATION_RULES.operatingIncomeChild,
  });
  solution.recordResidual({
    identityId: "OperatingIncomeTotal",
    parentTotal: operatingIncome,
    difference: unexplainedIncome,
    code: "CONTRADICTORY_REPORTED_ANCHORS",
  });

  const unexplainedExpense = distributeChildren({
    total: operatingExpense,
    parentConceptKey: "OperatingExpenseTotal",
    active,
    anchors,
    weights: assumptions.expenseWeights,
    solution,
    outsideProfile,
    derivationRuleId: FI_SIM_DERIVATION_RULES.operatingExpenseChild,
  });
  solution.recordResidual({
    identityId: "OperatingExpenseTotal",
    parentTotal: operatingExpense,
    difference: unexplainedExpense,
    code: "CONTRADICTORY_REPORTED_ANCHORS",
  });

  // Financial detail: make the block sum to the subtotal exactly.
  const activeFinancial = financialOperands.filter((operand) => active.has(operand.conceptKey));
  if (activeFinancial.length === 0 && netFinancial !== 0n) {
    const fallback = netFinancial > 0n ? "InterestIncome" : "InterestExpense";
    active.add(fallback);
    grossFinancial.set(fallback, 0n);
    activeFinancial.push(
      ...financialOperands.filter((operand) => operand.conceptKey === fallback),
    );
  }
  if (activeFinancial.length > 0) {
    // The line that absorbs the difference must be a synthetic one. Balancing onto an anchored
    // financial item would rewrite a reported figure, which is the one thing the generator may
    // never do — if every financial item is anchored the difference becomes a controlled error.
    const balancing = [...activeFinancial]
      .reverse()
      .find((operand) => !anchorOf(operand.conceptKey));
    if (balancing) {
      const difference = netFinancial - signedFinancialSum();
      grossFinancial.set(
        balancing.conceptKey,
        (grossFinancial.get(balancing.conceptKey) ?? 0n) + BigInt(balancing.weight) * difference,
      );
    }
    for (const operand of activeFinancial) {
      const anchor = anchorOf(operand.conceptKey);
      if (anchor) {
        solution.bind(operand.conceptKey, anchor);
        continue;
      }
      solution.set(
        operand.conceptKey,
        grossFinancial.get(operand.conceptKey) ?? 0n,
        operand.conceptKey === balancing?.conceptKey
          ? FI_SIM_DERIVATION_RULES.financialItemBalancing
          : FI_SIM_DERIVATION_RULES.financialItem,
      );
    }
    const remainder = netFinancial - signedFinancialSum();
    if (remainder !== 0n) {
      throw new FiSimGenerationError(
        "CONTRADICTORY_REPORTED_ANCHORS",
        `Financial items are anchored to a sum that contradicts NetFinancialResult by ${remainder}`,
        fiscalYear,
      );
    }
  }

  return { solution, profitForPeriod };
}

function solveBalanceSheet(params: {
  fiscalYear: number;
  profileKey: FiSimProfileKey;
  assumptions: FiSimProfileAssumptions;
  companyStream: FiSimValueStream;
  yearStream: FiSimValueStream;
  anchors: ReadonlyMap<string, FiSimAnchor>;
  headline: FiSimReportedHeadlineInput | null;
  scaleReference: FiSimScaleReference | null;
  unitScale: number;
  operatingIncome: bigint;
  profitForPeriod: bigint;
  openingAccumulatedResults: bigint | null;
}) {
  const { assumptions, yearStream, anchors, fiscalYear } = params;
  const solution = new StatementSolution("BALANCE_SHEET", params.unitScale, fiscalYear);
  const active = selectActiveConcepts({
    profileKey: params.profileKey,
    family: "BALANCE_SHEET",
    stream: params.companyStream,
    anchoredConcepts: new Set(anchors.keys()),
    optionalConceptRate: assumptions.optionalConceptRate,
  });
  // Concepts published only because a reported subtotal needs somewhere to sit.
  const outsideProfile = new Set<string>();
  const anchorOf = (conceptKey: string) => anchors.get(conceptKey) ?? null;

  // 1. Total assets.
  const anchoredAssets = anchorOf("AssetsTotal");
  const headlineAssets = params.headline?.assets ?? null;
  let assetsRule: string = FI_SIM_DERIVATION_RULES.assets;
  let assetsTotal: bigint;
  if (anchoredAssets) {
    assetsTotal = anchoredAssets.value;
  } else if (headlineAssets !== null) {
    assetsTotal = headlineAssets;
    assetsRule = FI_SIM_DERIVATION_RULES.reportedHeadline;
  } else if (params.scaleReference?.assets != null) {
    // The company's own reported balance sheet from a nearby year, scaled by how much activity
    // moved. An industry turnover ratio is a poor substitute whenever this exists, and a terrible
    // one for a parent company: Reach Subsea ASA carries 880 millioner in assets against 26
    // millioner of revenue, so sizing its balance sheet from turnover understates it a hundredfold.
    const reference = params.scaleReference;
    const referenceAssets = reference.assets as bigint;
    assetsTotal =
      reference.revenue > 0n && params.operatingIncome > 0n
        ? (referenceAssets * params.operatingIncome) / reference.revenue
        : referenceAssets;
    assetsRule = FI_SIM_DERIVATION_RULES.calibratedScale;
  } else if (params.operatingIncome !== 0n) {
    assetsTotal = fromRate(
      params.operatingIncome,
      1 / bandValue(yearStream, "asset-turnover", assumptions.assetTurnover),
    );
  } else {
    assetsTotal = fromNumber(bandValue(params.companyStream, "base-assets", assumptions.baseAssets));
  }

  // 2. Equity, through the multi-year bridge of spec section 9.4.
  const anchoredShareCapital = anchorOf("ShareCapital");
  const anchoredPremium = anchorOf("PaidInPremium");
  const anchoredAccumulated = anchorOf("AccumulatedResults");
  const anchoredEquity = anchorOf("EquityTotal");

  // Reported equity and reported accumulated results together determine the paid-in capital.
  // Inventing a share capital alongside them is what makes two perfectly consistent reported
  // figures look like they contradict each other — a company with accumulated losses larger than
  // its equity is ordinary, and its share capital is exactly the difference.
  // Reported equity settles the equity block whether it arrived as an anchor or as a headline
  // figure the schema had nothing to bind to. The only difference is which rule id the resulting
  // line carries.
  const targetEquity: { value: bigint; rule: string } | null = anchoredEquity
    ? { value: anchoredEquity.value, rule: FI_SIM_DERIVATION_RULES.equityTotal }
    : params.headline?.equity != null
      ? { value: params.headline.equity, rule: FI_SIM_DERIVATION_RULES.reportedHeadline }
      : null;

  let paidInPremium = anchoredPremium ? anchoredPremium.value : null;
  let shareCapital: bigint;
  if (anchoredShareCapital) {
    shareCapital = anchoredShareCapital.value;
  } else if (targetEquity && anchoredAccumulated) {
    const solved = targetEquity.value - (paidInPremium ?? 0n) - anchoredAccumulated.value;
    // A negative registered capital is not a thing. When the reported figures imply one, the
    // difference belongs on a residual line where a reader can see it.
    shareCapital = solved < 0n ? 0n : solved;
  } else {
    shareCapital = fromNumber(
      bandValue(params.companyStream, "share-capital", assumptions.shareCapital),
    );
    if (!anchoredPremium && active.has("PaidInPremium")) {
      paidInPremium = fromRate(
        shareCapital,
        params.companyStream.between("paid-in-premium", 0.2, 3),
      );
    }
  }
  if (paidInPremium !== null) active.add("PaidInPremium");

  const assumedDistribution = params.openingAccumulatedResults === null || params.profitForPeriod <= 0n
    ? 0n
    : fromRate(
        params.profitForPeriod,
        bandValue(yearStream, "distribution-rate", assumptions.distributionRate),
      );

  const openingAccumulated = params.openingAccumulatedResults;
  const bridgedAccumulated = openingAccumulated === null
    ? fromRate(
        assetsTotal,
        bandValue(params.companyStream, "opening-equity-ratio", assumptions.openingEquityRatio),
      ) -
      shareCapital -
      (paidInPremium ?? 0n)
    : openingAccumulated + params.profitForPeriod - assumedDistribution;

  let accumulatedResults = anchoredAccumulated ? anchoredAccumulated.value : bridgedAccumulated;
  let equityTotal = shareCapital + (paidInPremium ?? 0n) + accumulatedResults;

  if (targetEquity) {
    const difference = targetEquity.value - equityTotal;
    if (anchoredAccumulated) {
      solution.recordResidual({
        identityId: "EquityTotal",
        parentTotal: targetEquity.value,
        difference,
        code: "CONTRADICTORY_REPORTED_ANCHORS",
      });
    } else {
      // This is exactly what explicitCapitalAdjustment is for: reported equity is a hard
      // constraint, so the bridge absorbs the difference instead of the anchor being moved.
      accumulatedResults += difference;
    }
    equityTotal = targetEquity.value;
  }
  // Retained profits compound; an assumed asset turnover does not. Left alone, a fifth-year
  // company would need negative liabilities to balance. Whichever side is not a reported anchor
  // gives way, and if both are anchored the two reported figures genuinely contradict each other.
  //
  // Authority runs anchor > headline > assumption. An anchor is immutable; a headline is a
  // reported figure that could not be bound to a line and may be a few kroner out against
  // another reported field on the same statement — 888 787 in equity against 888 532 in assets is
  // a rounding artefact, not a contradiction worth throwing a company out of the demo for. So a
  // headline gives way to an anchor, and the difference becomes a residual a reader can see.
  if (equityTotal > assetsTotal) {
    const headroom = bandValue(yearStream, "liability-headroom", assumptions.liabilityHeadroom);
    const assetsAreAnchored = Boolean(anchoredAssets);
    const equityIsAnchored = Boolean(anchoredEquity) || Boolean(anchoredAccumulated);
    const assetsAreReported = assetsAreAnchored || headlineAssets !== null;
    if (!assetsAreReported) {
      assetsTotal = equityTotal + fromRate(absoluteValue(equityTotal), headroom);
    } else if (!targetEquity && !anchoredAccumulated) {
      const target = assetsTotal - fromRate(absoluteValue(assetsTotal), headroom);
      accumulatedResults += target - equityTotal;
      equityTotal = target;
    } else if (!assetsAreAnchored && equityIsAnchored) {
      // Anchored equity wins over a headline balance-sheet total. No residual: the soft side gave
      // way completely, so every identity still holds exactly. What changed is that the published
      // assets figure is no longer the reported headline, and its derivation rule says so.
      assetsTotal = equityTotal;
      assetsRule = FI_SIM_DERIVATION_RULES.assets;
    } else if (!equityIsAnchored) {
      // Both are headlines, or the assets are anchored: the equity side is the softer one.
      accumulatedResults += assetsTotal - equityTotal;
      equityTotal = assetsTotal;
    } else {
      throw new FiSimGenerationError(
        "CONTRADICTORY_REPORTED_ANCHORS",
        `Reported equity ${equityTotal} exceeds reported total assets ${assetsTotal}`,
        fiscalYear,
      );
    }
  }

  // Everything the bridge does not explain is, by definition, the explicit capital adjustment:
  // the opening balance in the first generated year, and an absorbed equity anchor after that.
  const explicitCapitalAdjustment =
    accumulatedResults -
    (openingAccumulated ?? 0n) -
    params.profitForPeriod +
    assumedDistribution;

  // 3. Liabilities follow from the balance equation.
  const anchoredLiabilities = anchorOf("LiabilitiesTotal");
  let liabilitiesTotal = assetsTotal - equityTotal;
  if (anchoredLiabilities) {
    solution.recordResidual({
      identityId: "BalanceEquation",
      parentTotal: assetsTotal,
      difference: assetsTotal - (equityTotal + anchoredLiabilities.value),
      code: "CONTRADICTORY_REPORTED_ANCHORS",
    });
    liabilitiesTotal = anchoredLiabilities.value;
  }
  if (liabilitiesTotal < 0n) {
    throw new FiSimGenerationError(
      "UNSOLVABLE_STATEMENT_IDENTITY",
      `Total liabilities solve to ${liabilitiesTotal}, which no statement can publish`,
      fiscalYear,
    );
  }

  // 4. Subtotals and their detail.
  const anchoredNoncurrent = anchorOf("NoncurrentAssetsTotal");
  const anchoredCurrentAssets = anchorOf("CurrentAssetsTotal");
  let noncurrentAssets = anchoredNoncurrent
    ? anchoredNoncurrent.value
    : fromRate(
        assetsTotal,
        bandValue(yearStream, "noncurrent-share", assumptions.noncurrentAssetShare),
      );
  let currentAssets = assetsTotal - noncurrentAssets;
  if (anchoredCurrentAssets) {
    if (anchoredNoncurrent) {
      solution.recordResidual({
        identityId: "AssetsTotal",
        parentTotal: assetsTotal,
        difference: assetsTotal - (anchoredNoncurrent.value + anchoredCurrentAssets.value),
        code: "CONTRADICTORY_REPORTED_ANCHORS",
      });
      currentAssets = anchoredCurrentAssets.value;
    } else {
      currentAssets = anchoredCurrentAssets.value;
      noncurrentAssets = assetsTotal - currentAssets;
    }
  }

  const anchoredLongTerm = anchorOf("LongTermLiabilitiesTotal");
  const anchoredCurrentLiabilities = anchorOf("CurrentLiabilitiesTotal");
  let longTermLiabilities = anchoredLongTerm
    ? anchoredLongTerm.value
    : fromRate(
        liabilitiesTotal,
        bandValue(yearStream, "long-term-share", assumptions.longTermLiabilityShare),
      );
  let currentLiabilities = liabilitiesTotal - longTermLiabilities;
  if (anchoredCurrentLiabilities) {
    if (anchoredLongTerm) {
      solution.recordResidual({
        identityId: "LiabilitiesTotal",
        parentTotal: liabilitiesTotal,
        difference:
          liabilitiesTotal - (anchoredLongTerm.value + anchoredCurrentLiabilities.value),
        code: "CONTRADICTORY_REPORTED_ANCHORS",
      });
      currentLiabilities = anchoredCurrentLiabilities.value;
    } else {
      currentLiabilities = anchoredCurrentLiabilities.value;
      longTermLiabilities = liabilitiesTotal - currentLiabilities;
    }
  }

  const setTotal = (conceptKey: string, value: bigint, rule: string) => {
    const anchor = anchorOf(conceptKey);
    if (anchor) solution.bind(conceptKey, anchor);
    else solution.set(conceptKey, value, rule);
  };
  setTotal("NoncurrentAssetsTotal", noncurrentAssets, FI_SIM_DERIVATION_RULES.assetSubtotal);
  setTotal("CurrentAssetsTotal", currentAssets, FI_SIM_DERIVATION_RULES.assetSubtotal);
  setTotal("AssetsTotal", assetsTotal, assetsRule);
  setTotal("ShareCapital", shareCapital, FI_SIM_DERIVATION_RULES.shareCapital);
  if (paidInPremium !== null) {
    setTotal("PaidInPremium", paidInPremium, FI_SIM_DERIVATION_RULES.paidInPremium);
  }
  setTotal("AccumulatedResults", accumulatedResults, FI_SIM_DERIVATION_RULES.accumulatedResults);
  setTotal("EquityTotal", equityTotal, FI_SIM_DERIVATION_RULES.equityTotal);
  setTotal(
    "LongTermLiabilitiesTotal",
    longTermLiabilities,
    FI_SIM_DERIVATION_RULES.liabilitySubtotal,
  );
  setTotal(
    "CurrentLiabilitiesTotal",
    currentLiabilities,
    FI_SIM_DERIVATION_RULES.liabilitySubtotal,
  );
  setTotal("LiabilitiesTotal", liabilitiesTotal, FI_SIM_DERIVATION_RULES.liabilitiesTotal);
  const anchoredEquityAndLiabilities = anchorOf("EquityAndLiabilitiesTotal");
  if (anchoredEquityAndLiabilities) {
    solution.recordResidual({
      identityId: "EquityAndLiabilitiesTotal",
      parentTotal: anchoredEquityAndLiabilities.value,
      difference: anchoredEquityAndLiabilities.value - (equityTotal + liabilitiesTotal),
      code: "CONTRADICTORY_REPORTED_ANCHORS",
    });
  }
  setTotal(
    "EquityAndLiabilitiesTotal",
    equityTotal + liabilitiesTotal,
    FI_SIM_DERIVATION_RULES.equityAndLiabilities,
  );

  for (const [parentConceptKey, total, weights, rule] of [
    ["NoncurrentAssetsTotal", noncurrentAssets, assumptions.assetWeights, FI_SIM_DERIVATION_RULES.assetChild],
    ["CurrentAssetsTotal", currentAssets, assumptions.assetWeights, FI_SIM_DERIVATION_RULES.assetChild],
    ["LongTermLiabilitiesTotal", longTermLiabilities, assumptions.liabilityWeights, FI_SIM_DERIVATION_RULES.liabilityChild],
    ["CurrentLiabilitiesTotal", currentLiabilities, assumptions.liabilityWeights, FI_SIM_DERIVATION_RULES.liabilityChild],
  ] as const) {
    ensureChildForTotal({
      total,
      active,
      outsideProfile,
      parentConceptKey,
      profileKey: params.profileKey,
      fiscalYear,
    });
    const unexplained = distributeChildren({
      total,
      parentConceptKey,
      active,
      anchors,
      weights,
      solution,
      outsideProfile,
      derivationRuleId: rule,
    });
    solution.recordResidual({
      identityId: parentConceptKey,
      parentTotal: total,
      difference: unexplained,
      code: "CONTRADICTORY_REPORTED_ANCHORS",
    });
  }

  const bridge: FiSimBridgeStep = {
    openingAccumulatedResults: openingAccumulated ?? 0n,
    profitForPeriod: params.profitForPeriod,
    assumedDistribution,
    explicitCapitalAdjustment,
    closingAccumulatedResults: accumulatedResults,
  };

  return { solution, bridge, closingAccumulatedResults: accumulatedResults };
}

function toStatement(
  family: StatementFamily,
  solution: StatementSolution,
  fiscalYear: number,
): FiSimGeneratedStatement {
  const values = new Map(solution.values);
  // One published line per residual concept, carrying the sum of the differences of that kind.
  // The validator keeps checking identity by identity from `residuals`, so aggregating for
  // display does not aggregate away the check.
  for (const residual of solution.residuals) {
    const existing = values.get(residual.conceptKey);
    values.set(residual.conceptKey, {
      value: (existing?.value ?? 0n) + residual.amount,
      anchor: null,
      derivationRuleId: FI_SIM_DERIVATION_RULES.residual,
    });
  }

  const lines = [...values.entries()]
    .map(([conceptKey, resolved]) => {
      const concept = requireConcept(conceptKey);
      return {
        conceptKey,
        conceptQName: conceptQName(conceptKey),
        sourceLabel: concept.sourceLabel,
        presentationRole: concept.presentationRole,
        sortOrder: concept.sortOrder,
        reportedFinancialLineItemId: resolved.anchor?.reportedFinancialLineItemId ?? null,
        syntheticValue: resolved.anchor ? null : resolved.value,
        derivationRuleId: resolved.anchor ? null : resolved.derivationRuleId,
        resolvedValue: resolved.value,
      };
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);

  const hasReported = lines.some((line) => line.reportedFinancialLineItemId !== null);
  const hasSynthetic = lines.some((line) => line.syntheticValue !== null);
  if (!hasSynthetic) {
    throw new FiSimGenerationError(
      "UNSOLVABLE_STATEMENT_IDENTITY",
      "A statement with no synthetic line is a reported statement and must not be simulated",
      fiscalYear,
    );
  }

  return {
    statementFamily: family,
    statementOrigin: hasReported ? "HYBRID" : "SIMULATED",
    lines,
    residuals: solution.residuals,
  };
}

function assertUnitsAndCurrency(input: FiSimCompanyInput, anchors: readonly FiSimAnchor[]) {
  if (!/^[A-Z]{3}$/.test(input.currency) || input.unitScale < 1) {
    throw new FiSimGenerationError(
      "INVALID_UNIT_OR_CURRENCY",
      `Currency ${input.currency} and unit scale ${input.unitScale} cannot be published`,
    );
  }
  for (const anchor of anchors) {
    if (anchor.currency !== input.currency || anchor.unitScale !== input.unitScale) {
      throw new FiSimGenerationError(
        "INVALID_UNIT_OR_CURRENCY",
        `Anchor ${anchor.conceptKey} is ${anchor.currency}/${anchor.unitScale}, the statement is ${input.currency}/${input.unitScale}`,
      );
    }
    if (!anchor.reportedFinancialLineItemId) {
      throw new FiSimGenerationError(
        "MISSING_REPORTED_ANCHOR_REFERENCE",
        `Anchor ${anchor.conceptKey} has no reported line to reference`,
      );
    }
    if (!findConcept(anchor.conceptKey)) {
      throw new FiSimGenerationError(
        "MISSING_REPORTED_ANCHOR_REFERENCE",
        `Anchor ${anchor.conceptKey} is not a concept in ${FI_SIM_TAXONOMY_VERSION}`,
      );
    }
  }
}

export function generateCompanyFinancials(
  input: FiSimCompanyInput,
): FiSimCompanyGeneration {
  const allAnchors = Object.entries(input.anchorsByFiscalYear).flatMap(([fiscalYear, anchors]) =>
    anchors.map((anchor) => ({ ...anchor, fiscalYear: Number(fiscalYear) })),
  );
  const digest = anchorDigest(allAnchors);
  const versions = {
    taxonomyVersion: FI_SIM_TAXONOMY_VERSION,
    profileVersion: FI_SIM_PROFILE_RULESET_VERSION,
    assumptionVersion: FI_SIM_ASSUMPTION_VERSION,
    generatorVersion: FI_SIM_GENERATOR_VERSION,
  };
  const seed = companySeed({
    orgNumber: input.orgNumber,
    statementScope: input.statementScope,
    versions,
    anchorDigest: digest,
  });
  const base = {
    companyId: input.companyId,
    orgNumber: input.orgNumber,
    statementScope: input.statementScope,
    profileRulesetVersion: FI_SIM_PROFILE_RULESET_VERSION,
    taxonomyVersion: FI_SIM_TAXONOMY_VERSION,
    assumptionVersion: FI_SIM_ASSUMPTION_VERSION,
    generatorVersion: FI_SIM_GENERATOR_VERSION,
    seed,
  };

  const selection = input.profileOverride
    ? ({
        supported: true,
        profile: input.profileOverride,
        ruleId: "manifest.explicit",
        rulesetVersion: FI_SIM_PROFILE_RULESET_VERSION,
      } as const)
    : selectSimulationProfile(input.signals);
  if (!selection.supported) {
    return {
      ...base,
      profile: null,
      profileRuleId: selection.ruleId,
      packages: [],
      skipped: [],
      failures: [
        { fiscalYear: null, code: selection.errorCode, message: selection.reason },
      ],
    };
  }

  const failures: FiSimGenerationFailure[] = [];
  const skipped: FiSimSkippedYear[] = [];
  const packages: FiSimGeneratedPackage[] = [];
  const shell = { ...base, profile: selection.profile, profileRuleId: selection.ruleId };

  try {
    assertUnitsAndCurrency(input, allAnchors);
    if (input.fiscalYears.length > FI_SIM_MAX_FISCAL_YEARS) {
      throw new FiSimGenerationError(
        "INVALID_PERIOD",
        `${input.fiscalYears.length} fiscal years requested, at most ${FI_SIM_MAX_FISCAL_YEARS} may be generated`,
      );
    }
    if (input.registeredAt === null && (input.reportedFiscalYears ?? []).length === 0) {
      throw new FiSimGenerationError(
        "INVALID_PERIOD",
        "The company has neither a registration date nor a filed statement, so no period can be proved to fall after it was founded",
      );
    }
  } catch (error) {
    return { ...shell, packages, skipped, failures: [toGenerationFailure(error)] };
  }

  const assumptions = FI_SIM_ASSUMPTIONS[selection.profile];
  const companyStream = createValueStream(seed);
  const orderedYears = [...new Set(input.fiscalYears)].sort((left, right) => left - right);
  const headlines = input.reportedHeadlineByFiscalYear ?? {};
  const headlineFor = (fiscalYear: number) => headlines[fiscalYear] ?? null;

  /**
   * The nearest year with a reported revenue, for sizing a year that has none.
   *
   * Nearest rather than latest, and by absolute distance, because a company's size is better
   * predicted by the year next door than by the newest one on file. Ties go to the earlier year
   * so the choice does not depend on iteration order.
   */
  const scaleReferenceFor = (fiscalYear: number): FiSimScaleReference | null => {
    const candidates = Object.entries(headlines)
      .map(([year, headline]) => ({ fiscalYear: Number(year), headline }))
      .filter((entry) => entry.headline.revenue !== null && entry.fiscalYear !== fiscalYear)
      .sort(
        (left, right) =>
          Math.abs(left.fiscalYear - fiscalYear) - Math.abs(right.fiscalYear - fiscalYear) ||
          left.fiscalYear - right.fiscalYear,
      );
    const nearest = candidates[0];
    if (!nearest) return null;
    return {
      fiscalYear: nearest.fiscalYear,
      revenue: nearest.headline.revenue!,
      assets: nearest.headline.assets,
    };
  };

  let openingAccumulatedResults: bigint | null = null;

  for (const fiscalYear of orderedYears) {
    const { periodStart, periodEnd } = periodFor(fiscalYear);
    if (fiscalYear > input.latestCompletedFiscalYear) {
      skipped.push({
        fiscalYear,
        reason: `${fiscalYear} is not a completed fiscal year`,
      });
      continue;
    }
    if (input.registeredAt === null) {
      // No registration date. The company filed accounts for these years, and nothing else, so
      // these are the only years it can be shown to have existed for.
      if (!(input.reportedFiscalYears ?? []).includes(fiscalYear)) {
        skipped.push({
          fiscalYear,
          reason: "No registration date and no filed statement for this year",
        });
        continue;
      }
    } else if (input.registeredAt > periodStart) {
      skipped.push({
        fiscalYear,
        reason: `The company was registered ${input.registeredAt.toISOString().slice(0, 10)}, after this period starts`,
      });
      continue;
    }

    const anchors = new Map(
      (input.anchorsByFiscalYear[fiscalYear] ?? []).map((anchor) => [anchor.conceptKey, anchor]),
    );
    const yearStream = createValueStream(fiscalYearSeed(seed, fiscalYear));

    try {
      const income = solveIncomeStatement({
        fiscalYear,
        // Counted back from the newest closed year, not from the first year asked for, so a
        // company's 2023 figures do not change because the caller also asked for 2021.
        yearIndex: fiscalYear - input.latestCompletedFiscalYear,
        profileKey: selection.profile,
        assumptions,
        companyStream,
        yearStream,
        anchors,
        headline: headlineFor(fiscalYear),
        scaleReference: scaleReferenceFor(fiscalYear),
        unitScale: input.unitScale,
      });
      const balance = solveBalanceSheet({
        fiscalYear,
        profileKey: selection.profile,
        assumptions,
        companyStream,
        yearStream,
        anchors,
        headline: headlineFor(fiscalYear),
        scaleReference: scaleReferenceFor(fiscalYear),
        unitScale: input.unitScale,
        operatingIncome: income.solution.values.get("OperatingIncomeTotal")?.value ?? 0n,
        profitForPeriod: income.profitForPeriod,
        openingAccumulatedResults,
      });

      const incomeStatement = toStatement("INCOME_STATEMENT", income.solution, fiscalYear);
      const balanceStatement = toStatement("BALANCE_SHEET", balance.solution, fiscalYear);
      const residuals = [...incomeStatement.residuals, ...balanceStatement.residuals];

      packages.push({
        companyId: input.companyId,
        orgNumber: input.orgNumber,
        fiscalYear,
        statementScope: input.statementScope,
        profile: selection.profile,
        profileRuleId: selection.ruleId,
        periodStart,
        periodEnd,
        currency: input.currency,
        unitScale: input.unitScale,
        seed,
        income: incomeStatement,
        balance: balanceStatement,
        validationStatus: residuals.some((residual) => residual.severity === "REVIEW")
          ? "MANUAL_REVIEW"
          : "VALID",
        residualAmount: residuals.length > 0
          ? residuals.reduce((sum, residual) => sum + residual.amount, 0n)
          : null,
        bridge: balance.bridge,
      });
      openingAccumulatedResults = balance.closingAccumulatedResults;
    } catch (error) {
      failures.push(toGenerationFailure(error));
      // A year that cannot be solved does not corrupt the bridge for the following ones: the
      // opening balance stays where the last solved year left it.
    }
  }

  return { ...shell, packages, skipped, failures };
}
