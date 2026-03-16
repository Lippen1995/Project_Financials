import { NormalizedCompany, NormalizedFinancialStatement } from "@/lib/types";

export type OverviewChartPoint = {
  fiscalYear: number;
  revenue: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  equity: number | null;
};

export type OverviewSummaryMetric = {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
  meta?: string;
};

function getAtPath(payload: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, payload);
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const normalized = Number(value.replace(/\s+/g, "").replace(",", "."));
    return Number.isFinite(normalized) ? normalized : null;
  }

  return null;
}

export function formatCompactNok(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Ikke tilgjengelig";
  }

  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absolute >= 1_000_000_000) {
    return `${sign}${new Intl.NumberFormat("nb-NO", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(absolute / 1_000_000_000)} mrd. kr`;
  }

  if (absolute >= 1_000_000) {
    return `${sign}${new Intl.NumberFormat("nb-NO", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(absolute / 1_000_000)} mill. kr`;
  }

  if (absolute >= 1_000) {
    return `${sign}${new Intl.NumberFormat("nb-NO", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(absolute / 1_000)}k kr`;
  }

  return `${sign}${new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: 0,
  }).format(absolute)} kr`;
}

export function formatFullNok(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Ikke tilgjengelig";
  }

  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatSignedPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Ikke tilgjengelig";
  }

  return `${new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)} %`;
}

function calcMargin(numerator: number | null, denominator: number | null) {
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

function calcGrowth(current: number | null, previous: number | null) {
  if (
    current === null ||
    previous === null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return null;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

export function getOverviewChartPoints(statements: NormalizedFinancialStatement[]) {
  const points = statements
    .slice()
    .sort((left, right) => left.fiscalYear - right.fiscalYear)
    .map((statement) => {
      const payload = (statement.rawPayload ?? {}) as Record<string, unknown>;

      return {
        fiscalYear: statement.fiscalYear,
        revenue:
          toNumber(
            getAtPath(
              payload,
              "resultatregnskapResultat.driftsresultat.driftsinntekter.sumDriftsinntekter",
            ),
          ) ?? statement.revenue ?? null,
        operatingProfit:
          toNumber(getAtPath(payload, "resultatregnskapResultat.driftsresultat.driftsresultat")) ??
          statement.operatingProfit ??
          null,
        netIncome:
          toNumber(getAtPath(payload, "resultatregnskapResultat.aarsresultat")) ??
          statement.netIncome ??
          null,
        equity:
          toNumber(getAtPath(payload, "egenkapitalGjeld.egenkapital.sumEgenkapital")) ??
          statement.equity ??
          null,
      } satisfies OverviewChartPoint;
    })
    .filter((point) => point.revenue !== null || point.operatingProfit !== null);

  if (points.length <= 10) {
    return points;
  }

  return points.slice(-10);
}

export function getOverviewSummaryMetrics(
  company: NormalizedCompany,
  statements: NormalizedFinancialStatement[],
): OverviewSummaryMetric[] {
  const points = getOverviewChartPoints(statements);
  const latest = points.at(-1) ?? null;
  const previous = points.length > 1 ? points.at(-2) ?? null : null;
  const revenueGrowth = calcGrowth(latest?.revenue ?? null, previous?.revenue ?? null);
  const ebitMargin = calcMargin(latest?.operatingProfit ?? null, latest?.revenue ?? null);
  const historyRange =
    points.length > 1 ? `${points[0].fiscalYear} - ${points[points.length - 1].fiscalYear}` : null;

  return [
    {
      label: "Siste årsregnskap",
      value: latest ? String(latest.fiscalYear) : "Ikke tilgjengelig",
      meta: company.lastSubmittedAnnualReportYear
        ? `Brreg registrert ${company.lastSubmittedAnnualReportYear}`
        : undefined,
    },
    {
      label: "Omsetning",
      value: formatCompactNok(latest?.revenue ?? null),
      meta: revenueGrowth !== null ? `${formatSignedPercent(revenueGrowth)} mot forrige år` : undefined,
      tone: revenueGrowth !== null && revenueGrowth < 0 ? "negative" : "default",
    },
    {
      label: "Driftsresultat (EBIT)",
      value: formatCompactNok(latest?.operatingProfit ?? null),
      meta: ebitMargin !== null ? `Margin ${formatSignedPercent(ebitMargin)}` : undefined,
      tone:
        latest && latest.operatingProfit !== null && latest.operatingProfit < 0
          ? "negative"
          : "default",
    },
    {
      label: "Årsresultat",
      value: formatCompactNok(latest?.netIncome ?? null),
      tone: latest && latest.netIncome !== null && latest.netIncome < 0 ? "negative" : "default",
    },
    {
      label: "Egenkapital",
      value: formatCompactNok(latest?.equity ?? null),
    },
    {
      label: "Tilgjengelig historikk",
      value: points.length > 0 ? `${points.length} år` : "Ingen historikk",
      meta: historyRange ?? undefined,
    },
  ];
}
