export const STRUCTURED_FINANCIAL_COVERAGE_REPORT_VERSION =
  "structured-financial-coverage@2";

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
  checkedAt?: Date;
  legalForm: string | null;
  companyStatus: string;
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
type AvailabilityRow<Key extends string> = Record<Key, string> & {
  checked: number;
  available: number;
  unavailable: number;
  stale: number;
  error: number;
  availabilityPercent: number;
};

export type StructuredFinancialCoverageSample = {
  profile: string;
  targetSize: number;
  selectedSize: number;
  shortfall: number;
  poolSize: number;
  poolFingerprint: string;
  selectionFingerprint: string;
  strata: Array<{
    id: string;
    label: string;
    target: number;
    available: number;
    selected: number;
  }>;
};

export type StructuredFinancialCoverageReport = {
  reportVersion: typeof STRUCTURED_FINANCIAL_COVERAGE_REPORT_VERSION;
  generatedAt: string;
  checkedCompanies: number;
  companiesWithStoredStatement: number;
  statusCounts: {
    available: number;
    unavailable: number;
    stale: number;
    error: number;
  };
  fieldCoverage: Record<
    FieldKey,
    { present: number; totalStatements: number; percent: number }
  >;
  fiscalYears: CountRow<"fiscalYear">[];
  layouts: CountRow<"layout">[];
  legalForms: CountRow<"legalForm">[];
  companyStatuses: CountRow<"companyStatus">[];
  availabilityByLegalForm: AvailabilityRow<"legalForm">[];
  availabilityByCompanyStatus: AvailabilityRow<"companyStatus">[];
  unavailableReasons: CountRow<"reason">[];
  sample: StructuredFinancialCoverageSample | null;
  sourceCheckWindow: { earliest: string; latest: string } | null;
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

function buildAvailabilityRows<Key extends string>(
  observations: StructuredFinancialCoverageObservation[],
  key: Key,
  selectValue: (observation: StructuredFinancialCoverageObservation) => string,
): AvailabilityRow<Key>[] {
  const grouped = new Map<string, StructuredFinancialCoverageObservation[]>();
  for (const observation of observations) {
    const value = selectValue(observation);
    grouped.set(value, [...(grouped.get(value) ?? []), observation]);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "nb-NO"))
    .map(([value, rows]) => {
      const available = rows.filter((row) => row.status === "AVAILABLE").length;
      return {
        [key]: value,
        checked: rows.length,
        available,
        unavailable: rows.filter((row) => row.status === "UNAVAILABLE").length,
        stale: rows.filter((row) => row.status === "STALE").length,
        error: rows.filter((row) => row.status === "ERROR").length,
        availabilityPercent: percentage(available, rows.length),
      } as AvailabilityRow<Key>;
    });
}

function readLayout(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object") return "ukjent";
  const layout = (rawPayload as Record<string, unknown>).oppstillingsplan;
  return typeof layout === "string" && layout.trim() ? layout : "ukjent";
}

