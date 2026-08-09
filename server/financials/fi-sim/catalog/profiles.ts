import { FI_SIM_CONCEPTS, requireConcept, type StatementFamily } from "./concepts";

/**
 * FI-SIM-2026.1 profiles, from spec section 5.
 *
 * A profile says which concepts a statement of that kind may contain. Totals, the result chain
 * and the residual lines are structural: they exist in every profile because the calculation
 * identities in spec section 8 refer to them. What distinguishes a profile is which operating
 * income, operating expense and balance detail lines it permits.
 *
 * Optional concepts are permitted, not required. Section 8 is explicit that an absent optional
 * child is absent, never a published zero line.
 */

export type FiSimProfileKey =
  | "SERVICE"
  | "TRADE"
  | "MANUFACTURING_CONSTRUCTION"
  | "PROPERTY"
  | "HOLDING_INVESTMENT"
  | "DORMANT_PRE_REVENUE";

export type FiSimProfile = {
  key: FiSimProfileKey;
  description: string;
  /** Concepts a published statement of this profile must carry. */
  required: readonly string[];
  /** Concepts it may carry. */
  optional: readonly string[];
};

/** Present in every profile: the identities in section 8 are stated in terms of these. */
const STRUCTURAL_INCOME = [
  "OperatingIncomeTotal",
  "OperatingExpenseTotal",
  "OperatingResult",
  "NetFinancialResult",
  "ProfitBeforeTax",
  "TaxExpense",
  "ProfitForPeriod",
] as const;

const STRUCTURAL_BALANCE = [
  "NoncurrentAssetsTotal",
  "CurrentAssetsTotal",
  "AssetsTotal",
  "ShareCapital",
  "AccumulatedResults",
  "EquityTotal",
  "LongTermLiabilitiesTotal",
  "CurrentLiabilitiesTotal",
  "LiabilitiesTotal",
  "EquityAndLiabilitiesTotal",
] as const;

/** Available to every profile but never required; the generator adds them only when needed. */
const RESIDUALS = [
  "RoundingDifferenceIncome",
  "UnallocatedResidualIncome",
  "RoundingDifferenceBalance",
  "UnallocatedResidualBalance",
] as const;

/** Financial items are permitted everywhere; NetFinancialResult is a sum of them. */
const FINANCIAL_ITEMS = [
  "InterestIncome",
  "DividendIncome",
  "InvestmentGainLoss",
  "InterestExpense",
  "OtherFinancialExpense",
] as const;

const COMMON_OPTIONAL = [...RESIDUALS, ...FINANCIAL_ITEMS, "PaidInPremium", "OtherReceivables"];

function profile(
  key: FiSimProfileKey,
  description: string,
  required: readonly string[],
  optional: readonly string[],
): FiSimProfile {
  return {
    key,
    description,
    required: [...STRUCTURAL_INCOME, ...STRUCTURAL_BALANCE, ...required],
    optional: [...new Set([...COMMON_OPTIONAL, ...optional])],
  };
}

export const FI_SIM_PROFILES: Readonly<Record<FiSimProfileKey, FiSimProfile>> = {
  SERVICE: profile(
    "SERVICE",
    "Tjenesteytende virksomhet.",
    ["ServiceRevenue", "PersonnelExpense", "AdministrativeExpense", "OtherOperatingExpense", "TradeReceivables", "Cash"],
    ["OtherOperatingIncome", "DepreciationExpense", "PropertyPlantEquipment", "TradePayables", "TaxPayable", "PayrollAndPublicDutiesPayable", "OtherCurrentLiabilities"],
  ),
  TRADE: profile(
    "TRADE",
    "Varehandel.",
    ["MerchandiseRevenue", "MerchandiseCost", "PersonnelExpense", "OtherOperatingExpense", "Inventory", "TradeReceivables", "TradePayables", "Cash"],
    ["OtherOperatingIncome", "DepreciationExpense", "PropertyPlantEquipment", "ShortTermBankBorrowings", "TaxPayable", "PayrollAndPublicDutiesPayable", "OtherCurrentLiabilities"],
  ),
  MANUFACTURING_CONSTRUCTION: profile(
    "MANUFACTURING_CONSTRUCTION",
    "Produksjon, prosjekt- og byggvirksomhet.",
    ["ContractRevenue", "MaterialsAndSubcontractors", "PersonnelExpense", "OtherOperatingExpense", "DepreciationExpense", "PropertyPlantEquipment", "TradeReceivables", "TradePayables", "Cash"],
    ["MerchandiseRevenue", "OtherOperatingIncome", "Inventory", "ContractAssets", "LongTermBankBorrowings", "ShortTermBankBorrowings", "TaxPayable", "PayrollAndPublicDutiesPayable", "OtherCurrentLiabilities"],
  ),
  PROPERTY: profile(
    "PROPERTY",
    "Eiendomseie og -drift.",
    ["RentalRevenue", "PropertyOperatingExpense", "AdministrativeExpense", "DepreciationExpense", "InvestmentProperty", "Cash"],
    ["OtherOperatingIncome", "OtherOperatingExpense", "LongTermBankBorrowings", "ShortTermBankBorrowings", "TradeReceivables", "TradePayables", "TaxPayable", "OtherCurrentLiabilities", "OtherLongTermLiabilities"],
  ),
  HOLDING_INVESTMENT: profile(
    "HOLDING_INVESTMENT",
    "Holding- og investeringsvirksomhet. Ordinær driftsomsetning er ikke påkrevd.",
    ["LongTermInvestments", "Cash"],
    ["AdministrativeExpense", "OtherOperatingExpense", "OtherOperatingIncome", "TradeReceivables", "LongTermBankBorrowings", "OtherLongTermLiabilities", "TaxPayable", "OtherCurrentLiabilities", "OtherNoncurrentAssets"],
  ),
  DORMANT_PRE_REVENUE: profile(
    "DORMANT_PRE_REVENUE",
    "Sovende eller før-omsetningsvirksomhet. Ingen inntektslinje er påkrevd.",
    ["Cash"],
    ["AdministrativeExpense", "OtherOperatingExpense", "OtherCurrentLiabilities", "TaxPayable", "OtherReceivables"],
  ),
};

/** Returned instead of a profile for company kinds v1 does not model. */
export const UNSUPPORTED_SIMULATION_PROFILE = "UNSUPPORTED_SIMULATION_PROFILE" as const;

export function permittedConcepts(key: FiSimProfileKey): Set<string> {
  const found = FI_SIM_PROFILES[key];
  return new Set([...found.required, ...found.optional]);
}

export function conceptsFor(key: FiSimProfileKey, statementFamily: StatementFamily): string[] {
  const permitted = permittedConcepts(key);
  return FI_SIM_CONCEPTS.filter(
    (concept) => concept.statementFamily === statementFamily && permitted.has(concept.conceptKey),
  )
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((concept) => concept.conceptKey);
}

/** Every concept a profile names must exist in the catalog. Called by the catalog tests. */
export function assertProfileConceptsExist(key: FiSimProfileKey) {
  for (const conceptKey of permittedConcepts(key)) {
    requireConcept(conceptKey);
  }
}
