import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";

export type CanonicalMetricKey =
  | "revenue"
  | "other_operating_income"
  | "total_operating_income"
  | "cost_of_goods_sold"
  | "payroll_expense"
  | "depreciation_amortization"
  | "other_operating_expense"
  | "total_operating_expenses"
  | "operating_profit"
  | "financial_income"
  | "financial_expense"
  | "net_financial_items"
  | "profit_before_tax"
  | "tax_expense"
  | "net_income"
  | "intangible_assets"
  | "tangible_assets"
  | "financial_fixed_assets"
  | "deferred_tax_asset"
  | "inventory"
  | "trade_receivables"
  | "other_receivables"
  | "cash_and_cash_equivalents"
  | "current_assets"
  | "total_assets"
  | "share_capital"
  | "share_premium"
  | "retained_earnings"
  | "total_equity"
  | "long_term_liabilities"
  | "trade_payables"
  | "tax_payable"
  | "public_duties_payable"
  | "other_current_liabilities"
  | "current_liabilities"
  | "total_liabilities"
  | "total_equity_and_liabilities"
  // Maturity-split components that share a label across the long-term and
  // current liability sections (e.g. "Gjeld til kredittinstitusjoner").
  // Disambiguated by which sub-section the row sits in.
  | "long_term_debt_credit_institutions"
  | "short_term_debt_credit_institutions";

/** Which liability sub-section a balance row sits in, when known. */
export type LiabilitySection = "LONG_TERM" | "CURRENT";

export type StatementSectionType =
  | "STATUTORY_INCOME"
  | "STATUTORY_BALANCE"
  | "STATUTORY_BALANCE_CONTINUATION"
  | "SUPPLEMENTARY_INCOME"
  | "SUPPLEMENTARY_BALANCE"
  | "NOTE"
  | "AUDITOR_REPORT"
  | "BOARD_REPORT"
  | "COVER";

// Which set of accounts a page or fact belongs to. Mirrors the Prisma
// StatementScope enum but kept as a standalone string union so the
// extraction layer has no Prisma dependency.
//   COMPANY:      the legal entity's own accounts (selskaps-/morregnskap)
//   CONSOLIDATED: the group accounts (konsernregnskap)
export type StatementScope = "COMPANY" | "CONSOLIDATED";

// Reporting currency of a statement. NOK is the default; a minority of
// filings report in a foreign currency and declare it in the header.
export type ReportingCurrency = "NOK" | "USD" | "EUR" | "GBP" | "SEK" | "DKK";

export type MetricDefinition = {
  key: CanonicalMetricKey;
  statementFamily: "INCOME_STATEMENT" | "BALANCE_SHEET" | "NOTE";
  aliases: string[];
  /** When set, the definition only matches a row whose liability sub-section
   *  equals this value — lets two rows with the SAME label (e.g. "Gjeld til
   *  kredittinstitusjoner") map to distinct keys by maturity. */
  liabilitySection?: LiabilitySection;
};

