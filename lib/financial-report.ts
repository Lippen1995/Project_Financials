import {
  NormalizedFinancialDocument,
  NormalizedFinancialStatement,
} from "@/lib/types";

export type FinancialStatementType = "income" | "balance";
export type FinancialValueMode = "amount" | "margin" | "growth";
export type FinancialDensityMode = "main" | "all";
export type FinancialRowType = "normal" | "subtotal" | "key_metric" | "total";

export type FinancialReportRow = {
  label: string;
  key: string;
  section: string;
  statement: FinancialStatementType;
  type: FinancialRowType;
  visibility: "main" | "detail";
  parentKey?: string;
  accessor: (payload: Record<string, unknown>) => number | null;
};

export type FinancialSection = {
  key: string;
  statement: FinancialStatementType;
  title: string;
};

export type BalanceValidation = {
  balanced: boolean;
  difference: number | null;
};

export type FinancialReportDataset = {
  years: number[];
  currency: string;
  valuesByYear: Record<number, Record<string, number | null>>;
  reliableKeysByYear: Record<number, Set<string>>;
  latestYearByStatement: Partial<Record<FinancialStatementType, number>>;
  balanceValidationByYear: Record<number, BalanceValidation>;
};

const EMPTY = "—";
const BALANCE_TOLERANCE = 1;

function approximatelyEqual(left: number | null, right: number | null, tolerance = BALANCE_TOLERANCE) {
  if (left === null || right === null) {
    return false;
  }

  return Math.abs(left - right) <= tolerance;
}

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

