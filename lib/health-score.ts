import { getHeadlineFinancialStatements } from "@/lib/financial-statements";
import type {
  NormalizedCompany,
  NormalizedFinancialLineItem,
  NormalizedFinancialStatement,
} from "@/lib/types";

/**
 * The configurable financial-health model.
 *
 * The old `lib/company-health` heuristic was a fixed if-chain: five additive
 * bumps and three hardcoded grade cuts. This module replaces it with a model an
 * admin owns — which metrics count, what each is worth, how a raw ratio turns
 * into points, and where the grade and risk lines fall.
 *
 * Everything here is pure and dependency-free so the same engine runs in the
 * server render of a company page and in the admin's live preview. Nothing is
 * invented: a metric with no data stays `null` and the model decides explicitly
 * how to treat the hole (see `missingDataPolicy`), and coverage is reported
 * alongside the score so a thin-data company never looks as certain as a
 * fully-reported one.
 */

/* ── Pillars ──────────────────────────────────────────────────────────────── */

/**
 * The six axes of the health radar. Fixed, because they are the visual contract
 * of the chart — admins weight them and switch them off, but do not invent new
 * ones. Every metric in the catalog belongs to exactly one pillar.
 */
export const HEALTH_PILLAR_KEYS = [
  "LONNSOMHET",
  "SOLIDITET",
  "LIKVIDITET",
  "VEKST",
  "DRIFT",
  "STABILITET",
] as const;

export type HealthPillarKey = (typeof HEALTH_PILLAR_KEYS)[number];

export const healthPillarLabels: Record<HealthPillarKey, string> = {
  LONNSOMHET: "Lønnsomhet",
  SOLIDITET: "Soliditet",
  LIKVIDITET: "Likviditet",
  VEKST: "Vekst",
  DRIFT: "Drift",
  STABILITET: "Stabilitet",
};

export const healthPillarDescriptions: Record<HealthPillarKey, string> = {
  LONNSOMHET: "Klarer driften å tjene penger på omsetningen og på kapitalen som er skutt inn?",
  SOLIDITET: "Hvor mye av balansen er egenkapital, og hvor tungt er selskapet gjeldsfinansiert?",
  LIKVIDITET: "Dekker omløpsmidlene den kortsiktige gjelden når den forfaller?",
  VEKST: "Vokser omsetning, resultat og egenkapital, eller krymper de?",
  DRIFT: "Hvor effektivt omsettes kapital og lønnskostnad til inntekt?",
  STABILITET: "Er foretaket aktivt, rapporterer det i tide, og har det en historikk å måle mot?",
};

/* ── Scoring curves ───────────────────────────────────────────────────────── */

/**
 * One point on a metric's scoring curve: a raw metric value and the 0–100 score
 * it is worth. Values between two points are interpolated linearly; values
 * outside the curve clamp to the nearest endpoint. Points are kept sorted by
 * `value` ascending, which lets a curve express "higher is better" (rising
 * scores) or "lower is better" (falling scores) without a separate direction
 * flag.
 */
export type HealthCurvePoint = { value: number; score: number };

/** Interpolates a raw metric value into a 0–100 score along a curve. */
export function scoreOnCurve(curve: readonly HealthCurvePoint[], value: number): number {
  if (curve.length === 0 || !Number.isFinite(value)) return 0;
  const points = [...curve].sort((left, right) => left.value - right.value);

  const first = points[0];
  const last = points[points.length - 1];
  if (value <= first.value) return clampScore(first.score);
  if (value >= last.value) return clampScore(last.score);

  for (let index = 0; index < points.length - 1; index += 1) {
    const lower = points[index];
    const upper = points[index + 1];
    if (value >= lower.value && value <= upper.value) {
      const span = upper.value - lower.value;
      if (span === 0) return clampScore(upper.score);
      const ratio = (value - lower.value) / span;
      return clampScore(lower.score + ratio * (upper.score - lower.score));
    }
  }

  return clampScore(last.score);
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, score));
}

/* ── Metric catalog ───────────────────────────────────────────────────────── */

export type HealthMetricUnit = "pct" | "ratio" | "years" | "nok";

/**
 * What a metric needs before it can produce a value at all. Surfaced in the
 * admin so it is obvious why a metric is dark for most companies: `lineItems`
 * metrics only work where we hold a mapped line-item breakdown, not just the
 * five headline figures.
 */
export type HealthMetricRequirement = "headline" | "lineItems" | "register";

export type HealthMetricDefinition = {
  key: string;
  label: string;
  pillar: HealthPillarKey;
  unit: HealthMetricUnit;
  requires: HealthMetricRequirement;
  /** Plain-language definition shown in the admin and in the company tooltip. */
  help: string;
  compute: (facts: HealthFacts) => number | null;
  defaultWeight: number;
  defaultEnabled: boolean;
  defaultCurve: HealthCurvePoint[];
};

/* ── Derived facts ────────────────────────────────────────────────────────── */

/** Everything the metric catalog is allowed to read. Built once per company. */
export type HealthFacts = {
  status: NormalizedCompany["status"];
  employeeCount: number | null;
  companyAgeYears: number | null;
  yearsSinceLastReport: number | null;
  reportedYearCount: number;
  /** Share of reported years with a positive operating profit, 0–100. */
  positiveEbitShare: number | null;
  latest: HealthYearFacts | null;
  previous: HealthYearFacts | null;
  /** Oldest reported year, used for multi-year growth. */
  earliest: HealthYearFacts | null;
};

