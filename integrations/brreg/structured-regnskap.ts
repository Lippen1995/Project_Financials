/**
 * Structured annual accounts from Regnskapsregisteret.
 *
 * `GET https://data.brreg.no/regnskapsregisteret/regnskap/{orgnr}` returns the
 * company's LATEST filed annual accounts as structured JSON — exact values in
 * whole NOK, no OCR involved. This is the authoritative source for the most
 * recent fiscal year; PDF extraction remains the source for historical years,
 * consolidated (konsern) figures, and as-reported line-item detail.
 *
 * Known limits observed against the live API:
 *  - Only the latest filing is returned (the `år` query parameter is ignored).
 *  - Konsern figures are not exposed; entries are SELSKAP scope.
 *  - Special layouts (banks/insurers, e.g. "SKADE") return HTTP 500 with an
 *    "oppstillingsplan som ikke er stottet" message.
 */

export type StructuredRegnskapEntry = {
  id?: number;
  journalnr?: string;
  regnskapstype?: string;
  virksomhet?: {
    organisasjonsnummer?: string;
    organisasjonsform?: string;
    morselskap?: boolean;
  };
  regnskapsperiode?: { fraDato?: string; tilDato?: string };
  valuta?: string;
  avviklingsregnskap?: boolean;
  oppstillingsplan?: string;
  egenkapitalGjeld?: {
    sumEgenkapitalGjeld?: number;
    egenkapital?: {
      sumEgenkapital?: number;
      opptjentEgenkapital?: { sumOpptjentEgenkapital?: number };
      innskuttEgenkapital?: { sumInnskuttEgenkaptial?: number; sumInnskuttEgenkapital?: number };
    };
    gjeldOversikt?: {
      sumGjeld?: number;
      kortsiktigGjeld?: { sumKortsiktigGjeld?: number };
      langsiktigGjeld?: { sumLangsiktigGjeld?: number };
    };
  };
  eiendeler?: {
    sumEiendeler?: number;
    omloepsmidler?: { sumOmloepsmidler?: number };
    anleggsmidler?: { sumAnleggsmidler?: number };
  };
  resultatregnskapResultat?: {
    ordinaertResultatFoerSkattekostnad?: number;
    aarsresultat?: number;
    totalresultat?: number;
    finansresultat?: {
      nettoFinans?: number;
      finansinntekt?: { sumFinansinntekter?: number };
      finanskostnad?: { sumFinanskostnad?: number };
    };
    driftsresultat?: {
      driftsresultat?: number;
      driftsinntekter?: { sumDriftsinntekter?: number };
      driftskostnad?: { sumDriftskostnad?: number };
    };
  };
};

export type StructuredAnnualAccounts = {
  fiscalYear: number;
  statementScope: "COMPANY" | "CONSOLIDATED";
  currency: string;
  isLiquidationAccounts: boolean;
  isParentCompany: boolean;
  oppstillingsplan: string | null;
  journalnr: string | null;
  sourceEntryId: number | null;
  /** Headline figures for FinancialStatement (whole NOK). */
  revenue: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  equity: number | null;
  assets: number | null;
  /** Exact values per canonical metric key — anchors for OCR validation and
   *  ML gold-set generation. Keys follow the annual-report taxonomy. */
  canonicalValues: Record<string, number>;
  rawEntry: StructuredRegnskapEntry;
};

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

/** JSON path → canonical metric key. Deterministic — no label matching. */
function collectCanonicalValues(entry: StructuredRegnskapEntry): Record<string, number> {
  const result: Record<string, number> = {};
  const put = (key: string, value: number | undefined) => {
    const parsed = asFiniteNumber(value);
    if (parsed !== null) result[key] = parsed;
  };

  const res = entry.resultatregnskapResultat;
  put("total_operating_income", res?.driftsresultat?.driftsinntekter?.sumDriftsinntekter);
  put("total_operating_expenses", res?.driftsresultat?.driftskostnad?.sumDriftskostnad);
  put("operating_profit", res?.driftsresultat?.driftsresultat);
  put("financial_income", res?.finansresultat?.finansinntekt?.sumFinansinntekter);
  put("financial_expense", res?.finansresultat?.finanskostnad?.sumFinanskostnad);
  put("net_financial_items", res?.finansresultat?.nettoFinans);
  put("profit_before_tax", res?.ordinaertResultatFoerSkattekostnad);
  put("net_income", res?.aarsresultat);

  const assets = entry.eiendeler;
  put("total_assets", assets?.sumEiendeler);
  put("current_assets", assets?.omloepsmidler?.sumOmloepsmidler);

  const ekGjeld = entry.egenkapitalGjeld;
  put("total_equity_and_liabilities", ekGjeld?.sumEgenkapitalGjeld);
  put("total_equity", ekGjeld?.egenkapital?.sumEgenkapital);
  put("retained_earnings", ekGjeld?.egenkapital?.opptjentEgenkapital?.sumOpptjentEgenkapital);
  put("total_liabilities", ekGjeld?.gjeldOversikt?.sumGjeld);
  put("current_liabilities", ekGjeld?.gjeldOversikt?.kortsiktigGjeld?.sumKortsiktigGjeld);
  put("long_term_liabilities", ekGjeld?.gjeldOversikt?.langsiktigGjeld?.sumLangsiktigGjeld);

  return result;
}

export function mapStructuredRegnskapEntry(
  entry: StructuredRegnskapEntry,
): StructuredAnnualAccounts | null {
  const tilDato = entry.regnskapsperiode?.tilDato;
  const fiscalYear = tilDato ? Number(tilDato.slice(0, 4)) : NaN;
  if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 2100) {
    return null;
  }

  const canonicalValues = collectCanonicalValues(entry);

  return {
    fiscalYear,
    statementScope: entry.regnskapstype === "KONSERN" ? "CONSOLIDATED" : "COMPANY",
    currency: entry.valuta ?? "NOK",
    isLiquidationAccounts: entry.avviklingsregnskap === true,
    isParentCompany: entry.virksomhet?.morselskap === true,
    oppstillingsplan: entry.oppstillingsplan ?? null,
    journalnr: entry.journalnr ?? null,
    sourceEntryId: typeof entry.id === "number" ? entry.id : null,
    revenue: asFiniteNumber(
      entry.resultatregnskapResultat?.driftsresultat?.driftsinntekter?.sumDriftsinntekter,
    ),
    operatingProfit: asFiniteNumber(
      entry.resultatregnskapResultat?.driftsresultat?.driftsresultat,
    ),
    netIncome: asFiniteNumber(entry.resultatregnskapResultat?.aarsresultat),
    equity: asFiniteNumber(entry.egenkapitalGjeld?.egenkapital?.sumEgenkapital),
    assets: asFiniteNumber(entry.eiendeler?.sumEiendeler),
    canonicalValues,
    rawEntry: entry,
  };
}

export function mapStructuredRegnskapResponse(
  payload: unknown,
): StructuredAnnualAccounts[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((entry) => mapStructuredRegnskapEntry(entry as StructuredRegnskapEntry))
    .filter((mapped): mapped is StructuredAnnualAccounts => mapped !== null);
}