function firstNumber(payload: Record<string, unknown>, paths: string[]) {
  for (const path of paths) {
    const value = toNumber(getAtPath(payload, path));
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function sumDefined(values: Array<number | null>) {
  const populated = values.filter((value): value is number => value !== null);
  if (populated.length === 0) {
    return null;
  }

  return populated.reduce((sum, value) => sum + value, 0);
}

function createAccessor(paths: string[], fallback?: (payload: Record<string, unknown>) => number | null) {
  return (payload: Record<string, unknown>) => {
    const directValue = firstNumber(payload, paths);
    if (directValue !== null) {
      return directValue;
    }

    return fallback ? fallback(payload) : null;
  };
}

function incomeValue(key: string) {
  return financialReportRows.find((row) => row.key === key)?.accessor ?? (() => null);
}

const financialSections: FinancialSection[] = [
  { key: "income_revenue", statement: "income", title: "DRIFTSINNTEKTER" },
  { key: "income_costs", statement: "income", title: "DRIFTSKOSTNADER" },
  { key: "income_ebit", statement: "income", title: "DRIFTSRESULTAT" },
  { key: "income_finance", statement: "income", title: "FINANS" },
  { key: "income_result", statement: "income", title: "RESULTAT" },
  { key: "balance_fixed_assets", statement: "balance", title: "ANLEGGSMIDLER" },
  { key: "balance_current_assets", statement: "balance", title: "OMLØPSMIDLER" },
  { key: "balance_assets_total", statement: "balance", title: "EIENDELER" },
  { key: "balance_equity", statement: "balance", title: "EGENKAPITAL" },
  { key: "balance_long_term_debt", statement: "balance", title: "LANGSIKTIG GJELD" },
  { key: "balance_short_term_debt", statement: "balance", title: "KORTSIKTIG GJELD" },
  {
    key: "balance_equity_and_liabilities_total",
    statement: "balance",
    title: "EGENKAPITAL OG GJELD",
  },
];

export const financialReportRows: FinancialReportRow[] = [
  {
    label: "Salgsinntekter",
    key: "sales_revenue",
    section: "income_revenue",
    statement: "income",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor(["resultatregnskapResultat.driftsresultat.driftsinntekter.salgsinntekter"]),
  },
  {
    label: "Andre driftsinntekter",
    key: "other_operating_revenue",
    section: "income_revenue",
    statement: "income",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor(
      [
        "resultatregnskapResultat.driftsresultat.driftsinntekter.andreDriftsinntekter",
        "resultatregnskapResultat.driftsresultat.driftsinntekter.annenDriftsinntekt",
      ],
      (payload) => {
        const total = firstNumber(payload, [
          "resultatregnskapResultat.driftsresultat.driftsinntekter.sumDriftsinntekter",
        ]);
        const sales = firstNumber(payload, [
          "resultatregnskapResultat.driftsresultat.driftsinntekter.salgsinntekter",
        ]);

        if (total === null || sales === null) {
          return null;
        }

        return total - sales;
      },
    ),
  },
  {
    label: "Sum driftsinntekter",
    key: "total_operating_revenue",
    section: "income_revenue",
    statement: "income",
    type: "subtotal",
    visibility: "main",
    accessor: createAccessor(
      ["resultatregnskapResultat.driftsresultat.driftsinntekter.sumDriftsinntekter"],
      (payload) =>
        sumDefined([
          incomeValue("sales_revenue")(payload),
          incomeValue("other_operating_revenue")(payload),
        ]),
    ),
  },
  {
    label: "Varekostnad",
    key: "cost_of_goods_sold",
    section: "income_costs",
    statement: "income",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor(["resultatregnskapResultat.driftsresultat.driftskostnad.varekostnad"]),
  },
  {
    label: "Lønnskostnader",
    key: "salary_costs",
    section: "income_costs",
    statement: "income",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor(["resultatregnskapResultat.driftsresultat.driftskostnad.loennskostnad"]),
  },
  {
    label: "Andre driftskostnader",
    key: "other_operating_costs",
    section: "income_costs",
    statement: "income",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor(["resultatregnskapResultat.driftsresultat.driftskostnad.annenDriftskostnad"]),
  },
  {
    label: "Avskrivninger",
    key: "depreciation",
    section: "income_costs",
    statement: "income",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor([
      "resultatregnskapResultat.driftsresultat.driftskostnad.avskrivning",
      "resultatregnskapResultat.driftsresultat.driftskostnad.avskrivninger",
      "resultatregnskapResultat.driftsresultat.driftskostnad.avskrivningPaaVarigeDriftsmidlerOgImmaterielleEiendeler",
    ]),
  },
  {
    label: "Sum driftskostnader",
    key: "total_operating_costs",
    section: "income_costs",
    statement: "income",
    type: "subtotal",
    visibility: "detail",
    accessor: createAccessor(
      ["resultatregnskapResultat.driftsresultat.driftskostnad.sumDriftskostnad"],
      (payload) =>
        sumDefined([
          incomeValue("cost_of_goods_sold")(payload),
          incomeValue("salary_costs")(payload),
          incomeValue("other_operating_costs")(payload),
          incomeValue("depreciation")(payload),
        ]),
    ),
  },
  {
    label: "Driftsresultat (EBIT)",
    key: "ebit",
    section: "income_ebit",
    statement: "income",
    type: "key_metric",
    visibility: "main",
    accessor: createAccessor(
      ["resultatregnskapResultat.driftsresultat.driftsresultat"],
      (payload) => {
        const revenue = incomeValue("total_operating_revenue")(payload);
        const costs = incomeValue("total_operating_costs")(payload);

        if (revenue === null || costs === null) {
          return null;
        }

        return revenue - costs;
      },
    ),
  },
  {
    label: "Renteinntekt fra tilknyttet selskap",
    key: "interest_income_related_party",
    section: "income_finance",
    statement: "income",
    type: "normal",
    visibility: "detail",
    parentKey: "financial_income",
    accessor: createAccessor([
      "resultatregnskapResultat.finansresultat.finansinntekt.renteinntektTilknyttetSelskap",
    ]),
  },
  {
    label: "Annen renteinntekt",
    key: "other_interest_income",
    section: "income_finance",
    statement: "income",
    type: "normal",
    visibility: "detail",
    parentKey: "financial_income",
    accessor: createAccessor([
      "resultatregnskapResultat.finansresultat.finansinntekt.annenRenteinntekt",
    ]),
  },
  {
    label: "Annen finansinntekt",
    key: "other_financial_income",
    section: "income_finance",
    statement: "income",
    type: "normal",
    visibility: "detail",
    parentKey: "financial_income",
    accessor: createAccessor([
      "resultatregnskapResultat.finansresultat.finansinntekt.annenFinansinntekt",
    ]),
  },
  {
    label: "Finansinntekter",
    key: "financial_income",
    section: "income_finance",
    statement: "income",
    type: "subtotal",
    visibility: "detail",
    accessor: createAccessor(
      ["resultatregnskapResultat.finansresultat.finansinntekt.sumFinansinntekter"],
      (payload) =>
        sumDefined([
          incomeValue("interest_income_related_party")(payload),
          incomeValue("other_interest_income")(payload),
          incomeValue("other_financial_income")(payload),
        ]),
    ),
  },
  {
    label: "Rentekostnad til tilknyttet selskap",
    key: "interest_cost_related_party",
    section: "income_finance",
    statement: "income",
    type: "normal",
    visibility: "detail",
    parentKey: "financial_costs",
    accessor: createAccessor([
      "resultatregnskapResultat.finansresultat.finanskostnad.rentekostnadTilknyttetSelskap",
    ]),
  },
  {
    label: "Annen rentekostnad",
    key: "other_interest_cost",
    section: "income_finance",
    statement: "income",
    type: "normal",
    visibility: "detail",
    parentKey: "financial_costs",
    accessor: createAccessor([
      "resultatregnskapResultat.finansresultat.finanskostnad.annenRentekostnad",
    ]),
  },
  {
    label: "Annen finanskostnad",
    key: "other_financial_cost",
    section: "income_finance",
    statement: "income",
    type: "normal",
    visibility: "detail",
    parentKey: "financial_costs",
    accessor: createAccessor([
      "resultatregnskapResultat.finansresultat.finanskostnad.annenFinanskostnad",
    ]),
  },
  {
    label: "Finanskostnader",
    key: "financial_costs",
    section: "income_finance",
    statement: "income",
    type: "subtotal",
    visibility: "detail",
    accessor: createAccessor(
      ["resultatregnskapResultat.finansresultat.finanskostnad.sumFinanskostnad"],
      (payload) =>
        sumDefined([
          incomeValue("interest_cost_related_party")(payload),
          incomeValue("other_interest_cost")(payload),
          incomeValue("other_financial_cost")(payload),
        ]),
    ),
  },
  {
    label: "Netto finans",
    key: "net_finance",
    section: "income_finance",
    statement: "income",
    type: "key_metric",
    visibility: "main",
    accessor: createAccessor(
      ["resultatregnskapResultat.finansresultat.nettoFinans"],
      (payload) => {
        const income = incomeValue("financial_income")(payload);
        const cost = incomeValue("financial_costs")(payload);

        if (income === null || cost === null) {
          return null;
        }

        return income - cost;
      },
    ),
  },
  {
    label: "Resultat før skatt",
    key: "profit_before_tax",
    section: "income_result",
    statement: "income",
    type: "key_metric",
    visibility: "main",
    accessor: createAccessor(
      ["resultatregnskapResultat.ordinaertResultatFoerSkattekostnad"],
      (payload) => {
        const ebit = incomeValue("ebit")(payload);
        const netFinance = incomeValue("net_finance")(payload);

        if (ebit === null || netFinance === null) {
          return null;
        }

        return ebit + netFinance;
      },
    ),
  },
  {
    label: "Skattekostnad på resultat",
    key: "tax_expense",
    section: "income_result",
    statement: "income",
    type: "normal",
    visibility: "main",
    accessor: createAccessor(["resultatregnskapResultat.skattekostnadResultat"]),
  },
  {
    label: "Årsresultat",
    key: "net_income",
    section: "income_result",
    statement: "income",
    type: "total",
    visibility: "main",
    accessor: createAccessor([
      "resultatregnskapResultat.aarsresultat",
      "resultatregnskapResultat.ordinaertResultatEtterSkattekostnad",
    ]),
  },
  {
    label: "Immaterielle eiendeler",
    key: "intangible_assets",
    section: "balance_fixed_assets",
    statement: "balance",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor([
      "eiendeler.anleggsmidler.immaterielleEiendeler",
      "eiendeler.anleggsmidler.sumImmaterielleEiendeler",
    ]),
  },
  {
    label: "Varige driftsmidler",
    key: "tangible_assets",
    section: "balance_fixed_assets",
    statement: "balance",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor([
      "eiendeler.anleggsmidler.varigeDriftsmidler",
      "eiendeler.anleggsmidler.sumVarigeDriftsmidler",
    ]),
  },
  {
    label: "Finansielle anleggsmidler",
    key: "financial_fixed_assets",
    section: "balance_fixed_assets",
    statement: "balance",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor([
      "eiendeler.anleggsmidler.finansielleAnleggsmidler",
      "eiendeler.anleggsmidler.sumFinansielleAnleggsmidler",
    ]),
  },
  {
    label: "Sum anleggsmidler",
    key: "total_fixed_assets",
    section: "balance_fixed_assets",
    statement: "balance",
    type: "subtotal",
    visibility: "main",
    accessor: createAccessor(
      ["eiendeler.anleggsmidler.sumAnleggsmidler"],
      (payload) =>
        sumDefined([
          firstNumber(payload, [
            "eiendeler.anleggsmidler.immaterielleEiendeler",
            "eiendeler.anleggsmidler.sumImmaterielleEiendeler",
          ]),
          firstNumber(payload, [
            "eiendeler.anleggsmidler.varigeDriftsmidler",
            "eiendeler.anleggsmidler.sumVarigeDriftsmidler",
          ]),
          firstNumber(payload, [
            "eiendeler.anleggsmidler.finansielleAnleggsmidler",
            "eiendeler.anleggsmidler.sumFinansielleAnleggsmidler",
          ]),
        ]),
    ),
  },
  {
    label: "Varelager",
    key: "inventory",
    section: "balance_current_assets",
    statement: "balance",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor(["eiendeler.sumVarer", "eiendeler.omloepsmidler.varer"]),
  },
  {
    label: "Kundefordringer",
    key: "accounts_receivable",
    section: "balance_current_assets",
    statement: "balance",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor(["eiendeler.kundefordringer"]),
  },
  {
    label: "Andre kortsiktige fordringer",
    key: "other_short_term_receivables",
    section: "balance_current_assets",
    statement: "balance",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor(["eiendeler.andreKortsiktigeFordringer"]),
  },
  {
    label: "Konsernfordringer",
    key: "intercompany_receivables",
    section: "balance_current_assets",
    statement: "balance",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor(["eiendeler.konsernfordringer", "eiendeler.kundefordringerKonsern"]),
  },
  {
    label: "Sum fordringer",
    key: "total_receivables",
    section: "balance_current_assets",
    statement: "balance",
    type: "subtotal",
    visibility: "detail",
    accessor: createAccessor(
      ["eiendeler.sumFordringer"],
      (payload) =>
        sumDefined([
          firstNumber(payload, ["eiendeler.kundefordringer"]),
          firstNumber(payload, ["eiendeler.andreKortsiktigeFordringer"]),
          firstNumber(payload, ["eiendeler.konsernfordringer", "eiendeler.kundefordringerKonsern"]),
        ]),
    ),
  },
  {
    label: "Bankinnskudd, kontanter o.l.",
    key: "cash_and_equivalents",
    section: "balance_current_assets",
    statement: "balance",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor(["eiendeler.sumBankinnskuddOgKontanter"]),
  },
  {
    label: "Sum omløpsmidler",
    key: "total_current_assets",
    section: "balance_current_assets",
    statement: "balance",
    type: "subtotal",
    visibility: "main",
    accessor: createAccessor(
      ["eiendeler.omloepsmidler.sumOmloepsmidler"],
      (payload) =>
        sumDefined([
          firstNumber(payload, ["eiendeler.sumVarer", "eiendeler.omloepsmidler.varer"]),
          firstNumber(payload, ["eiendeler.sumFordringer"]),
          firstNumber(payload, ["eiendeler.sumBankinnskuddOgKontanter"]),
        ]),
    ),
  },
  {
    label: "Sum eiendeler",
    key: "total_assets",
    section: "balance_assets_total",
    statement: "balance",
    type: "total",
    visibility: "main",
    accessor: createAccessor(
      ["eiendeler.sumEiendeler"],
      (payload) =>
        sumDefined([
          firstNumber(payload, ["eiendeler.anleggsmidler.sumAnleggsmidler"]),
          firstNumber(payload, ["eiendeler.omloepsmidler.sumOmloepsmidler"]),
        ]),
    ),
  },
  {
    label: "Innskutt egenkapital",
    key: "paid_in_equity",
    section: "balance_equity",
    statement: "balance",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor(
      ["egenkapitalGjeld.egenkapital.innskuttEgenkapital.sumInnskuttEgenkaptial"],
      (payload) =>
        sumDefined([
          firstNumber(payload, ["egenkapitalGjeld.egenkapital.innskuttEgenkapital.aksjekapital"]),
          firstNumber(payload, ["egenkapitalGjeld.egenkapital.innskuttEgenkapital.overkurs"]),
          firstNumber(payload, [
            "egenkapitalGjeld.egenkapital.innskuttEgenkapital.annenInnskuttEgenkapital",
          ]),
        ]),
    ),
  },
  {
    label: "Opptjent egenkapital",
    key: "retained_earnings",
    section: "balance_equity",
    statement: "balance",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor(
      ["egenkapitalGjeld.egenkapital.opptjentEgenkapital.sumOpptjentEgenkapital"],
      (payload) =>
        sumDefined([
          firstNumber(payload, ["egenkapitalGjeld.egenkapital.opptjentEgenkapital.annenEgenkapital"]),
        ]),
    ),
  },
  {
    label: "Sum egenkapital",
    key: "total_equity",
    section: "balance_equity",
    statement: "balance",
    type: "subtotal",
    visibility: "main",
    accessor: createAccessor(
      ["egenkapitalGjeld.egenkapital.sumEgenkapital"],
      (payload) =>
        sumDefined([
          firstNumber(payload, [
            "egenkapitalGjeld.egenkapital.innskuttEgenkapital.sumInnskuttEgenkaptial",
          ]),
          firstNumber(payload, [
            "egenkapitalGjeld.egenkapital.opptjentEgenkapital.sumOpptjentEgenkapital",
          ]),
        ]),
    ),
  },
  {
    label: "Langsiktig gjeld",
    key: "long_term_debt",
    section: "balance_long_term_debt",
    statement: "balance",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor([
      "egenkapitalGjeld.gjeldOversikt.langsiktigGjeld.gjeldTilKredittinstitusjoner",
      "egenkapitalGjeld.gjeldOversikt.langsiktigGjeld.langsiktigGjeld",
    ]),
  },
  {
    label: "Avsetninger for forpliktelser",
    key: "provisions",
    section: "balance_long_term_debt",
    statement: "balance",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor([
      "egenkapitalGjeld.gjeldOversikt.langsiktigGjeld.avsetningerForForpliktelser",
    ]),
  },
  {
    label: "Sum langsiktig gjeld",
    key: "total_long_term_debt",
    section: "balance_long_term_debt",
    statement: "balance",
    type: "subtotal",
    visibility: "main",
    accessor: createAccessor(
      ["egenkapitalGjeld.gjeldOversikt.langsiktigGjeld.sumLangsiktigGjeld"],
      (payload) =>
        sumDefined([
          firstNumber(payload, [
            "egenkapitalGjeld.gjeldOversikt.langsiktigGjeld.gjeldTilKredittinstitusjoner",
            "egenkapitalGjeld.gjeldOversikt.langsiktigGjeld.langsiktigGjeld",
          ]),
          firstNumber(payload, [
            "egenkapitalGjeld.gjeldOversikt.langsiktigGjeld.avsetningerForForpliktelser",
          ]),
        ]),
    ),
  },
  {
    label: "Leverandørgjeld",
    key: "supplier_debt",
    section: "balance_short_term_debt",
    statement: "balance",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor(["egenkapitalGjeld.gjeldOversikt.kortsiktigGjeld.leverandorgjeld"]),
  },
  {
    label: "Betalbar skatt",
    key: "tax_payable",
    section: "balance_short_term_debt",
    statement: "balance",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor(["egenkapitalGjeld.gjeldOversikt.kortsiktigGjeld.betalbarSkatt"]),
  },
  {
    label: "Skyldige offentlige avgifter",
    key: "public_charges",
    section: "balance_short_term_debt",
    statement: "balance",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor(["egenkapitalGjeld.gjeldOversikt.kortsiktigGjeld.skyldigOffentligeAvgifter"]),
  },
  {
    label: "Utbytte",
    key: "dividend_liability",
    section: "balance_short_term_debt",
    statement: "balance",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor(["egenkapitalGjeld.gjeldOversikt.kortsiktigGjeld.utbytte"]),
  },
  {
    label: "Annen kortsiktig gjeld",
    key: "other_short_term_debt",
    section: "balance_short_term_debt",
    statement: "balance",
    type: "normal",
    visibility: "detail",
    accessor: createAccessor(["egenkapitalGjeld.gjeldOversikt.kortsiktigGjeld.annenKortsiktigGjeld"]),
  },
  {
    label: "Sum kortsiktig gjeld",
    key: "total_short_term_debt",
    section: "balance_short_term_debt",
    statement: "balance",
    type: "subtotal",
    visibility: "main",
    accessor: createAccessor(
      ["egenkapitalGjeld.gjeldOversikt.kortsiktigGjeld.sumKortsiktigGjeld"],
      (payload) =>
        sumDefined([
          firstNumber(payload, ["egenkapitalGjeld.gjeldOversikt.kortsiktigGjeld.leverandorgjeld"]),
          firstNumber(payload, ["egenkapitalGjeld.gjeldOversikt.kortsiktigGjeld.betalbarSkatt"]),
          firstNumber(payload, ["egenkapitalGjeld.gjeldOversikt.kortsiktigGjeld.skyldigOffentligeAvgifter"]),
          firstNumber(payload, ["egenkapitalGjeld.gjeldOversikt.kortsiktigGjeld.utbytte"]),
          firstNumber(payload, [
            "egenkapitalGjeld.gjeldOversikt.kortsiktigGjeld.annenKortsiktigGjeld",
          ]),
        ]),
    ),
  },
  {
    label: "Sum egenkapital og gjeld",
    key: "total_equity_and_liabilities",
    section: "balance_equity_and_liabilities_total",
    statement: "balance",
    type: "total",
    visibility: "main",
    accessor: createAccessor(
      ["egenkapitalGjeld.sumEgenkapitalGjeld"],
      (payload) =>
        sumDefined([
          firstNumber(payload, ["egenkapitalGjeld.egenkapital.sumEgenkapital"]),
          firstNumber(payload, ["egenkapitalGjeld.gjeldOversikt.langsiktigGjeld.sumLangsiktigGjeld"]),
          firstNumber(payload, ["egenkapitalGjeld.gjeldOversikt.kortsiktigGjeld.sumKortsiktigGjeld"]),
        ]),
    ),
  },
];

export function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EMPTY;
  }

  return new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    useGrouping: true,
  })
    .format(value)
    .replace(/\u00A0/g, " ");
}

