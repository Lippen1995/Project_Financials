import { getHeadlineFinancialStatements } from "@/lib/financial-statements";
import { NormalizedFinancialStatement } from "@/lib/types";

/**
 * "abs" metrics are nominal amounts in NOK (rendered as bars / compact NOK);
 * "mar" metrics are ratios in percent (rendered as a line / "x %").
 */
export type OverviewMetricType = "abs" | "mar";

export type OverviewMetric = {
  key: string;
  label: string;
  type: OverviewMetricType;
  group: string;
  /** One value per entry in `years`, aligned by index. `null` = not available. */
  values: (number | null)[];
};

export type OverviewMetricSeries = {
  years: number[];
  metrics: OverviewMetric[];
};

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (
    numerator === null ||
    denominator === null ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return null;
  }
  return (numerator / denominator) * 100;
}

function num(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

/**
 * Builds the metric matrix that backs the overview earnings chart and table.
 *
 * Every value is computed strictly from the normalized headline statements —
 * no back-filled history and no estimated/derived figures (EBITDA, NIBD, ROCE,
 * liquidity, …) that the local data cannot support honestly. Metrics with no
 * value in any year are dropped; individual missing years stay `null` so the UI
 * can blank them rather than invent a number.
 */
export function getOverviewMetricSeries(
  statements: NormalizedFinancialStatement[],
): OverviewMetricSeries {
  const headline = getHeadlineFinancialStatements(statements)
    .slice()
    .sort((left, right) => left.fiscalYear - right.fiscalYear);

  const rows = headline
    .map((statement) => {
      const revenue = num(statement.revenue);
      const ebit = num(statement.operatingProfit);
      const net = num(statement.netIncome);
      const equity = num(statement.equity);
      const assets = num(statement.assets);
      const debt = assets !== null && equity !== null ? assets - equity : null;

      return {
        fiscalYear: statement.fiscalYear,
        revenue,
        ebit,
        net,
        equity,
        assets,
        debt,
        ebitMargin: ratio(ebit, revenue),
        netMargin: ratio(net, revenue),
        equityRatio: ratio(equity, assets),
        roe: ratio(net, equity),
      };
    })
    // Keep a year only if at least one base figure is present.
    .filter(
      (row) =>
        row.revenue !== null ||
        row.ebit !== null ||
        row.net !== null ||
        row.equity !== null ||
        row.assets !== null,
    );

  const years = rows.map((row) => row.fiscalYear);

  const definitions: Array<{
    key: string;
    label: string;
    type: OverviewMetricType;
    group: string;
    pick: (row: (typeof rows)[number]) => number | null;
  }> = [
    { key: "rev", label: "Driftsinntekter", type: "abs", group: "Resultat", pick: (r) => r.revenue },
    { key: "ebit", label: "Driftsresultat (EBIT)", type: "abs", group: "Resultat", pick: (r) => r.ebit },
    { key: "ebitM", label: "Driftsmargin", type: "mar", group: "Resultat", pick: (r) => r.ebitMargin },
    { key: "net", label: "Årsresultat", type: "abs", group: "Resultat", pick: (r) => r.net },
    { key: "netM", label: "Nettomargin", type: "mar", group: "Resultat", pick: (r) => r.netMargin },
    { key: "equity", label: "Egenkapital", type: "abs", group: "Balanse", pick: (r) => r.equity },
    { key: "assets", label: "Sum eiendeler", type: "abs", group: "Balanse", pick: (r) => r.assets },
    { key: "debt", label: "Gjeld", type: "abs", group: "Balanse", pick: (r) => r.debt },
    {
      key: "eqPct",
      label: "Egenkapitalandel",
      type: "mar",
      group: "Soliditet og avkastning",
      pick: (r) => r.equityRatio,
    },
    {
      key: "roe",
      label: "Egenkapitalavkastning",
      type: "mar",
      group: "Soliditet og avkastning",
      pick: (r) => r.roe,
    },
  ];

  const metrics = definitions
    .map((def) => ({
      key: def.key,
      label: def.label,
      type: def.type,
      group: def.group,
      values: rows.map((row) => def.pick(row)),
    }))
    // Drop metrics with no data in any year — never show an all-empty row.
    .filter((metric) => metric.values.some((value) => value !== null));

  return { years, metrics };
}

export function formatMetricPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Ikke tilgjengelig";
  }
  return `${new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)} %`;
}