export type HealthYearFacts = {
  fiscalYear: number;
  revenue: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  equity: number | null;
  assets: number | null;
  /** assets − equity when both are present. */
  debt: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  inventory: number | null;
  cash: number | null;
  financialExpense: number | null;
  payrollExpense: number | null;
};

function num(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

/** Percentage numerator/denominator, null-safe and zero-safe. */
function pct(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return (numerator / denominator) * 100;
}

/** Plain ratio, null-safe and zero-safe. */
function div(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

/**
 * Year-over-year growth in percent. Guarded against a negative base, where a
 * naive formula reports "growth" for a loss that merely got smaller — those
 * cases return null rather than a misleading number.
 */
function growthPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Compound annual growth over `years` periods, in percent. */
function cagrPct(current: number | null, base: number | null, years: number): number | null {
  if (current === null || base === null || base <= 0 || current <= 0 || years < 1) return null;
  return (Math.pow(current / base, 1 / years) - 1) * 100;
}

type LineItemLookup = Map<string, number>;

function lineItemKey(fiscalYear: number, metricKey: string): string {
  return `${fiscalYear}::${metricKey}`;
}

/**
 * Indexes mapped line items by year and canonical key. Manually reviewed values
 * win over machine extraction for the same slot, and the scope of the headline
 * statement wins over the other scope so a consolidated headline is never mixed
 * with parent-company detail.
 */
function indexLineItems(
  lineItems: readonly NormalizedFinancialLineItem[],
  preferredScope: "COMPANY" | "CONSOLIDATED" | null,
): LineItemLookup {
  const ranked = new Map<string, { value: number; rank: number }>();

  for (const item of lineItems) {
    if (!item.metricKey || item.value === null || !Number.isFinite(item.value)) continue;
    const key = lineItemKey(item.fiscalYear, item.metricKey);
    const scopeRank = preferredScope === null || item.statementScope === preferredScope ? 2 : 0;
    const sourceRank = item.publicationSource === "MANUAL_REVIEW" ? 1 : 0;
    const rank = scopeRank + sourceRank;
    const existing = ranked.get(key);
    if (!existing || rank > existing.rank) {
      ranked.set(key, { value: item.value, rank });
    }
  }

  return new Map([...ranked].map(([key, entry]) => [key, entry.value]));
}

function buildYearFacts(
  statement: NormalizedFinancialStatement,
  lookup: LineItemLookup,
): HealthYearFacts {
  const equity = num(statement.equity);
  const assets = num(statement.assets);
  const year = statement.fiscalYear;
  const line = (metricKey: string): number | null => {
    const direct = lookup.get(lineItemKey(year, metricKey));
    if (direct !== undefined) return direct;
    const fromValues = statement.financialValues?.[metricKey];
    return num(fromValues);
  };

  return {
    fiscalYear: year,
    revenue: num(statement.revenue),
    operatingProfit: num(statement.operatingProfit),
    netIncome: num(statement.netIncome),
    equity,
    assets,
    debt: equity !== null && assets !== null ? assets - equity : null,
    currentAssets: line("current_assets"),
    currentLiabilities: line("current_liabilities"),
    inventory: line("inventory"),
    cash: line("cash_and_cash_equivalents"),
    financialExpense: line("financial_expense"),
    payrollExpense: line("payroll_expense"),
  };
}

export type HealthFactsInput = {
  company: Pick<
    NormalizedCompany,
    "status" | "employeeCount" | "foundedAt" | "lastSubmittedAnnualReportYear"
  >;
  statements: readonly NormalizedFinancialStatement[];
  lineItems?: readonly NormalizedFinancialLineItem[];
  /** Injectable so scoring is deterministic in tests and in the admin preview. */
  now?: Date;
};

/** Reduces a company's raw register + financial data to the facts metrics read. */
export function buildHealthFacts({
  company,
  statements,
  lineItems = [],
  now = new Date(),
}: HealthFactsInput): HealthFacts {
  const headline = getHeadlineFinancialStatements([...statements]).sort(
    (left, right) => left.fiscalYear - right.fiscalYear,
  );

  const latestStatement = headline.at(-1) ?? null;
  const lookup = indexLineItems(lineItems, latestStatement?.statementScope ?? null);
  const years = headline.map((statement) => buildYearFacts(statement, lookup));

  const withEbit = years.filter((year) => year.operatingProfit !== null);
  const positiveEbitShare =
    withEbit.length > 0
      ? (withEbit.filter((year) => (year.operatingProfit as number) > 0).length / withEbit.length) *
        100
      : null;

  const currentYear = now.getFullYear();
  const lastReportYear = num(company.lastSubmittedAnnualReportYear) ?? latestStatement?.fiscalYear ?? null;
  const foundedAt = company.foundedAt ? new Date(company.foundedAt) : null;

  return {
    status: company.status,
    employeeCount: num(company.employeeCount),
    companyAgeYears:
      foundedAt && !Number.isNaN(foundedAt.getTime())
        ? Math.max(0, (now.getTime() - foundedAt.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : null,
    // A report for fiscal year Y is only due the year after, so Y = currentYear − 1
    // is still "on time". Clamp at zero rather than crediting negative lateness.
    yearsSinceLastReport:
      lastReportYear !== null ? Math.max(0, currentYear - 1 - lastReportYear) : null,
    reportedYearCount: years.length,
    positiveEbitShare,
    latest: years.at(-1) ?? null,
    previous: years.length >= 2 ? years[years.length - 2] : null,
    earliest: years[0] ?? null,
  };
}

/* ── The catalog ──────────────────────────────────────────────────────────── */

const latest = (facts: HealthFacts) => facts.latest;

export const healthMetricCatalog: readonly HealthMetricDefinition[] = [
  /* Lønnsomhet */
  {
    key: "ebit_margin",
    label: "Driftsmargin",
    pillar: "LONNSOMHET",
    unit: "pct",
    requires: "headline",
    help: "Driftsresultat i prosent av driftsinntekter. Viser hvor mye av hver omsetningskrone som blir igjen etter driftskostnader.",
    compute: (facts) => pct(latest(facts)?.operatingProfit ?? null, latest(facts)?.revenue ?? null),
    defaultWeight: 35,
    defaultEnabled: true,
    defaultCurve: [
      { value: -20, score: 0 },
      { value: 0, score: 30 },
      { value: 5, score: 55 },
      { value: 10, score: 75 },
      { value: 20, score: 95 },
      { value: 30, score: 100 },
    ],
  },
  {
    key: "net_margin",
    label: "Nettomargin",
    pillar: "LONNSOMHET",
    unit: "pct",
    requires: "headline",
    help: "Årsresultat i prosent av driftsinntekter, altså bunnlinjen etter finansposter og skatt.",
    compute: (facts) => pct(latest(facts)?.netIncome ?? null, latest(facts)?.revenue ?? null),
    defaultWeight: 20,
    defaultEnabled: true,
    defaultCurve: [
      { value: -15, score: 0 },
      { value: 0, score: 35 },
      { value: 5, score: 60 },
      { value: 12, score: 85 },
      { value: 20, score: 100 },
    ],
  },
  {
    key: "return_on_equity",
    label: "Egenkapitalavkastning",
    pillar: "LONNSOMHET",
    unit: "pct",
    requires: "headline",
    help: "Årsresultat i prosent av egenkapitalen. Beregnes bare når egenkapitalen er positiv.",
    compute: (facts) => {
      const year = latest(facts);
      if (!year || year.equity === null || year.equity <= 0) return null;
      return pct(year.netIncome, year.equity);
    },
    defaultWeight: 25,
    defaultEnabled: true,
    defaultCurve: [
      { value: -20, score: 0 },
      { value: 0, score: 30 },
      { value: 8, score: 60 },
      { value: 15, score: 85 },
      { value: 25, score: 100 },
    ],
  },
  {
    key: "return_on_assets",
    label: "Totalkapitalavkastning",
    pillar: "LONNSOMHET",
    unit: "pct",
    requires: "headline",
    help: "Driftsresultat i prosent av sum eiendeler. Måler avkastning uavhengig av hvordan selskapet er finansiert.",
    compute: (facts) => pct(latest(facts)?.operatingProfit ?? null, latest(facts)?.assets ?? null),
    defaultWeight: 20,
    defaultEnabled: true,
    defaultCurve: [
      { value: -10, score: 0 },
      { value: 0, score: 30 },
      { value: 5, score: 65 },
      { value: 10, score: 85 },
      { value: 15, score: 100 },
    ],
  },

  /* Soliditet */
  {
    key: "equity_ratio",
    label: "Egenkapitalandel",
    pillar: "SOLIDITET",
    unit: "pct",
    requires: "headline",
    help: "Egenkapital i prosent av sum eiendeler. Den vanligste enkeltmålestokken på soliditet.",
    compute: (facts) => pct(latest(facts)?.equity ?? null, latest(facts)?.assets ?? null),
    defaultWeight: 50,
    defaultEnabled: true,
    defaultCurve: [
      { value: 0, score: 0 },
      { value: 10, score: 30 },
      { value: 20, score: 50 },
      { value: 35, score: 75 },
      { value: 50, score: 90 },
      { value: 65, score: 100 },
    ],
  },
  {
    key: "debt_to_equity",
    label: "Gjeldsgrad",
    pillar: "SOLIDITET",
    unit: "ratio",
    requires: "headline",
    help: "Gjeld delt på egenkapital. Lavere er bedre. Beregnes bare når egenkapitalen er positiv.",
    compute: (facts) => {
      const year = latest(facts);
      if (!year || year.equity === null || year.equity <= 0) return null;
      return div(year.debt, year.equity);
    },
    defaultWeight: 30,
    defaultEnabled: true,
    defaultCurve: [
      { value: 0, score: 100 },
      { value: 1, score: 85 },
      { value: 2, score: 65 },
      { value: 4, score: 40 },
      { value: 8, score: 15 },
      { value: 15, score: 0 },
    ],
  },
  {
    key: "interest_coverage",
    label: "Rentedekningsgrad",
    pillar: "SOLIDITET",
    unit: "ratio",
    requires: "lineItems",
    help: "Driftsresultat delt på finanskostnader. Viser hvor mange ganger driften dekker rentebyrden.",
    compute: (facts) => {
      const year = latest(facts);
      if (!year || year.financialExpense === null || year.financialExpense <= 0) return null;
      return div(year.operatingProfit, year.financialExpense);
    },
    defaultWeight: 20,
    defaultEnabled: true,
    defaultCurve: [
      { value: 0, score: 0 },
      { value: 1, score: 30 },
      { value: 2, score: 50 },
      { value: 5, score: 80 },
      { value: 10, score: 100 },
    ],
  },

  /* Likviditet */
  {
    key: "current_ratio",
    label: "Likviditetsgrad 1",
    pillar: "LIKVIDITET",
    unit: "ratio",
    requires: "lineItems",
    help: "Omløpsmidler delt på kortsiktig gjeld. Under 1 betyr at kortsiktig gjeld overstiger omløpsmidlene.",
    compute: (facts) => div(latest(facts)?.currentAssets ?? null, latest(facts)?.currentLiabilities ?? null),
    defaultWeight: 40,
    defaultEnabled: true,
    defaultCurve: [
      { value: 0, score: 0 },
      { value: 0.5, score: 20 },
      { value: 1, score: 50 },
      { value: 1.5, score: 80 },
      { value: 2, score: 95 },
      { value: 3, score: 100 },
    ],
  },
  {
    key: "quick_ratio",
    label: "Likviditetsgrad 2",
    pillar: "LIKVIDITET",
    unit: "ratio",
    requires: "lineItems",
    help: "Omløpsmidler minus varelager, delt på kortsiktig gjeld. Strengere enn likviditetsgrad 1.",
    compute: (facts) => {
      const year = latest(facts);
      if (!year || year.currentAssets === null) return null;
      const quickAssets = year.currentAssets - (year.inventory ?? 0);
      return div(quickAssets, year.currentLiabilities);
    },
    defaultWeight: 30,
    defaultEnabled: true,
    defaultCurve: [
      { value: 0, score: 0 },
      { value: 0.3, score: 20 },
      { value: 0.7, score: 50 },
      { value: 1, score: 80 },
      { value: 1.5, score: 100 },
    ],
  },
  {
    key: "cash_ratio",
    label: "Kontantgrad",
    pillar: "LIKVIDITET",
    unit: "ratio",
    requires: "lineItems",
    help: "Bankinnskudd og kontanter delt på kortsiktig gjeld. Den strengeste likviditetsmålestokken.",
    compute: (facts) => div(latest(facts)?.cash ?? null, latest(facts)?.currentLiabilities ?? null),
    defaultWeight: 15,
    defaultEnabled: true,
    defaultCurve: [
      { value: 0, score: 0 },
      { value: 0.1, score: 25 },
      { value: 0.25, score: 55 },
      { value: 0.5, score: 80 },
      { value: 1, score: 100 },
    ],
  },
  {
    key: "working_capital_share",
    label: "Arbeidskapital av omsetning",
    pillar: "LIKVIDITET",
    unit: "pct",
    requires: "lineItems",
    help: "Omløpsmidler minus kortsiktig gjeld, i prosent av driftsinntekter.",
    compute: (facts) => {
      const year = latest(facts);
      if (!year || year.currentAssets === null || year.currentLiabilities === null) return null;
      return pct(year.currentAssets - year.currentLiabilities, year.revenue);
    },
    defaultWeight: 15,
    defaultEnabled: true,
    defaultCurve: [
      { value: -20, score: 0 },
      { value: 0, score: 40 },
      { value: 10, score: 70 },
      { value: 25, score: 95 },
      { value: 40, score: 100 },
    ],
  },

  /* Vekst */
  {
    key: "revenue_growth",
    label: "Omsetningsvekst",
    pillar: "VEKST",
    unit: "pct",
    requires: "headline",
    help: "Endring i driftsinntekter fra forrige regnskapsår, i prosent.",
    compute: (facts) => growthPct(facts.latest?.revenue ?? null, facts.previous?.revenue ?? null),
    defaultWeight: 35,
    defaultEnabled: true,
    defaultCurve: [
      { value: -30, score: 0 },
      { value: -10, score: 25 },
      { value: 0, score: 45 },
      { value: 10, score: 70 },
      { value: 25, score: 90 },
      { value: 50, score: 100 },
    ],
  },
  {
    key: "revenue_cagr",
    label: "Omsetningsvekst over tid",
    pillar: "VEKST",
    unit: "pct",
    requires: "headline",
    help: "Årlig gjennomsnittlig vekst i driftsinntekter fra første til siste registrerte regnskapsår.",
    compute: (facts) => {
      if (!facts.latest || !facts.earliest) return null;
      const span = facts.latest.fiscalYear - facts.earliest.fiscalYear;
      if (span < 1) return null;
      return cagrPct(facts.latest.revenue, facts.earliest.revenue, span);
    },
    defaultWeight: 25,
    defaultEnabled: true,
    defaultCurve: [
      { value: -20, score: 0 },
      { value: -5, score: 30 },
      { value: 0, score: 50 },
      { value: 8, score: 75 },
      { value: 20, score: 100 },
    ],
  },
  {
    key: "operating_profit_growth",
    label: "Resultatvekst",
    pillar: "VEKST",
    unit: "pct",
    requires: "headline",
    help: "Endring i driftsresultat fra forrige år. Beregnes bare når fjoråret var positivt, ellers blir prosenten misvisende.",
    compute: (facts) =>
      growthPct(facts.latest?.operatingProfit ?? null, facts.previous?.operatingProfit ?? null),
    defaultWeight: 25,
    defaultEnabled: true,
    defaultCurve: [
      { value: -50, score: 0 },
      { value: -15, score: 30 },
      { value: 0, score: 50 },
      { value: 25, score: 80 },
      { value: 60, score: 100 },
    ],
  },
  {
    key: "equity_growth",
    label: "Egenkapitalvekst",
    pillar: "VEKST",
    unit: "pct",
    requires: "headline",
    help: "Endring i egenkapital fra forrige år. Fanger opp om verdiene i selskapet bygges opp eller tappes.",
    compute: (facts) => growthPct(facts.latest?.equity ?? null, facts.previous?.equity ?? null),
    defaultWeight: 15,
    defaultEnabled: true,
    defaultCurve: [
      { value: -30, score: 0 },
      { value: -10, score: 30 },
      { value: 0, score: 50 },
      { value: 15, score: 80 },
      { value: 35, score: 100 },
    ],
  },

  /* Drift */
  {
    key: "asset_turnover",
    label: "Kapitalomløpshastighet",
    pillar: "DRIFT",
    unit: "ratio",
    requires: "headline",
    help: "Driftsinntekter delt på sum eiendeler. Hvor mye omsetning selskapet får ut av kapitalen sin.",
    compute: (facts) => div(latest(facts)?.revenue ?? null, latest(facts)?.assets ?? null),
    defaultWeight: 40,
    defaultEnabled: true,
    defaultCurve: [
      { value: 0, score: 0 },
      { value: 0.3, score: 25 },
      { value: 0.7, score: 50 },
      { value: 1.2, score: 75 },
      { value: 2, score: 95 },
      { value: 3, score: 100 },
    ],
  },
  {
    key: "revenue_per_employee",
    label: "Omsetning per ansatt",
    pillar: "DRIFT",
    unit: "nok",
    requires: "register",
    help: "Driftsinntekter delt på registrert antall ansatte. Krever at ansatt-tallet er registrert.",
    compute: (facts) => {
      if (facts.employeeCount === null || facts.employeeCount <= 0) return null;
      return div(latest(facts)?.revenue ?? null, facts.employeeCount);
    },
    defaultWeight: 30,
    defaultEnabled: true,
    defaultCurve: [
      { value: 0, score: 0 },
      { value: 500_000, score: 30 },
      { value: 1_000_000, score: 55 },
      { value: 2_000_000, score: 80 },
      { value: 4_000_000, score: 100 },
    ],
  },
  {
    key: "payroll_share",
    label: "Lønnsandel av omsetning",
    pillar: "DRIFT",
    unit: "pct",
    requires: "lineItems",
    help: "Lønnskostnad i prosent av driftsinntekter. Lavere er bedre, men nivået er sterkt bransjeavhengig.",
    compute: (facts) => pct(latest(facts)?.payrollExpense ?? null, latest(facts)?.revenue ?? null),
    defaultWeight: 30,
    defaultEnabled: true,
    defaultCurve: [
      { value: 100, score: 0 },
      { value: 70, score: 30 },
      { value: 50, score: 55 },
      { value: 35, score: 80 },
      { value: 20, score: 100 },
    ],
  },

  /* Stabilitet */
  {
    key: "register_status",
    label: "Registerstatus",
    pillar: "STABILITET",
    unit: "ratio",
    requires: "register",
    help: "1 når foretaket er aktivt i Enhetsregisteret, 0 når det er oppløst eller konkurs.",
    compute: (facts) => (facts.status === "ACTIVE" ? 1 : 0),
    defaultWeight: 30,
    defaultEnabled: true,
    defaultCurve: [
      { value: 0, score: 0 },
      { value: 1, score: 100 },
    ],
  },
  {
    key: "reporting_recency",
    label: "Rapporteringsetterslep",
    pillar: "STABILITET",
    unit: "years",
    requires: "register",
    help: "Antall år siden siste innleverte årsregnskap, utover fristen. 0 betyr à jour.",
    compute: (facts) => facts.yearsSinceLastReport,
    defaultWeight: 30,
    defaultEnabled: true,
    defaultCurve: [
      { value: 0, score: 100 },
      { value: 1, score: 70 },
      { value: 2, score: 35 },
      { value: 3, score: 0 },
    ],
  },
  {
    key: "history_depth",
    label: "Regnskapshistorikk",
    pillar: "STABILITET",
    unit: "years",
    requires: "headline",
    help: "Antall regnskapsår vi har registrert. Kort historikk gir tynnere grunnlag for vurderingen.",
    compute: (facts) => facts.reportedYearCount,
    defaultWeight: 15,
    defaultEnabled: true,
    defaultCurve: [
      { value: 0, score: 0 },
      { value: 1, score: 20 },
      { value: 2, score: 45 },
      { value: 3, score: 70 },
      { value: 5, score: 90 },
      { value: 7, score: 100 },
    ],
  },
  {
    key: "company_age",
    label: "Selskapets alder",
    pillar: "STABILITET",
    unit: "years",
    requires: "register",
    help: "År siden stiftelse. Eldre foretak har vist at de overlever flere konjunkturer.",
    compute: (facts) => facts.companyAgeYears,
    defaultWeight: 10,
    defaultEnabled: true,
    defaultCurve: [
      { value: 0, score: 20 },
      { value: 2, score: 45 },
      { value: 5, score: 70 },
      { value: 10, score: 90 },
      { value: 20, score: 100 },
    ],
  },
  {
    key: "profit_consistency",
    label: "Andel år med overskudd",
    pillar: "STABILITET",
    unit: "pct",
    requires: "headline",
    help: "Prosentandel av de registrerte regnskapsårene med positivt driftsresultat.",
    compute: (facts) => facts.positiveEbitShare,
    defaultWeight: 15,
    defaultEnabled: true,
    defaultCurve: [
      { value: 0, score: 0 },
      { value: 50, score: 50 },
      { value: 100, score: 100 },
    ],
  },
];

export const healthMetricsByKey: ReadonlyMap<string, HealthMetricDefinition> = new Map(
  healthMetricCatalog.map((metric) => [metric.key, metric]),
);

export function healthMetricsForPillar(pillar: HealthPillarKey): HealthMetricDefinition[] {
  return healthMetricCatalog.filter((metric) => metric.pillar === pillar);
}

/* ── Model configuration ──────────────────────────────────────────────────── */

export type HealthStatusTone = "success" | "warning" | "error" | "neutral";

export type HealthMetricConfig = {
  key: string;
  enabled: boolean;
  /** Relative weight inside its pillar. Normalized at scoring time. */
  weight: number;
  curve: HealthCurvePoint[];
};

export type HealthPillarConfig = {
  key: HealthPillarKey;
  enabled: boolean;
  /** Relative weight across pillars. Normalized at scoring time. */
  weight: number;
  metrics: HealthMetricConfig[];
};

export type HealthRatingBand = {
  grade: string;
  /** Lowest total score that still earns this grade. */
  minScore: number;
  label: string;
  tone: HealthStatusTone;
};

export type HealthRiskBand = {
  label: string;
  minScore: number;
  tone: HealthStatusTone;
};

/**
 * What a register status does to the finished score, regardless of the numbers.
 * A bankrupt company with a beautiful last-filed balance sheet must not come out
 * as an A.
 */
export type HealthStatusOverride = {
  status: NormalizedCompany["status"];
  /** Total score is capped at this value. */
  capScore: number;
  /** When set, the grade and risk band are forced regardless of the score. */
  forceGrade: string | null;
  forceRiskLabel: string | null;
};

/**
 * How a metric that produced no value is treated *inside its pillar*.
 * - `renormalize`: drop it and redistribute its weight across the metrics that
 *   did produce a value, so the pillar score reflects what is actually known
 * - `zero`: count it as 0 (treats a gap in our data as if the company scored
 *   badly on it)
 * - `neutral`: count it as 50 (pulls every thin-data company toward the middle)
 *
 * Note this only decides how the *pillar* averages. It is not the lever that
 * punishes thin data overall — that is `coveragePenalty`, which docks the total.
 */
export type HealthMissingDataPolicy = "renormalize" | "zero" | "neutral";

/**
 * Docks the total score in proportion to how much of the model went unanswered.
 *
 * Without this, `renormalize` quietly rewards ignorance: a company where we only
 * hold two headline figures gets scored purely on those two, and a strong
 * showing there produces a confident grade the data cannot support. The penalty
 * makes thin coverage cost points on the total, rather than making individual
 * metrics vanish or pretending they scored zero.
 *
 * `fullCoverageAt` is where the penalty stops — coverage at or above it is
 * treated as complete, since almost no company answers 100 % of a broad model.
 * `strength` is how much of the score a company with *no* data would lose.
 */
export type HealthCoveragePenalty = {
  enabled: boolean;
  /** Points-per-cent bite, 0–100. At 100, zero coverage means a zero score. */
  strength: number;
  /** Coverage (0–100) at or above which nothing is deducted. */
  fullCoverageAt: number;
};

export type HealthScoreConfig = {
  pillars: HealthPillarConfig[];
  ratingBands: HealthRatingBand[];
  riskBands: HealthRiskBand[];
  statusOverrides: HealthStatusOverride[];
  missingDataPolicy: HealthMissingDataPolicy;
  coveragePenalty: HealthCoveragePenalty;
  /**
   * Below this share of answered weight (0–100) the result is flagged as thin,
   * on top of whatever `coveragePenalty` already deducted.
   */
  minimumCoverage: number;
};

/* ── Defaults ─────────────────────────────────────────────────────────────── */

const DEFAULT_PILLAR_WEIGHTS: Record<HealthPillarKey, number> = {
  LONNSOMHET: 25,
  SOLIDITET: 25,
  LIKVIDITET: 20,
  VEKST: 10,
  DRIFT: 10,
  STABILITET: 10,
};

/** The model a fresh install starts from, and the fallback when config is unreadable. */
export function defaultHealthScoreConfig(): HealthScoreConfig {
  return {
    pillars: HEALTH_PILLAR_KEYS.map((pillar) => ({
      key: pillar,
      enabled: true,
      weight: DEFAULT_PILLAR_WEIGHTS[pillar],
      metrics: healthMetricsForPillar(pillar).map((metric) => ({
        key: metric.key,
        enabled: metric.defaultEnabled,
        weight: metric.defaultWeight,
        curve: metric.defaultCurve.map((point) => ({ ...point })),
      })),
    })),
    ratingBands: [
      { grade: "A", minScore: 80, label: "Meget god", tone: "success" },
      { grade: "B", minScore: 60, label: "God", tone: "success" },
      { grade: "C", minScore: 40, label: "Middels", tone: "warning" },
      { grade: "D", minScore: 0, label: "Svak", tone: "error" },
    ],
    riskBands: [
      { label: "Lav", minScore: 70, tone: "success" },
      { label: "Middels", minScore: 45, tone: "warning" },
      { label: "Høy", minScore: 0, tone: "error" },
    ],
    statusOverrides: [
      { status: "BANKRUPT", capScore: 10, forceGrade: "D", forceRiskLabel: "Høy" },
      { status: "DISSOLVED", capScore: 25, forceGrade: "D", forceRiskLabel: "Høy" },
    ],
    missingDataPolicy: "renormalize",
    // Thin data costs points on the total rather than distorting the individual
    // metrics. 75 % is treated as full coverage because the liquidity and
    // line-item metrics are simply absent for most small companies.
    coveragePenalty: { enabled: true, strength: 60, fullCoverageAt: 75 },
    minimumCoverage: 50,
  };
}

/* ── Scoring ──────────────────────────────────────────────────────────────── */

export type HealthMetricResult = {
  key: string;
  label: string;
  unit: HealthMetricUnit;
  help: string;
  weight: number;
  /** Share of the pillar this metric actually carried, 0–100. */
  weightShare: number;
  /** Raw computed value, or null when the data is missing. */
  value: number | null;
  /** 0–100 points after the curve, or null when the value is missing. */
  score: number | null;
  available: boolean;
  requires: HealthMetricRequirement;
};

export type HealthPillarResult = {
  key: HealthPillarKey;
  label: string;
  description: string;
  weight: number;
  /** Share of the total this pillar actually carried, 0–100. */
  weightShare: number;
  score: number | null;
  /** Share of this pillar's weight that had data, 0–100. */
  coverage: number;
  metrics: HealthMetricResult[];
};

export type HealthScoreResult = {
  score: number;
  grade: string;
  gradeLabel: string;
  gradeTone: HealthStatusTone;
  riskLabel: string;
  riskTone: HealthStatusTone;
  /** Share of the model's weight that had data behind it, 0–100. */
  coverage: number;
  /** True when coverage fell below the model's `minimumCoverage`. */
  thinData: boolean;
  /** Set when a register status overrode the computed grade or capped the score. */
  overrideApplied: NormalizedCompany["status"] | null;
  /** The weighted average before the coverage penalty and any status override. */
  rawScore: number;
  /** Points the coverage penalty removed from `rawScore`. 0 when nothing was docked. */
  coveragePenaltyPoints: number;
  pillars: HealthPillarResult[];
};

/**
 * How far short of `fullCoverageAt` this result landed, as a 0–1 fraction.
 * Exported so the admin can explain the deduction it is about to configure.
 */
export function coverageShortfall(coverage: number, fullCoverageAt: number): number {
  if (fullCoverageAt <= 0) return 0;
  return Math.max(0, Math.min(1, (fullCoverageAt - coverage) / fullCoverageAt));
}

function resolveBand<T extends { minScore: number }>(bands: readonly T[], score: number): T | null {
  const sorted = [...bands].sort((left, right) => right.minScore - left.minScore);
  return sorted.find((band) => score >= band.minScore) ?? sorted.at(-1) ?? null;
}

/** Substitute score for a metric with no value, per the model's policy. */
function missingScore(policy: HealthMissingDataPolicy): number | null {
  if (policy === "zero") return 0;
  if (policy === "neutral") return 50;
  return null;
}

/**
 * Runs a config against a company's facts.
 *
 * Weights are treated as relative and normalized, so an admin can type "35" and
 * "20" without making the column add to 100. Disabled pillars and metrics are
 * dropped before normalization, as are metrics with no data under the default
 * `renormalize` policy — which is why `coverage` is reported separately.
 */
export function computeHealthScore(
  facts: HealthFacts,
  config: HealthScoreConfig,
): HealthScoreResult {
  const substitute = missingScore(config.missingDataPolicy);

  const pillars: HealthPillarResult[] = config.pillars
    .filter((pillar) => pillar.enabled && pillar.weight > 0)
    .map((pillar) => {
      const metrics: HealthMetricResult[] = pillar.metrics
        .filter((metric) => metric.enabled && metric.weight > 0)
        .map((metric) => {
          const definition = healthMetricsByKey.get(metric.key);
          if (!definition) return null;
          const value = definition.compute(facts);
          const hasValue = value !== null && Number.isFinite(value);
          return {
            key: metric.key,
            label: definition.label,
            unit: definition.unit,
            help: definition.help,
            weight: metric.weight,
            weightShare: 0,
            value: hasValue ? value : null,
            score: hasValue ? scoreOnCurve(metric.curve, value as number) : substitute,
            available: hasValue,
            requires: definition.requires,
          } satisfies HealthMetricResult;
        })
        .filter((metric): metric is HealthMetricResult => metric !== null);

      const scored = metrics.filter((metric) => metric.score !== null);
      const scoredWeight = scored.reduce((sum, metric) => sum + metric.weight, 0);
      const totalWeight = metrics.reduce((sum, metric) => sum + metric.weight, 0);

      for (const metric of metrics) {
        metric.weightShare =
          scoredWeight > 0 && metric.score !== null ? (metric.weight / scoredWeight) * 100 : 0;
      }

      const score =
        scoredWeight > 0
          ? scored.reduce((sum, metric) => sum + (metric.score as number) * metric.weight, 0) /
            scoredWeight
          : null;

      const availableWeight = metrics
        .filter((metric) => metric.available)
        .reduce((sum, metric) => sum + metric.weight, 0);

      return {
        key: pillar.key,
        label: healthPillarLabels[pillar.key],
        description: healthPillarDescriptions[pillar.key],
        weight: pillar.weight,
        weightShare: 0,
        score,
        coverage: totalWeight > 0 ? (availableWeight / totalWeight) * 100 : 0,
        metrics,
      } satisfies HealthPillarResult;
    });

  const scoredPillars = pillars.filter((pillar) => pillar.score !== null);
  const scoredPillarWeight = scoredPillars.reduce((sum, pillar) => sum + pillar.weight, 0);
  const totalPillarWeight = pillars.reduce((sum, pillar) => sum + pillar.weight, 0);

  for (const pillar of pillars) {
    pillar.weightShare =
      scoredPillarWeight > 0 && pillar.score !== null
        ? (pillar.weight / scoredPillarWeight) * 100
        : 0;
  }

  const rawScore =
    scoredPillarWeight > 0
      ? scoredPillars.reduce((sum, pillar) => sum + (pillar.score as number) * pillar.weight, 0) /
        scoredPillarWeight
      : 0;

  const coverage =
    totalPillarWeight > 0
      ? pillars.reduce((sum, pillar) => sum + (pillar.coverage / 100) * pillar.weight, 0) /
        totalPillarWeight *
        100
      : 0;

  // Thin data is docked here, on the total, so a company scored on two figures
  // cannot present the same confident grade as one scored on twenty.
  const penalty = config.coveragePenalty;
  const penalizedScore =
    penalty?.enabled
      ? rawScore * (1 - (penalty.strength / 100) * coverageShortfall(coverage, penalty.fullCoverageAt))
      : rawScore;

  const override = config.statusOverrides.find((entry) => entry.status === facts.status) ?? null;
  const cappedScore = override ? Math.min(penalizedScore, override.capScore) : penalizedScore;
  const score = Math.round(clampScore(cappedScore));

  const ratingBand = resolveBand(config.ratingBands, score);
  const riskBand = resolveBand(config.riskBands, score);

  const forcedRating = override?.forceGrade
    ? (config.ratingBands.find((band) => band.grade === override.forceGrade) ?? null)
    : null;
  const forcedRisk = override?.forceRiskLabel
    ? (config.riskBands.find((band) => band.label === override.forceRiskLabel) ?? null)
    : null;

  return {
    score,
    grade: forcedRating?.grade ?? override?.forceGrade ?? ratingBand?.grade ?? "–",
    gradeLabel: forcedRating?.label ?? ratingBand?.label ?? "Ukjent",
    gradeTone: forcedRating?.tone ?? (override ? "error" : (ratingBand?.tone ?? "neutral")),
    riskLabel: forcedRisk?.label ?? override?.forceRiskLabel ?? riskBand?.label ?? "Ukjent",
    riskTone: forcedRisk?.tone ?? (override ? "error" : (riskBand?.tone ?? "neutral")),
    coverage: Math.round(coverage),
    thinData: coverage < config.minimumCoverage,
    overrideApplied: override ? override.status : null,
    rawScore: Math.round(clampScore(rawScore)),
    coveragePenaltyPoints: Math.round(clampScore(rawScore) - clampScore(penalizedScore)),
    pillars,
  };
}

/** Convenience wrapper: build the facts and score them in one call. */
export function scoreCompanyHealth(
  input: HealthFactsInput,
  config: HealthScoreConfig,
): HealthScoreResult {
  return computeHealthScore(buildHealthFacts(input), config);
}

/* ── Formatting ───────────────────────────────────────────────────────────── */

/** Renders a raw metric value in its own unit, for the admin and the tooltip. */
export function formatHealthMetricValue(
  value: number | null,
  unit: HealthMetricUnit,
): string {
  if (value === null || !Number.isFinite(value)) return "Ikke tilgjengelig";
  const nb = (digits: number) =>
    new Intl.NumberFormat("nb-NO", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);

  switch (unit) {
    case "pct":
      return `${nb(1)} %`;
    case "ratio":
      return nb(2);
    case "years":
      return `${nb(0)} år`;
    case "nok":
      return new Intl.NumberFormat("nb-NO", {
        style: "currency",
        currency: "NOK",
        maximumFractionDigits: 0,
      }).format(value);
    default:
      return nb(1);
  }
}

/** Maps a tone to the design-system color token. */
export function healthToneColor(tone: HealthStatusTone): string {
  switch (tone) {
    case "success":
      return "var(--px-success)";
    case "warning":
      return "var(--px-warning)";
    case "error":
      return "var(--px-error)";
    default:
      return "var(--px-text)";
  }
}