export function formatCompactCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EMPTY;
  }

  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) {
    return `${new Intl.NumberFormat("nb-NO", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
      .format(value / 1_000_000_000)
      .replace(/\u00A0/g, " ")} mrd. NOK`;
  }

  return `${new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
    .format(value / 1_000_000)
    .replace(/\u00A0/g, " ")} MNOK`;
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EMPTY;
  }

  return `${new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
    .format(value)
    .replace(/\u00A0/g, " ")} %`;
}

export function calculateGrowth(current: number | null, previous: number | null) {
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

export function calculateIncomeStatementMargin(value: number | null, revenue: number | null) {
  if (
    value === null ||
    revenue === null ||
    !Number.isFinite(value) ||
    !Number.isFinite(revenue) ||
    revenue === 0
  ) {
    return null;
  }

  return (value / revenue) * 100;
}

export function calculateBalanceShare(value: number | null, totalAssets: number | null) {
  if (
    value === null ||
    totalAssets === null ||
    !Number.isFinite(value) ||
    !Number.isFinite(totalAssets) ||
    totalAssets === 0
  ) {
    return null;
  }

  return (value / totalAssets) * 100;
}

export function getVisibleRows(
  statement: FinancialStatementType,
  densityMode: FinancialDensityMode,
) {
  return financialReportRows.filter(
    (row) =>
      row.statement === statement &&
      !row.parentKey &&
      (densityMode === "all" || row.visibility === "main"),
  );
}

export function getChildRows(parentKey: string) {
  return financialReportRows.filter((row) => row.parentKey === parentKey);
}

export function getDisplayValue(
  row: FinancialReportRow,
  year: number,
  mode: FinancialValueMode,
  dataset: FinancialReportDataset,
) {
  const current = dataset.valuesByYear[year]?.[row.key] ?? null;

  if (mode === "amount") {
    return current;
  }

  if (mode === "growth") {
    const index = dataset.years.indexOf(year);
    const previousYear = index > 0 ? dataset.years[index - 1] : null;
    const previous = previousYear ? dataset.valuesByYear[previousYear]?.[row.key] ?? null : null;
    return calculateGrowth(current, previous);
  }

  if (row.statement === "income") {
    const revenue = dataset.valuesByYear[year]?.total_operating_revenue ?? null;
    return calculateIncomeStatementMargin(current, revenue);
  }

  const totalAssets = dataset.valuesByYear[year]?.total_assets ?? null;
  return calculateBalanceShare(current, totalAssets);
}

function extractYear(statement: NormalizedFinancialStatement) {
  const payload = (statement.rawPayload ?? {}) as Record<string, unknown>;
  const periodEnd = getAtPath(payload, "regnskapsperiode.tilDato");

  if (typeof periodEnd === "string") {
    const parsed = new Date(periodEnd);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getFullYear();
    }
  }

  return statement.fiscalYear;
}