// Built-in default mapping. Kept in code as (a) the seed for the editable
// MetricAlias table and (b) the fallback used by tests/scripts and whenever the
// database table is empty. At runtime the extraction layer normally receives a
// definitions array loaded from the database instead (see metric-mapping-service).
export const defaultMetricDefinitions: MetricDefinition[] = [
  { key: "revenue", statementFamily: "INCOME_STATEMENT", aliases: ["salgsinntekter", "salgsinntekt", "driftsinntekter", "omsetning", "revenue", "operating revenue"] },
  { key: "other_operating_income", statementFamily: "INCOME_STATEMENT", aliases: ["andre driftsinntekter", "annen driftsinntekt", "oevrige driftsinntekter", "other operating income"] },
  { key: "total_operating_income", statementFamily: "INCOME_STATEMENT", aliases: ["sum driftsinntekter", "sum inntekter", "totale driftsinntekter", "total operating income"] },
  { key: "cost_of_goods_sold", statementFamily: "INCOME_STATEMENT", aliases: ["varekostnad", "kostnad solgte varer"] },
  { key: "payroll_expense", statementFamily: "INCOME_STATEMENT", aliases: ["lonnskostnad", "lonnskostnader", "personalkostnader"] },
  { key: "depreciation_amortization", statementFamily: "INCOME_STATEMENT", aliases: ["avskrivninger", "avskrivning", "nedskrivning", "av og nedskrivninger"] },
  { key: "other_operating_expense", statementFamily: "INCOME_STATEMENT", aliases: ["annen driftskostnad", "andre driftskostnader"] },
  { key: "total_operating_expenses", statementFamily: "INCOME_STATEMENT", aliases: ["sum driftskostnader", "sum kostnader", "totale driftskostnader"] },
  { key: "operating_profit", statementFamily: "INCOME_STATEMENT", aliases: ["driftsresultat", "resultat av drift", "operating profit", "operating result"] },
  { key: "financial_income", statementFamily: "INCOME_STATEMENT", aliases: ["sum finansinntekter", "finansinntekter", "financial income"] },
  { key: "financial_expense", statementFamily: "INCOME_STATEMENT", aliases: ["sum finanskostnader", "finanskostnader", "financial expense"] },
  { key: "net_financial_items", statementFamily: "INCOME_STATEMENT", aliases: ["resultat av finansposter", "netto finans", "netto finansposter", "net financial items"] },
  { key: "profit_before_tax", statementFamily: "INCOME_STATEMENT", aliases: ["resultat for skattekostnad", "ordinaert resultat for skattekostnad", "resultat for skatt", "ordinaert resultat for skatt", "ordinaert resultat", "profit before tax"] },
  { key: "tax_expense", statementFamily: "INCOME_STATEMENT", aliases: ["skattekostnad pa resultat", "skattekostnad", "skatt pa ordinart resultat", "tax expense"] },
  { key: "net_income", statementFamily: "INCOME_STATEMENT", aliases: ["arsresultat", "totalresultat", "resultat etter skatt", "net income", "profit for the year"] },
  { key: "intangible_assets", statementFamily: "BALANCE_SHEET", aliases: ["immaterielle eiendeler", "sum immaterielle eiendeler"] },
  { key: "tangible_assets", statementFamily: "BALANCE_SHEET", aliases: ["varige driftsmidler", "sum varige driftsmidler", "materielle eiendeler"] },
  { key: "financial_fixed_assets", statementFamily: "BALANCE_SHEET", aliases: ["finansielle anleggsmidler", "sum finansielle anleggsmidler"] },
  { key: "deferred_tax_asset", statementFamily: "BALANCE_SHEET", aliases: ["utsatt skattefordel", "deferred tax asset"] },
  { key: "inventory", statementFamily: "BALANCE_SHEET", aliases: ["varer", "varelager", "sum varer"] },
  { key: "trade_receivables", statementFamily: "BALANCE_SHEET", aliases: ["kundefordringer", "trade receivables", "accounts receivable"] },
  { key: "other_receivables", statementFamily: "BALANCE_SHEET", aliases: ["andre kortsiktige fordringer", "andre fordringer", "ovrige fordringer", "other receivables"] },
  { key: "cash_and_cash_equivalents", statementFamily: "BALANCE_SHEET", aliases: ["bankinnskudd kontanter o l", "bankinnskudd kontanter og lignende", "bankinnskudd kontanter og kontantekvivalenter", "kontanter og bankinnskudd", "kontanter og kontantekvivalenter", "bankinnskudd og kontanter", "cash and cash equivalents"] },
  { key: "current_assets", statementFamily: "BALANCE_SHEET", aliases: ["sum omlopsmidler", "sum omloepsmidler", "omlopsmidler"] },
  { key: "total_assets", statementFamily: "BALANCE_SHEET", aliases: ["sum eiendeler", "totale eiendeler"] },
  { key: "share_capital", statementFamily: "BALANCE_SHEET", aliases: ["aksjekapital", "innskutt aksjekapital"] },
  { key: "share_premium", statementFamily: "BALANCE_SHEET", aliases: ["overkurs", "share premium"] },
  { key: "retained_earnings", statementFamily: "BALANCE_SHEET", aliases: ["annen egenkapital", "opptjent egenkapital", "retained earnings"] },
  { key: "total_equity", statementFamily: "BALANCE_SHEET", aliases: ["sum egenkapital", "egenkapital"] },
  { key: "long_term_liabilities", statementFamily: "BALANCE_SHEET", aliases: ["sum langsiktig gjeld", "langsiktig gjeld", "annen langsiktig gjeld"] },
  { key: "trade_payables", statementFamily: "BALANCE_SHEET", aliases: ["leverandorgjeld", "trade payables"] },
  { key: "tax_payable", statementFamily: "BALANCE_SHEET", aliases: ["betalbar skatt", "skyldig skatt"] },
  { key: "public_duties_payable", statementFamily: "BALANCE_SHEET", aliases: ["skyldige offentlige avgifter", "offentlige avgifter"] },
  { key: "other_current_liabilities", statementFamily: "BALANCE_SHEET", aliases: ["annen kortsiktig gjeld", "ovrig kortsiktig gjeld", "other current liabilities"] },
  { key: "current_liabilities", statementFamily: "BALANCE_SHEET", aliases: ["sum kortsiktig gjeld", "kortsiktig gjeld"] },
  { key: "total_liabilities", statementFamily: "BALANCE_SHEET", aliases: ["sum gjeld", "total gjeld"] },
  { key: "total_equity_and_liabilities", statementFamily: "BALANCE_SHEET", aliases: ["sum egenkapital og gjeld", "total egenkapital og gjeld"] },
  // Maturity-split credit-institution debt. Same label in both sections;
  // the liabilitySection qualifier routes each to the correct key.
  {
    key: "long_term_debt_credit_institutions",
    statementFamily: "BALANCE_SHEET",
    aliases: ["gjeld til kredittinstitusjoner", "gjeld til kredittinstitusjon"],
    liabilitySection: "LONG_TERM",
  },
  {
    key: "short_term_debt_credit_institutions",
    statementFamily: "BALANCE_SHEET",
    aliases: ["gjeld til kredittinstitusjoner", "gjeld til kredittinstitusjon"],
    liabilitySection: "CURRENT",
  },
];