export function buildStructuredFinancialCoverageReport(
  observations: StructuredFinancialCoverageObservation[],
  generatedAt = new Date(),
  sample: StructuredFinancialCoverageSample | null = null,
): StructuredFinancialCoverageReport {
  const statements = observations.flatMap((observation) =>
    observation.statement ? [observation.statement] : [],
  );
  const fiscalYears = new Map<string, number>();
  const layouts = new Map<string, number>();
  const legalForms = new Map<string, number>();
  const companyStatuses = new Map<string, number>();
  const unavailableReasons = new Map<string, number>();
  const checkedAtValues = observations
    .flatMap((observation) => (observation.checkedAt ? [observation.checkedAt] : []))
    .sort((left, right) => left.getTime() - right.getTime());

  for (const observation of observations) {
    increment(legalForms, observation.legalForm ?? "Ukjent");
    increment(companyStatuses, observation.companyStatus);
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
      stale: observations.filter((item) => item.status === "STALE").length,
      error: observations.filter((item) => item.status === "ERROR").length,
    },
    fieldCoverage,
    fiscalYears: sortedCountRows(fiscalYears, "fiscalYear"),
    layouts: sortedCountRows(layouts, "layout"),
    legalForms: sortedCountRows(legalForms, "legalForm"),
    companyStatuses: sortedCountRows(companyStatuses, "companyStatus"),
    availabilityByLegalForm: buildAvailabilityRows(
      observations,
      "legalForm",
      (observation) => observation.legalForm ?? "Ukjent",
    ),
    availabilityByCompanyStatus: buildAvailabilityRows(
      observations,
      "companyStatus",
      (observation) => observation.companyStatus,
    ),
    unavailableReasons: sortedCountRows(unavailableReasons, "reason"),
    sample,
    sourceCheckWindow:
      checkedAtValues.length > 0
        ? {
            earliest: checkedAtValues[0]!.toISOString(),
            latest: checkedAtValues[checkedAtValues.length - 1]!.toISOString(),
          }
        : null,
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
  const legalFormRows =
    report.availabilityByLegalForm.length > 0
      ? report.availabilityByLegalForm
          .map(
            (item) =>
              `| ${item.legalForm} | ${item.checked} | ${item.available} | ${item.unavailable} | ${item.stale} | ${item.error} | ${item.availabilityPercent.toLocaleString("nb-NO")} % |`,
          )
          .join("\n")
      : "| Ingen virksomheter | 0 | 0 | 0 | 0 | 0 | 0 % |";
  const companyStatusRows =
    report.availabilityByCompanyStatus.length > 0
      ? report.availabilityByCompanyStatus
          .map(
            (item) =>
              `| ${item.companyStatus} | ${item.checked} | ${item.available} | ${item.unavailable} | ${item.stale} | ${item.error} | ${item.availabilityPercent.toLocaleString("nb-NO")} % |`,
          )
          .join("\n")
      : "| Ingen virksomheter | 0 | 0 | 0 | 0 | 0 | 0 % |";
  const sampleSummary = report.sample
    ? `**Utvalgsprofil:** ${report.sample.profile}

**Mål / valgt / avvik:** ${report.sample.targetSize} / ${report.sample.selectedSize} / ${report.sample.shortfall}

**Poolstørrelse:** ${report.sample.poolSize}

**Poolfingeravtrykk:** ${report.sample.poolFingerprint}

**Utvalgsfingeravtrykk:** ${report.sample.selectionFingerprint}

| Stratum | Mål | Valgt |
| --- | ---: | ---: |
${report.sample.strata
  .map((stratum) => `| ${stratum.label} | ${stratum.target} | ${stratum.selected} |`)
  .join("\n")}`
    : "**Utvalgsprofil:** Alle virksomheter med registrert kildekontroll";
  const sourceCheckWindow = report.sourceCheckWindow
    ? `**Kildekontroller fra / til:** ${report.sourceCheckWindow.earliest} / ${report.sourceCheckWindow.latest}`
    : "**Kildekontroller fra / til:** Ingen registrerte kontroller";

  return `# Sprint 2 – dekning i åpent Brreg-regnskaps-API

**Rapportversjon:** ${report.reportVersion}

**Generert:** ${report.generatedAt}

${sampleSummary}

${sourceCheckWindow}

## Sammendrag

| Måling | Antall |
| --- | ---: |
| Kontrollerte virksomheter | ${report.checkedCompanies} |
| Tilgjengelig fra kilden | ${report.statusCounts.available} |
| Ikke tilgjengelig fra kilden | ${report.statusCounts.unavailable} |
| Utdatert etter kildefeil | ${report.statusCounts.stale} |
| Kilde-/kontraktfeil | ${report.statusCounts.error} |
| Virksomheter med lagret strukturert statement | ${report.companiesWithStoredStatement} |

## Utvalgsfordeling

### Organisasjonsform

| Organisasjonsform | Kontrollert | Tilgjengelig | Ikke tilgjengelig | Utdatert | Feil | Tilgjengelighet |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${legalFormRows}

### Virksomhetsstatus

| Status | Kontrollert | Tilgjengelig | Ikke tilgjengelig | Utdatert | Feil | Tilgjengelighet |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${companyStatusRows}

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