function latestYearForStatement(statement: FinancialStatementType, years: number[], valuesByYear: FinancialReportDataset["valuesByYear"]) {
  const candidateRows = financialReportRows.filter((row) => row.statement === statement);
  const matchingYear = [...years].reverse().find((year) =>
    candidateRows.some((row) => valuesByYear[year]?.[row.key] !== null),
  );

  return matchingYear;
}

function markReliable(set: Set<string>, keys: string[]) {
  for (const key of keys) {
    set.add(key);
  }
}

function computeReliableBalanceKeys(values: Record<string, number | null>) {
  const reliable = new Set<string>([
    "total_assets",
    "total_equity_and_liabilities",
    "total_equity",
    "total_long_term_debt",
    "total_short_term_debt",
    "total_current_assets",
    "total_fixed_assets",
    "paid_in_equity",
    "retained_earnings",
  ]);

  if (approximatelyEqual(values.total_assets, values.total_equity_and_liabilities)) {
    markReliable(reliable, ["total_assets", "total_equity_and_liabilities"]);
  }

  if (
    approximatelyEqual(
      values.total_receivables ?? null,
      sumDefined([
        values.accounts_receivable ?? null,
        values.other_short_term_receivables ?? null,
        values.intercompany_receivables ?? null,
      ]),
    )
  ) {
    markReliable(reliable, [
      "total_receivables",
      "accounts_receivable",
      "other_short_term_receivables",
      "intercompany_receivables",
    ]);
  }

  if (
    approximatelyEqual(
      values.total_current_assets ?? null,
      sumDefined([
        values.inventory ?? null,
        values.total_receivables ?? null,
        values.cash_and_equivalents ?? null,
      ]),
    )
  ) {
    markReliable(reliable, [
      "total_current_assets",
      "inventory",
      "total_receivables",
      "cash_and_equivalents",
    ]);
  }

  if (
    approximatelyEqual(
      values.total_equity ?? null,
      sumDefined([values.paid_in_equity ?? null, values.retained_earnings ?? null]),
    )
  ) {
    markReliable(reliable, ["total_equity", "paid_in_equity", "retained_earnings"]);
  }

  if (
    approximatelyEqual(
      values.total_long_term_debt ?? null,
      sumDefined([values.long_term_debt ?? null, values.provisions ?? null]),
    )
  ) {
    markReliable(reliable, ["total_long_term_debt", "long_term_debt", "provisions"]);
  }

  if (
    approximatelyEqual(
      values.total_short_term_debt ?? null,
      sumDefined([
        values.supplier_debt ?? null,
        values.tax_payable ?? null,
        values.public_charges ?? null,
        values.dividend_liability ?? null,
        values.other_short_term_debt ?? null,
      ]),
    )
  ) {
    markReliable(reliable, [
      "total_short_term_debt",
      "supplier_debt",
      "tax_payable",
      "public_charges",
      "dividend_liability",
      "other_short_term_debt",
    ]);
  }

  return reliable;
}