export const allCanonicalMetricKeys = defaultMetricDefinitions.map((definition) => definition.key);

export function findCanonicalMetricKey(
  label: string,
  statementFamily: MetricDefinition["statementFamily"],
  liabilitySection?: LiabilitySection | null,
  definitions: MetricDefinition[] = defaultMetricDefinitions,
) {
  const normalizedLabel = normalizeNorwegianText(label);
  let bestMatch: { key: CanonicalMetricKey; aliasLength: number } | null = null;

  for (const definition of definitions) {
    if (definition.statementFamily !== statementFamily) {
      continue;
    }

    // Maturity-qualified definitions only apply when the row's liability
    // sub-section is known AND matches. When the section is unknown we skip
    // them rather than guess — the row stays unmapped (safe).
    if (definition.liabilitySection) {
      if (!liabilitySection || definition.liabilitySection !== liabilitySection) {
        continue;
      }
    }

    for (const alias of definition.aliases) {
      const normalizedAlias = normalizeNorwegianText(alias);
      if (
        normalizedLabel === normalizedAlias ||
        normalizedLabel.startsWith(`${normalizedAlias} `) ||
        normalizedLabel.includes(` ${normalizedAlias} `)
      ) {
        if (!bestMatch || normalizedAlias.length > bestMatch.aliasLength) {
          bestMatch = {
            key: definition.key,
            aliasLength: normalizedAlias.length,
          };
        }
      }
    }
  }

  return bestMatch?.key ?? null;
}

export function getStatementFamilyFromSection(sectionType: StatementSectionType) {
  switch (sectionType) {
    case "STATUTORY_INCOME":
    case "SUPPLEMENTARY_INCOME":
      return "INCOME_STATEMENT" as const;
    case "STATUTORY_BALANCE":
    case "STATUTORY_BALANCE_CONTINUATION":
    case "SUPPLEMENTARY_BALANCE":
      return "BALANCE_SHEET" as const;
    case "NOTE":
      return "NOTE" as const;
    default:
      return null;
  }
}

export function getStatementTypeForMetricKey(
  metricKey: string,
): "INCOME_STATEMENT" | "BALANCE_SHEET" | "NOTE" | null {
  const def = defaultMetricDefinitions.find((d) => d.key === metricKey);
  return def?.statementFamily ?? null;
}

export const requiredPublishMetricKeys: CanonicalMetricKey[] = [
  "revenue",
  "operating_profit",
  "net_income",
  "total_assets",
  "total_equity",
  "total_liabilities",
  "total_equity_and_liabilities",
];

// ---------------------------------------------------------------------------
// Presentation skeleton for the admin mapping flow chart.
//
// Describes how the fixed canonical metric keys are laid out on the right-hand
// side of the diagram so they read like a Norwegian financial statement
// (resultatregnskap on top, balanse below). This is purely visual/structural
// metadata — it is NOT used by the extraction matching, only by the UI.
// ---------------------------------------------------------------------------

