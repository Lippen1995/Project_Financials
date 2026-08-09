/**
 * FI-SIM-2026.1 concept catalog.
 *
 * Fjord Insight's own taxonomy. It uses open XBRL mechanics — concepts, labels, presentation and
 * calculation relationships — but imports nothing from IFRS: no files, namespaces, QNames,
 * labels, definitions or linkbases. Product, API and export must never describe FI-SIM as
 * IFRS-based, IFRS-compatible or IFRS-compliant. `catalog-boundary.test.ts` enforces that.
 *
 * This file is the normative catalog from docs/financials/fi-sim-2026.1-spec.md section 4,
 * transcribed as code-owned data. The spec is the authority; if the two disagree the spec wins.
 *
 * The spec's "mapping-orakel" column is deliberately absent here. It is test fasit only and must
 * never be reachable from the generator, or a simulated line would arrive pre-mapped. It lives
 * in catalog-mapping-oracle.test-data.ts.
 */

export const FI_SIM_TAXONOMY_VERSION = "FI-SIM-2026.1";
export const FI_SIM_NAMESPACE = "urn:fjord-insight:taxonomy:fi-sim:2026.1";
export const FI_SIM_PREFIX = "fi-sim";

export type StatementFamily = "INCOME_STATEMENT" | "BALANCE_SHEET";
export type PeriodType = "duration" | "instant";
export type ConceptBalance = "debit" | "credit" | "none";

export type FiSimConcept = {
  conceptKey: string;
  /** Original Norwegian label. Fjord Insight's own wording. */
  sourceLabel: string;
  balance: ConceptBalance;
  statementFamily: StatementFamily;
  periodType: PeriodType;
  /** Presentation grouping within the statement, and the order within that group. */
  presentationRole: string;
  sortOrder: number;
};

export function qualifiedName(conceptKey: string) {
  return `${FI_SIM_PREFIX}:${conceptKey}`;
}

/** Section 4.1. Every income-statement concept is periodType = duration. */
const INCOME_STATEMENT: ReadonlyArray<Omit<FiSimConcept, "statementFamily" | "periodType">> = [
  { conceptKey: "ServiceRevenue", sourceLabel: "Tjenesteomsetning", balance: "credit", presentationRole: "OperatingIncome", sortOrder: 10 },
  { conceptKey: "MerchandiseRevenue", sourceLabel: "Vareomsetning", balance: "credit", presentationRole: "OperatingIncome", sortOrder: 20 },
  { conceptKey: "ContractRevenue", sourceLabel: "Prosjekt- og kontraktsinntekter", balance: "credit", presentationRole: "OperatingIncome", sortOrder: 30 },
  { conceptKey: "RentalRevenue", sourceLabel: "Leieinntekter", balance: "credit", presentationRole: "OperatingIncome", sortOrder: 40 },
  { conceptKey: "OtherOperatingIncome", sourceLabel: "Øvrige driftsinntekter", balance: "credit", presentationRole: "OperatingIncome", sortOrder: 50 },
  { conceptKey: "OperatingIncomeTotal", sourceLabel: "Sum driftsinntekter", balance: "credit", presentationRole: "OperatingIncomeTotal", sortOrder: 60 },

  { conceptKey: "MerchandiseCost", sourceLabel: "Vareforbruk", balance: "debit", presentationRole: "OperatingExpense", sortOrder: 70 },
  { conceptKey: "MaterialsAndSubcontractors", sourceLabel: "Materialer og underleverandører", balance: "debit", presentationRole: "OperatingExpense", sortOrder: 80 },
  { conceptKey: "PersonnelExpense", sourceLabel: "Personalkostnader", balance: "debit", presentationRole: "OperatingExpense", sortOrder: 90 },
  { conceptKey: "PropertyOperatingExpense", sourceLabel: "Eiendomsrelaterte driftskostnader", balance: "debit", presentationRole: "OperatingExpense", sortOrder: 100 },
  { conceptKey: "AdministrativeExpense", sourceLabel: "Administrasjonskostnader", balance: "debit", presentationRole: "OperatingExpense", sortOrder: 110 },
  { conceptKey: "OtherOperatingExpense", sourceLabel: "Øvrige driftskostnader", balance: "debit", presentationRole: "OperatingExpense", sortOrder: 120 },
  { conceptKey: "DepreciationExpense", sourceLabel: "Avskrivninger", balance: "debit", presentationRole: "OperatingExpense", sortOrder: 130 },
  { conceptKey: "OperatingExpenseTotal", sourceLabel: "Sum driftskostnader", balance: "debit", presentationRole: "OperatingExpenseTotal", sortOrder: 140 },

  { conceptKey: "OperatingResult", sourceLabel: "Driftsresultat", balance: "credit", presentationRole: "OperatingResult", sortOrder: 150 },

  { conceptKey: "InterestIncome", sourceLabel: "Renteinntekter", balance: "credit", presentationRole: "FinancialItems", sortOrder: 160 },
  { conceptKey: "DividendIncome", sourceLabel: "Utbytteinntekter", balance: "credit", presentationRole: "FinancialItems", sortOrder: 170 },
  { conceptKey: "InvestmentGainLoss", sourceLabel: "Resultat fra investeringer", balance: "none", presentationRole: "FinancialItems", sortOrder: 180 },
  { conceptKey: "InterestExpense", sourceLabel: "Rentekostnader", balance: "debit", presentationRole: "FinancialItems", sortOrder: 190 },
  { conceptKey: "OtherFinancialExpense", sourceLabel: "Øvrige finanskostnader", balance: "debit", presentationRole: "FinancialItems", sortOrder: 200 },
  { conceptKey: "NetFinancialResult", sourceLabel: "Netto finansresultat", balance: "none", presentationRole: "FinancialItemsTotal", sortOrder: 210 },

  { conceptKey: "ProfitBeforeTax", sourceLabel: "Resultat før skatt", balance: "credit", presentationRole: "Result", sortOrder: 220 },
  { conceptKey: "TaxExpense", sourceLabel: "Skattekostnad", balance: "debit", presentationRole: "Result", sortOrder: 230 },
  { conceptKey: "ProfitForPeriod", sourceLabel: "Årsresultat", balance: "credit", presentationRole: "Result", sortOrder: 240 },

  { conceptKey: "RoundingDifferenceIncome", sourceLabel: "Avrundingsdifferanse resultat", balance: "none", presentationRole: "Residual", sortOrder: 250 },
  { conceptKey: "UnallocatedResidualIncome", sourceLabel: "Ufordelt differanse resultat", balance: "none", presentationRole: "Residual", sortOrder: 260 },
];