export function buildFinancialReportDataset(
  statements: NormalizedFinancialStatement[],
  documents: NormalizedFinancialDocument[],
): FinancialReportDataset {
  const years = Array.from(
    new Set([
      ...documents.map((document) => document.year),
      ...statements.map((statement) => extractYear(statement)),
    ]),
  ).sort((left, right) => left - right);

  const statementByYear = new Map<number, NormalizedFinancialStatement>();
  for (const statement of statements) {
    statementByYear.set(extractYear(statement), statement);
  }

  const valuesByYear: FinancialReportDataset["valuesByYear"] = {};
  const reliableKeysByYear: FinancialReportDataset["reliableKeysByYear"] = {};
  const balanceValidationByYear: FinancialReportDataset["balanceValidationByYear"] = {};

  for (const year of years) {
    const payload = ((statementByYear.get(year)?.rawPayload ?? {}) as Record<string, unknown>) ?? {};
    valuesByYear[year] = {};

    for (const row of financialReportRows) {
      valuesByYear[year][row.key] = row.accessor(payload);
    }

    const totalAssets = valuesByYear[year].total_assets;
    const totalEquityAndLiabilities = valuesByYear[year].total_equity_and_liabilities;
    const difference =
      totalAssets !== null && totalEquityAndLiabilities !== null
        ? totalAssets - totalEquityAndLiabilities
        : null;

    balanceValidationByYear[year] = {
      balanced: difference !== null ? Math.abs(difference) <= BALANCE_TOLERANCE : false,
      difference,
    };

    reliableKeysByYear[year] = computeReliableBalanceKeys(valuesByYear[year]);

    for (const row of financialReportRows) {
      if (
        row.statement === "balance" &&
        row.visibility === "detail" &&
        !reliableKeysByYear[year].has(row.key)
      ) {
        valuesByYear[year][row.key] = null;
      }
    }
  }

  const latestCurrency = statements.find((statement) => statement.currency)?.currency ?? "NOK";

  return {
    years,
    currency: latestCurrency,
    valuesByYear,
    reliableKeysByYear,
    latestYearByStatement: {
      income: latestYearForStatement("income", years, valuesByYear),
      balance: latestYearForStatement("balance", years, valuesByYear),
    },
    balanceValidationByYear,
  };
}

export function getFinancialSections(statement: FinancialStatementType) {
  return financialSections.filter((section) => section.statement === statement);
}
