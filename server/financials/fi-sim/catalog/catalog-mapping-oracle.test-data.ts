/**
 * The mapping oracle: which canonical metric each FI-SIM concept ought to become.
 *
 * This file is test fasit and nothing else. `concepts.ts` has referred to it since the catalog was
 * written, precisely so the table would live outside the runtime tree: if the generator or the
 * mapping job could read it, a simulated line would arrive already knowing its metric, and the
 * demo would be showing a lookup rather than the mapping engine doing its work.
 *
 * `null` means the canonical taxonomy has no key for that concept. That is a statement about the
 * canonical side, not about FI-SIM — there is no key for a non-current asset subtotal, so the
 * concept correctly stays unmapped rather than being forced into a neighbouring one.
 *
 * Where two FI-SIM concepts share an expected key, the canonical taxonomy genuinely does not
 * distinguish them. `OtherLongTermLiabilities` and `LongTermLiabilitiesTotal` both land on
 * `long_term_liabilities` because the canonical key doubles as the detail line and the subtotal;
 * that is worth fixing in the canonical taxonomy one day, and this table is where it is visible.
 */

export const FI_SIM_MAPPING_ORACLE: Readonly<Record<string, string | null>> = {
  // Income statement
  ServiceRevenue: "revenue",
  MerchandiseRevenue: "revenue",
  ContractRevenue: "revenue",
  RentalRevenue: "revenue",
  OtherOperatingIncome: "other_operating_income",
  OperatingIncomeTotal: "total_operating_income",
  MerchandiseCost: "cost_of_goods_sold",
  MaterialsAndSubcontractors: "cost_of_goods_sold",
  PersonnelExpense: "payroll_expense",
  PropertyOperatingExpense: "other_operating_expense",
  AdministrativeExpense: "other_operating_expense",
  OtherOperatingExpense: "other_operating_expense",
  DepreciationExpense: "depreciation_amortization",
  OperatingExpenseTotal: "total_operating_expenses",
  OperatingResult: "operating_profit",
  InterestIncome: "financial_income",
  DividendIncome: "financial_income",
  InvestmentGainLoss: "financial_income",
  InterestExpense: "financial_expense",
  OtherFinancialExpense: "financial_expense",
  NetFinancialResult: "net_financial_items",
  ProfitBeforeTax: "profit_before_tax",
  TaxExpense: "tax_expense",
  ProfitForPeriod: "net_income",
  RoundingDifferenceIncome: null,
  UnallocatedResidualIncome: null,

  // Balance sheet
  DevelopmentAssets: "intangible_assets",
  PropertyPlantEquipment: "tangible_assets",
  InvestmentProperty: "tangible_assets",
  LongTermInvestments: "financial_fixed_assets",
  OtherNoncurrentAssets: null,
  NoncurrentAssetsTotal: null,
  Inventory: "inventory",
  ContractAssets: "other_receivables",
  TradeReceivables: "trade_receivables",
  OtherReceivables: "other_receivables",
  Cash: "cash_and_cash_equivalents",
  CurrentAssetsTotal: "current_assets",
  AssetsTotal: "total_assets",
  ShareCapital: "share_capital",
  PaidInPremium: "share_premium",
  AccumulatedResults: "retained_earnings",
  EquityTotal: "total_equity",
  LongTermBankBorrowings: "long_term_debt_credit_institutions",
  OtherLongTermLiabilities: "long_term_liabilities",
  LongTermLiabilitiesTotal: "long_term_liabilities",
  ShortTermBankBorrowings: "short_term_debt_credit_institutions",
  TradePayables: "trade_payables",
  TaxPayable: "tax_payable",
  PayrollAndPublicDutiesPayable: "public_duties_payable",
  OtherCurrentLiabilities: "other_current_liabilities",
  CurrentLiabilitiesTotal: "current_liabilities",
  LiabilitiesTotal: "total_liabilities",
  EquityAndLiabilitiesTotal: "total_equity_and_liabilities",
  RoundingDifferenceBalance: null,
  UnallocatedResidualBalance: null,
};

/**
 * Concepts that *have* an expected canonical key but that the engine cannot reach from their
 * Norwegian label today. Listed so a change in coverage — in either direction — has to be a
 * deliberate edit to this file.
 *
 * These are the lines a demo leaves for a reviewer to map by hand, which is the feature being
 * demonstrated. They are not defects; a defect is a concept that maps to the *wrong* key, and the
 * oracle test forbids that outright.
 *
 * Concepts whose expected key is `null` are not listed here. Nothing is missing for them: the
 * canonical taxonomy simply has no key, and unmapped is the right answer rather than a gap.
 */
export const FI_SIM_CONCEPTS_THE_ENGINE_CANNOT_REACH: readonly string[] = [
  "AccumulatedResults",
  "AdministrativeExpense",
  "ContractAssets",
  "ContractRevenue",
  "CurrentAssetsTotal",
  "DevelopmentAssets",
  "DividendIncome",
  "InterestExpense",
  "InterestIncome",
  "InvestmentGainLoss",
  "InvestmentProperty",
  "LongTermBankBorrowings",
  "LongTermInvestments",
  "MaterialsAndSubcontractors",
  "MerchandiseCost",
  "MerchandiseRevenue",
  "NetFinancialResult",
  "OtherLongTermLiabilities",
  "OtherOperatingExpense",
  "OtherReceivables",
  "PaidInPremium",
  "PropertyOperatingExpense",
  "RentalRevenue",
  "ServiceRevenue",
  "ShortTermBankBorrowings",
];