export type MetricLayoutGroup =
  | "DRIFTSINNTEKTER"
  | "DRIFTSKOSTNADER"
  | "DRIFTSRESULTAT"
  | "FINANS"
  | "RESULTAT"
  | "ANLEGGSMIDLER"
  | "OMLOPSMIDLER"
  | "SUM_EIENDELER"
  | "EGENKAPITAL"
  | "LANGSIKTIG_GJELD"
  | "KORTSIKTIG_GJELD"
  | "GJELD_OG_EK_TOTAL";

export type MetricNodeType = "line" | "subtotal" | "total";

export type CanonicalMetricLayoutEntry = {
  key: CanonicalMetricKey;
  family: "INCOME_STATEMENT" | "BALANCE_SHEET";
  group: MetricLayoutGroup;
  /** Norwegian display label for the node. */
  label: string;
  nodeType: MetricNodeType;
};

export const metricLayoutGroupLabels: Record<MetricLayoutGroup, string> = {
  DRIFTSINNTEKTER: "Driftsinntekter",
  DRIFTSKOSTNADER: "Driftskostnader",
  DRIFTSRESULTAT: "Driftsresultat",
  FINANS: "Finansposter",
  RESULTAT: "Resultat",
  ANLEGGSMIDLER: "Anleggsmidler",
  OMLOPSMIDLER: "Omløpsmidler",
  SUM_EIENDELER: "Sum eiendeler",
  EGENKAPITAL: "Egenkapital",
  LANGSIKTIG_GJELD: "Langsiktig gjeld",
  KORTSIKTIG_GJELD: "Kortsiktig gjeld",
  GJELD_OG_EK_TOTAL: "Sum gjeld og egenkapital",
};