/** Section 4.2. Every balance-sheet concept is periodType = instant. */
const BALANCE_SHEET: ReadonlyArray<Omit<FiSimConcept, "statementFamily" | "periodType">> = [
  { conceptKey: "DevelopmentAssets", sourceLabel: "Utviklingsrelaterte eiendeler", balance: "debit", presentationRole: "NoncurrentAssets", sortOrder: 10 },
  { conceptKey: "PropertyPlantEquipment", sourceLabel: "Varige driftsmidler", balance: "debit", presentationRole: "NoncurrentAssets", sortOrder: 20 },
  { conceptKey: "InvestmentProperty", sourceLabel: "Investeringseiendom", balance: "debit", presentationRole: "NoncurrentAssets", sortOrder: 30 },
  { conceptKey: "LongTermInvestments", sourceLabel: "Langsiktige investeringer", balance: "debit", presentationRole: "NoncurrentAssets", sortOrder: 40 },
  { conceptKey: "OtherNoncurrentAssets", sourceLabel: "Øvrige langsiktige eiendeler", balance: "debit", presentationRole: "NoncurrentAssets", sortOrder: 50 },
  { conceptKey: "NoncurrentAssetsTotal", sourceLabel: "Sum langsiktige eiendeler", balance: "debit", presentationRole: "NoncurrentAssetsTotal", sortOrder: 60 },

  { conceptKey: "Inventory", sourceLabel: "Varelager", balance: "debit", presentationRole: "CurrentAssets", sortOrder: 70 },
  { conceptKey: "ContractAssets", sourceLabel: "Opptjente ikke fakturerte inntekter", balance: "debit", presentationRole: "CurrentAssets", sortOrder: 80 },
  { conceptKey: "TradeReceivables", sourceLabel: "Kundefordringer", balance: "debit", presentationRole: "CurrentAssets", sortOrder: 90 },
  { conceptKey: "OtherReceivables", sourceLabel: "Øvrige kortsiktige fordringer", balance: "debit", presentationRole: "CurrentAssets", sortOrder: 100 },
  { conceptKey: "Cash", sourceLabel: "Bankinnskudd og kontanter", balance: "debit", presentationRole: "CurrentAssets", sortOrder: 110 },
  { conceptKey: "CurrentAssetsTotal", sourceLabel: "Sum kortsiktige eiendeler", balance: "debit", presentationRole: "CurrentAssetsTotal", sortOrder: 120 },
  { conceptKey: "AssetsTotal", sourceLabel: "Sum eiendeler", balance: "debit", presentationRole: "AssetsTotal", sortOrder: 130 },

  { conceptKey: "ShareCapital", sourceLabel: "Selskapskapital", balance: "credit", presentationRole: "Equity", sortOrder: 140 },
  { conceptKey: "PaidInPremium", sourceLabel: "Annen innskutt kapital", balance: "credit", presentationRole: "Equity", sortOrder: 150 },
  { conceptKey: "AccumulatedResults", sourceLabel: "Opptjente resultater", balance: "credit", presentationRole: "Equity", sortOrder: 160 },
  { conceptKey: "EquityTotal", sourceLabel: "Sum egenkapital", balance: "credit", presentationRole: "EquityTotal", sortOrder: 170 },

  { conceptKey: "LongTermBankBorrowings", sourceLabel: "Langsiktig bankgjeld", balance: "credit", presentationRole: "LongTermLiabilities", sortOrder: 180 },
  { conceptKey: "OtherLongTermLiabilities", sourceLabel: "Øvrig langsiktig gjeld", balance: "credit", presentationRole: "LongTermLiabilities", sortOrder: 190 },
  { conceptKey: "LongTermLiabilitiesTotal", sourceLabel: "Sum langsiktig gjeld", balance: "credit", presentationRole: "LongTermLiabilitiesTotal", sortOrder: 200 },

  { conceptKey: "ShortTermBankBorrowings", sourceLabel: "Kortsiktig bankgjeld", balance: "credit", presentationRole: "CurrentLiabilities", sortOrder: 210 },
  { conceptKey: "TradePayables", sourceLabel: "Leverandørgjeld", balance: "credit", presentationRole: "CurrentLiabilities", sortOrder: 220 },
  { conceptKey: "TaxPayable", sourceLabel: "Betalbar skatt", balance: "credit", presentationRole: "CurrentLiabilities", sortOrder: 230 },
  { conceptKey: "PayrollAndPublicDutiesPayable", sourceLabel: "Skyldige lønns- og offentlige avgifter", balance: "credit", presentationRole: "CurrentLiabilities", sortOrder: 240 },
  { conceptKey: "OtherCurrentLiabilities", sourceLabel: "Øvrig kortsiktig gjeld", balance: "credit", presentationRole: "CurrentLiabilities", sortOrder: 250 },
  { conceptKey: "CurrentLiabilitiesTotal", sourceLabel: "Sum kortsiktig gjeld", balance: "credit", presentationRole: "CurrentLiabilitiesTotal", sortOrder: 260 },
  { conceptKey: "LiabilitiesTotal", sourceLabel: "Sum gjeld", balance: "credit", presentationRole: "LiabilitiesTotal", sortOrder: 270 },
  { conceptKey: "EquityAndLiabilitiesTotal", sourceLabel: "Sum egenkapital og gjeld", balance: "credit", presentationRole: "EquityAndLiabilitiesTotal", sortOrder: 280 },

  { conceptKey: "RoundingDifferenceBalance", sourceLabel: "Avrundingsdifferanse balanse", balance: "none", presentationRole: "Residual", sortOrder: 290 },
  { conceptKey: "UnallocatedResidualBalance", sourceLabel: "Ufordelt differanse balanse", balance: "none", presentationRole: "Residual", sortOrder: 300 },
];

export const FI_SIM_CONCEPTS: readonly FiSimConcept[] = [
  ...INCOME_STATEMENT.map((concept) => ({
    ...concept,
    statementFamily: "INCOME_STATEMENT" as const,
    periodType: "duration" as const,
  })),
  ...BALANCE_SHEET.map((concept) => ({
    ...concept,
    statementFamily: "BALANCE_SHEET" as const,
    periodType: "instant" as const,
  })),
];

const conceptsByKey = new Map(FI_SIM_CONCEPTS.map((concept) => [concept.conceptKey, concept]));

export function findConcept(conceptKey: string): FiSimConcept | null {
  return conceptsByKey.get(conceptKey) ?? null;
}

export function requireConcept(conceptKey: string): FiSimConcept {
  const concept = conceptsByKey.get(conceptKey);
  if (!concept) {
    throw new Error(`Ukjent FI-SIM-konsept: ${conceptKey}`);
  }
  return concept;
}

export function conceptKeysFor(statementFamily: StatementFamily): string[] {
  return FI_SIM_CONCEPTS.filter((concept) => concept.statementFamily === statementFamily).map(
    (concept) => concept.conceptKey,
  );
}
