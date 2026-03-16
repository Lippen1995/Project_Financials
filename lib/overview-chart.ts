import { NormalizedCompany, NormalizedFinancialStatement } from "@/lib/types";

export type OverviewChartPoint = {
  fiscalYear: number;
  revenue: number | null;
  operatingProfit: number | null;
  operatingMargin: number | null;
  netIncome: number | null;
  equity: number | null;
};

export type OverviewSummaryMetric = {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
  meta?: string;
};

export type OverviewSummarySection = {
  activeYearLabel: string;
  primaryMetrics: OverviewSummaryMetric[];
  secondaryMetrics: OverviewSummaryMetric[];
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

export function formatAxisNok(value: number) {
  if (Math.abs(value) >= 1_000_000) {
    return `${new Intl.NumberFormat("nb-NO", {
      maximumFractionDigits: 1,
    }).format(value / 1_000_000)} mill. kr`;
  }

  if (Math.abs(value) >= 1_000) {
    return `${new Intl.NumberFormat("nb-NO", {
      maximumFractionDigits: 0,
    }).format(value / 1_000)}k kr`;
  }

  return `${new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: 0,
  }).format(value)} kr`;
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
        operatingMargin: calcMargin(
          toNumber(getAtPath(payload, "resultatregnskapResultat.driftsresultat.driftsresultat")) ??
            statement.operatingProfit ??
            null,
          toNumber(
            getAtPath(
              payload,
              "resultatregnskapResultat.driftsresultat.driftsinntekter.sumDriftsinntekter",
            ),
          ) ?? statement.revenue ?? null,
        ),
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
  selectedYear?: number | null,
): OverviewSummarySection {
  const points = getOverviewChartPoints(statements);
  const latest = points.at(-1) ?? null;
  const selected =
    (selectedYear !== null && selectedYear !== undefined
      ? points.find((point) => point.fiscalYear === selectedYear) ?? null
      : null) ?? latest;
  const selectedIndex = selected ? points.findIndex((point) => point.fiscalYear === selected.fiscalYear) : -1;
  const previous = selectedIndex > 0 ? points[selectedIndex - 1] : null;
  const revenueGrowth = calcGrowth(selected?.revenue ?? null, previous?.revenue ?? null);
  const ebitMargin = calcMargin(selected?.operatingProfit ?? null, selected?.revenue ?? null);
  const historyRange =
    points.length > 1 ? `${points[0].fiscalYear} - ${points[points.length - 1].fiscalYear}` : null;

  return {
    activeYearLabel: selected ? String(selected.fiscalYear) : "Ikke tilgjengelig",
    primaryMetrics: [
      {
        label: "Omsetning",
        value: formatCompactNok(selected?.revenue ?? null),
        meta: revenueGrowth !== null ? `${formatSignedPercent(revenueGrowth)} mot forrige år` : undefined,
        tone: revenueGrowth !== null && revenueGrowth < 0 ? "negative" : "default",
      },
      {
        label: "Driftsresultat (EBIT)",
        value: formatCompactNok(selected?.operatingProfit ?? null),
        meta: ebitMargin !== null ? `Margin ${formatSignedPercent(ebitMargin)}` : undefined,
        tone:
          selected && selected.operatingProfit !== null && selected.operatingProfit < 0
            ? "negative"
            : "default",
      },
      {
        label: "Årsresultat",
        value: formatCompactNok(selected?.netIncome ?? null),
        tone: selected && selected.netIncome !== null && selected.netIncome < 0 ? "negative" : "default",
      },
    ],
    secondaryMetrics: [
      {
        label: "Egenkapital",
        value: formatCompactNok(selected?.equity ?? null),
      },
      {
        label: "Siste årsregnskap",
        value: latest ? String(latest.fiscalYear) : "Ikke tilgjengelig",
        meta: company.lastSubmittedAnnualReportYear
          ? `Brreg registrert ${company.lastSubmittedAnnualReportYear}`
          : undefined,
      },
      {
        label: "Tilgjengelig historikk",
        value: points.length > 0 ? `${points.length} år` : "Ingen historikk",
        meta: historyRange ?? undefined,
      },
    ],
  };
}