// Ordered top-to-bottom. The array index is the vertical order used by the UI.
export const canonicalMetricLayout: CanonicalMetricLayoutEntry[] = [
  // Resultatregnskap
  { key: "revenue", family: "INCOME_STATEMENT", group: "DRIFTSINNTEKTER", label: "Salgsinntekter", nodeType: "line" },
  { key: "other_operating_income", family: "INCOME_STATEMENT", group: "DRIFTSINNTEKTER", label: "Andre driftsinntekter", nodeType: "line" },
  { key: "total_operating_income", family: "INCOME_STATEMENT", group: "DRIFTSINNTEKTER", label: "Sum driftsinntekter", nodeType: "subtotal" },
  { key: "cost_of_goods_sold", family: "INCOME_STATEMENT", group: "DRIFTSKOSTNADER", label: "Varekostnad", nodeType: "line" },
  { key: "payroll_expense", family: "INCOME_STATEMENT", group: "DRIFTSKOSTNADER", label: "Lønnskostnad", nodeType: "line" },
  { key: "depreciation_amortization", family: "INCOME_STATEMENT", group: "DRIFTSKOSTNADER", label: "Av- og nedskrivninger", nodeType: "line" },
  { key: "other_operating_expense", family: "INCOME_STATEMENT", group: "DRIFTSKOSTNADER", label: "Annen driftskostnad", nodeType: "line" },
  { key: "total_operating_expenses", family: "INCOME_STATEMENT", group: "DRIFTSKOSTNADER", label: "Sum driftskostnader", nodeType: "subtotal" },
  { key: "operating_profit", family: "INCOME_STATEMENT", group: "DRIFTSRESULTAT", label: "Driftsresultat", nodeType: "subtotal" },
  { key: "financial_income", family: "INCOME_STATEMENT", group: "FINANS", label: "Finansinntekter", nodeType: "line" },
  { key: "financial_expense", family: "INCOME_STATEMENT", group: "FINANS", label: "Finanskostnader", nodeType: "line" },
  { key: "net_financial_items", family: "INCOME_STATEMENT", group: "FINANS", label: "Netto finansposter", nodeType: "subtotal" },
  { key: "profit_before_tax", family: "INCOME_STATEMENT", group: "RESULTAT", label: "Resultat før skatt", nodeType: "subtotal" },
  { key: "tax_expense", family: "INCOME_STATEMENT", group: "RESULTAT", label: "Skattekostnad", nodeType: "line" },
  { key: "net_income", family: "INCOME_STATEMENT", group: "RESULTAT", label: "Årsresultat", nodeType: "total" },
  // Balanse — eiendeler
  { key: "intangible_assets", family: "BALANCE_SHEET", group: "ANLEGGSMIDLER", label: "Immaterielle eiendeler", nodeType: "line" },
  { key: "tangible_assets", family: "BALANCE_SHEET", group: "ANLEGGSMIDLER", label: "Varige driftsmidler", nodeType: "line" },
  { key: "financial_fixed_assets", family: "BALANCE_SHEET", group: "ANLEGGSMIDLER", label: "Finansielle anleggsmidler", nodeType: "line" },
  { key: "deferred_tax_asset", family: "BALANCE_SHEET", group: "ANLEGGSMIDLER", label: "Utsatt skattefordel", nodeType: "line" },
  { key: "inventory", family: "BALANCE_SHEET", group: "OMLOPSMIDLER", label: "Varer", nodeType: "line" },
  { key: "trade_receivables", family: "BALANCE_SHEET", group: "OMLOPSMIDLER", label: "Kundefordringer", nodeType: "line" },
  { key: "other_receivables", family: "BALANCE_SHEET", group: "OMLOPSMIDLER", label: "Andre fordringer", nodeType: "line" },
  { key: "cash_and_cash_equivalents", family: "BALANCE_SHEET", group: "OMLOPSMIDLER", label: "Bankinnskudd og kontanter", nodeType: "line" },
  { key: "current_assets", family: "BALANCE_SHEET", group: "OMLOPSMIDLER", label: "Sum omløpsmidler", nodeType: "subtotal" },
  { key: "total_assets", family: "BALANCE_SHEET", group: "SUM_EIENDELER", label: "Sum eiendeler", nodeType: "total" },
  // Balanse — egenkapital og gjeld
  { key: "share_capital", family: "BALANCE_SHEET", group: "EGENKAPITAL", label: "Aksjekapital", nodeType: "line" },
  { key: "share_premium", family: "BALANCE_SHEET", group: "EGENKAPITAL", label: "Overkurs", nodeType: "line" },
  { key: "retained_earnings", family: "BALANCE_SHEET", group: "EGENKAPITAL", label: "Opptjent egenkapital", nodeType: "line" },
  { key: "total_equity", family: "BALANCE_SHEET", group: "EGENKAPITAL", label: "Sum egenkapital", nodeType: "subtotal" },
  { key: "long_term_liabilities", family: "BALANCE_SHEET", group: "LANGSIKTIG_GJELD", label: "Sum langsiktig gjeld", nodeType: "subtotal" },
  { key: "long_term_debt_credit_institutions", family: "BALANCE_SHEET", group: "LANGSIKTIG_GJELD", label: "Gjeld til kredittinstitusjoner (langsiktig)", nodeType: "line" },
  { key: "trade_payables", family: "BALANCE_SHEET", group: "KORTSIKTIG_GJELD", label: "Leverandørgjeld", nodeType: "line" },
  { key: "tax_payable", family: "BALANCE_SHEET", group: "KORTSIKTIG_GJELD", label: "Betalbar skatt", nodeType: "line" },
  { key: "public_duties_payable", family: "BALANCE_SHEET", group: "KORTSIKTIG_GJELD", label: "Skyldige offentlige avgifter", nodeType: "line" },
  { key: "short_term_debt_credit_institutions", family: "BALANCE_SHEET", group: "KORTSIKTIG_GJELD", label: "Gjeld til kredittinstitusjoner (kortsiktig)", nodeType: "line" },
  { key: "other_current_liabilities", family: "BALANCE_SHEET", group: "KORTSIKTIG_GJELD", label: "Annen kortsiktig gjeld", nodeType: "line" },
  { key: "current_liabilities", family: "BALANCE_SHEET", group: "KORTSIKTIG_GJELD", label: "Sum kortsiktig gjeld", nodeType: "subtotal" },
  { key: "total_liabilities", family: "BALANCE_SHEET", group: "GJELD_OG_EK_TOTAL", label: "Sum gjeld", nodeType: "subtotal" },
  { key: "total_equity_and_liabilities", family: "BALANCE_SHEET", group: "GJELD_OG_EK_TOTAL", label: "Sum egenkapital og gjeld", nodeType: "total" },
];

/** Liability sub-section implied by a canonical key, for the two maturity-split
 *  credit-institution keys. null for every other key. */
export function liabilitySectionForMetricKey(
  metricKey: string,
): LiabilitySection | null {
  if (metricKey === "long_term_debt_credit_institutions") return "LONG_TERM";
  if (metricKey === "short_term_debt_credit_institutions") return "CURRENT";
  return null;
}

const canonicalMetricKeySet = new Set<string>(canonicalMetricLayout.map((entry) => entry.key));

/** Type guard: is the given string one of the fixed canonical metric keys. */
export function isCanonicalMetricKey(value: string): value is CanonicalMetricKey {
  return canonicalMetricKeySet.has(value);
}
