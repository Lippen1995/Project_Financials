export const STRUCTURED_FINANCIAL_COVERAGE_REPORT_VERSION =
  "structured-financial-coverage@1";

const FIELD_KEYS = [
  "revenue",
  "operatingProfit",
  "netIncome",
  "equity",
  "assets",
] as const;

type FieldKey = (typeof FIELD_KEYS)[number];

export type StructuredFinancialCoverageObservation = {
  status: string;
  unavailableReason: string | null;
  latestFiscalYear: number | null;
  statement: {
    fiscalYear: number;
    revenue: bigint | null;
    operatingProfit: bigint | null;
    netIncome: bigint | null;
    equity: bigint | null;
    assets: bigint | null;
    rawPayload: unknown;
  } | null;
};

type CountRow<Key extends string> = Record<Key, string> & { count: number };

export type StructuredFinancialCoverageReport = {
  reportVersion: typeof STRUCTURED_FINANCIAL_COVERAGE_REPORT_VERSION;
  generatedAt: string;
  checkedCompanies: number;
  companiesWithStoredStatement: number;
  statusCounts: {
    available: number;
    unavailable: number;
    error: number;
  };
  fieldCoverage: Record<
    FieldKey,
    { present: number; totalStatements: number; percent: number }
  >;
  fiscalYears: CountRow<"fiscalYear">[];
  layouts: CountRow<"layout">[];
  unavailableReasons: CountRow<"reason">[];
};

function percentage(present: number, total: number) {
  if (total === 0) return 0;
  return Number(((present / total) * 100).toFixed(1));
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedCountRows<Key extends string>(
  values: Map<string, number>,
  key: Key,
): CountRow<Key>[] {
  return [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "nb-NO"))
    .map(([value, count]) => ({ [key]: value, count }) as CountRow<Key>);
}

function readLayout(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object") return "ukjent";
  const layout = (rawPayload as Record<string, unknown>).oppstillingsplan;
  return typeof layout === "string" && layout.trim() ? layout : "ukjent";
}

export function buildStructuredFinancialCoverageReport(
  observations: StructuredFinancialCoverageObservation[],
  generatedAt = new Date(),
): StructuredFinancialCoverageReport {
  const statements = observations.flatMap((observation) =>
    observation.statement ? [observation.statement] : [],
  );
  const fiscalYears = new Map<string, number>();
  const layouts = new Map<string, number>();
  const unavailableReasons = new Map<string, number>();

  for (const observation of observations) {
    if (observation.unavailableReason) {
      increment(unavailableReasons, observation.unavailableReason);
    }
    if (observation.statement) {
      increment(fiscalYears, String(observation.statement.fiscalYear));
      increment(layouts, readLayout(observation.statement.rawPayload));
    }
  }

  const fieldCoverage = Object.fromEntries(
    FIELD_KEYS.map((field) => {
      const present = statements.filter((statement) => statement[field] !== null).length;
      return [
        field,
        {
          present,
          totalStatements: statements.length,
          percent: percentage(present, statements.length),
        },
      ];
    }),
  ) as StructuredFinancialCoverageReport["fieldCoverage"];

  return {
    reportVersion: STRUCTURED_FINANCIAL_COVERAGE_REPORT_VERSION,
    generatedAt: generatedAt.toISOString(),
    checkedCompanies: observations.length,
    companiesWithStoredStatement: statements.length,
    statusCounts: {
      available: observations.filter((item) => item.status === "AVAILABLE").length,
      unavailable: observations.filter((item) => item.status === "UNAVAILABLE").length,
      error: observations.filter((item) => item.status === "ERROR").length,
    },
    fieldCoverage,
    fiscalYears: sortedCountRows(fiscalYears, "fiscalYear"),
    layouts: sortedCountRows(layouts, "layout"),
    unavailableReasons: sortedCountRows(unavailableReasons, "reason"),
  };
}

const FIELD_LABELS: Record<FieldKey, string> = {
  revenue: "Driftsinntekter",
  operatingProfit: "Driftsresultat",
  netIncome: "Årsresultat",
  equity: "Egenkapital",
  assets: "Sum eiendeler",
};

export function formatStructuredFinancialCoverageMarkdown(
  report: StructuredFinancialCoverageReport,
) {
  const fieldRows = FIELD_KEYS.map((field) => {
    const coverage = report.fieldCoverage[field];
    return `| ${FIELD_LABELS[field]} | ${coverage.present} / ${coverage.totalStatements} | ${coverage.percent.toLocaleString("nb-NO")} % |`;
  }).join("\n");
  const reasonRows =
    report.unavailableReasons.length > 0
      ? report.unavailableReasons
          .map((item) => `| ${item.reason} | ${item.count} |`)
          .join("\n")
      : "| Ingen registrerte årsaker | 0 |";
  const layoutRows =
    report.layouts.length > 0
      ? report.layouts
          .map((item) => `| ${item.layout} | ${item.count} |`)
          .join("\n")
      : "| Ingen lagrede oppstillingsplaner | 0 |";

  return `# Sprint 2 – dekning i åpent Brreg-regnskaps-API

**Rapportversjon:** ${report.reportVersion}

**Generert:** ${report.generatedAt}

## Sammendrag

| Måling | Antall |
| --- | ---: |
| Kontrollerte virksomheter | ${report.checkedCompanies} |
| Tilgjengelig fra kilden | ${report.statusCounts.available} |
| Ikke tilgjengelig fra kilden | ${report.statusCounts.unavailable} |
| Kilde-/kontraktfeil | ${report.statusCounts.error} |
| Virksomheter med lagret strukturert statement | ${report.companiesWithStoredStatement} |

## Feltdekning i lagrede statements

| Felt | Tilgjengelig | Dekning |
| --- | ---: | ---: |
${fieldRows}

## Oppstillingsplaner

| Oppstillingsplan | Antall |
| --- | ---: |
${layoutRows}

## Årsaker til manglende data

| Årsak | Antall |
| --- | ---: |
${reasonRows}

Rapporten inneholder ikke selskapsnavn eller syntetiske verdier. Den beskriver bare faktisk observerte svar og lagrede strukturerte Brreg-statements.
`;
}
