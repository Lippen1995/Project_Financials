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
  | "total_equity_and_liabilities";

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

type MetricDefinition = {
  key: CanonicalMetricKey;
  statementFamily: "INCOME_STATEMENT" | "BALANCE_SHEET" | "NOTE";
  aliases: string[];
};

const metricDefinitions: MetricDefinition[] = [
  { key: "revenue", statementFamily: "INCOME_STATEMENT", aliases: ["salgsinntekter", "driftsinntekter", "omsetning"] },
  { key: "other_operating_income", statementFamily: "INCOME_STATEMENT", aliases: ["andre driftsinntekter", "annen driftsinntekt", "oevrige driftsinntekter"] },
  { key: "total_operating_income", statementFamily: "INCOME_STATEMENT", aliases: ["sum driftsinntekter", "sum inntekter", "totale driftsinntekter"] },
  { key: "cost_of_goods_sold", statementFamily: "INCOME_STATEMENT", aliases: ["varekostnad", "kostnad solgte varer"] },
  { key: "payroll_expense", statementFamily: "INCOME_STATEMENT", aliases: ["lonnskostnad", "lonnskostnader", "personalkostnader"] },
  { key: "depreciation_amortization", statementFamily: "INCOME_STATEMENT", aliases: ["avskrivninger", "avskrivning", "nedskrivning", "av og nedskrivninger"] },
  { key: "other_operating_expense", statementFamily: "INCOME_STATEMENT", aliases: ["annen driftskostnad", "andre driftskostnader"] },
  { key: "total_operating_expenses", statementFamily: "INCOME_STATEMENT", aliases: ["sum driftskostnader", "sum kostnader", "totale driftskostnader"] },
  { key: "operating_profit", statementFamily: "INCOME_STATEMENT", aliases: ["driftsresultat", "resultat av drift"] },
  { key: "financial_income", statementFamily: "INCOME_STATEMENT", aliases: ["sum finansinntekter", "finansinntekter"] },
  { key: "financial_expense", statementFamily: "INCOME_STATEMENT", aliases: ["sum finanskostnader", "finanskostnader"] },
  { key: "net_financial_items", statementFamily: "INCOME_STATEMENT", aliases: ["resultat av finansposter", "netto finans", "netto finansposter"] },
  { key: "profit_before_tax", statementFamily: "INCOME_STATEMENT", aliases: ["resultat for skattekostnad", "ordinaert resultat for skattekostnad", "resultat for skatt"] },
  { key: "tax_expense", statementFamily: "INCOME_STATEMENT", aliases: ["skattekostnad pa resultat", "skattekostnad", "skatt pa ordinart resultat"] },
  { key: "net_income", statementFamily: "INCOME_STATEMENT", aliases: ["arsresultat", "totalresultat", "resultat etter skatt"] },
  { key: "intangible_assets", statementFamily: "BALANCE_SHEET", aliases: ["immaterielle eiendeler", "sum immaterielle eiendeler"] },
  { key: "tangible_assets", statementFamily: "BALANCE_SHEET", aliases: ["varige driftsmidler", "sum varige driftsmidler", "materielle eiendeler"] },
  { key: "financial_fixed_assets", statementFamily: "BALANCE_SHEET", aliases: ["finansielle anleggsmidler", "sum finansielle anleggsmidler"] },
  { key: "deferred_tax_asset", statementFamily: "BALANCE_SHEET", aliases: ["utsatt skattefordel", "deferred tax asset"] },
  { key: "inventory", statementFamily: "BALANCE_SHEET", aliases: ["varer", "varelager", "sum varer"] },
  { key: "trade_receivables", statementFamily: "BALANCE_SHEET", aliases: ["kundefordringer", "trade receivables"] },
  { key: "other_receivables", statementFamily: "BALANCE_SHEET", aliases: ["andre kortsiktige fordringer", "andre fordringer", "ovrige fordringer"] },
  { key: "cash_and_cash_equivalents", statementFamily: "BALANCE_SHEET", aliases: ["bankinnskudd kontanter o l", "bankinnskudd kontanter og lignende", "kontanter og bankinnskudd"] },
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
  { key: "other_current_liabilities", statementFamily: "BALANCE_SHEET", aliases: ["annen kortsiktig gjeld", "ovrig kortsiktig gjeld"] },
  { key: "current_liabilities", statementFamily: "BALANCE_SHEET", aliases: ["sum kortsiktig gjeld", "kortsiktig gjeld"] },
  { key: "total_liabilities", statementFamily: "BALANCE_SHEET", aliases: ["sum gjeld", "total gjeld"] },
  { key: "total_equity_and_liabilities", statementFamily: "BALANCE_SHEET", aliases: ["sum egenkapital og gjeld", "total egenkapital og gjeld"] },
];

export const allCanonicalMetricKeys = metricDefinitions.map((definition) => definition.key);

export function findCanonicalMetricKey(
  label: string,
  statementFamily: MetricDefinition["statementFamily"],
) {
  const normalizedLabel = normalizeNorwegianText(label);
  let bestMatch: { key: CanonicalMetricKey; aliasLength: number } | null = null;

  for (const definition of metricDefinitions) {
    if (definition.statementFamily !== statementFamily) {
      continue;
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

export const requiredPublishMetricKeys: CanonicalMetricKey[] = [
  "revenue",
  "operating_profit",
  "net_income",
  "total_assets",
  "total_equity",
  "total_liabilities",
  "total_equity_and_liabilities",
];
