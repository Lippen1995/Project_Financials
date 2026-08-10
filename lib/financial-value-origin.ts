import type {
  FinancialValueOrigin,
  NormalizedFinancialLineItem,
  NormalizedFinancialStatement,
} from "@/lib/types";

export type FinancialHeadlineValueKey =
  | "revenue"
  | "operatingProfit"
  | "netIncome"
  | "equity"
  | "assets";

export type FinancialHeadlineOrigins = Record<
  FinancialHeadlineValueKey,
  FinancialValueOrigin | null
>;

type OriginLine = {
  conceptKey?: string | null;
  metricKey: string | null;
  value: number | bigint | null;
  valueOrigin?: FinancialValueOrigin;
  publicationSource?: NormalizedFinancialLineItem["publicationSource"];
};

const headlineBindings: Record<
  FinancialHeadlineValueKey,
  { conceptKey: string; metricKeys: string[] }
> = {
  revenue: {
    conceptKey: "OperatingIncomeTotal",
    metricKeys: ["total_operating_income", "total_operating_revenue"],
  },
  operatingProfit: {
    conceptKey: "OperatingResult",
    metricKeys: ["operating_profit", "ebit"],
  },
  netIncome: { conceptKey: "ProfitForPeriod", metricKeys: ["net_income"] },
  equity: { conceptKey: "EquityTotal", metricKeys: ["total_equity"] },
  assets: { conceptKey: "AssetsTotal", metricKeys: ["total_assets"] },
};

function lineOrigin(line: OriginLine | undefined): FinancialValueOrigin | null {
  if (!line) return null;
  if (line.valueOrigin) return line.valueOrigin;
  if (line.publicationSource) {
    return line.publicationSource === "FI_SIM" ? "synthetic" : "reported";
  }
  return null;
}

/** Resolve the provenance of the five headline values from the exact live lines behind them. */
export function financialHeadlineOrigins(lines: readonly OriginLine[]): FinancialHeadlineOrigins {
  return Object.fromEntries(
    Object.entries(headlineBindings).map(([headlineKey, binding]) => {
      const candidates = lines.filter(
        (line) =>
          line.value !== null &&
          (line.conceptKey === binding.conceptKey ||
            (line.metricKey !== null && binding.metricKeys.includes(line.metricKey))),
      );
      const exactConcept = candidates.find((line) => line.conceptKey === binding.conceptKey);
      return [headlineKey, lineOrigin(exactConcept ?? candidates[0])];
    }),
  ) as FinancialHeadlineOrigins;
}

export function financialHeadlineOriginsForStatement(
  statement: NormalizedFinancialStatement,
  lineItems: readonly NormalizedFinancialLineItem[],
) {
  const scope = statement.statementScope ?? "COMPANY";
  return financialHeadlineOrigins(
    lineItems.filter(
      (line) => line.fiscalYear === statement.fiscalYear && line.statementScope === scope,
    ),
  );
}

/** A derived figure is synthetic when any operand is synthetic. */
export function combineFinancialValueOrigins(
  ...origins: Array<FinancialValueOrigin | null | undefined>
): FinancialValueOrigin | null {
  if (origins.some((origin) => origin === "synthetic")) return "synthetic";
  if (origins.length > 0 && origins.every((origin) => origin === "reported")) return "reported";
  return null;
}
