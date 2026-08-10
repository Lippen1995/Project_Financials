import type { FiSimProfileKey } from "../catalog/profiles";

/**
 * Versioned assumption configuration, from spec section 9.1.
 *
 * These bands are the only place a number is invented. They are versioned separately from the
 * generator so a changed band is a changed dataset version rather than a silent redraw of an
 * activated demo, and so a reviewer can argue with the economics without reading the solver.
 *
 * Every band is a real interval that the seed picks a point inside. Nothing here is calibrated
 * against Norwegian accounts — these are plausible shapes for a demonstration, not estimates, and
 * they must never be presented as either.
 */

export const FI_SIM_ASSUMPTION_VERSION = "fi-sim-assumptions-2026.1";

export type Band = { min: number; max: number };

export type FiSimProfileAssumptions = {
  /** Operating income of the earliest generated year, in whole units of the statement currency. */
  baseOperatingIncome: Band;
  /** Year-on-year change applied to operating income for each later year. */
  operatingIncomeGrowth: Band;
  /** Operating result as a share of operating income. */
  operatingMargin: Band;
  /**
   * Operating expenses for a company with no operating income at all. Holding and dormant
   * companies still pay an accountant.
   */
  baseOperatingExpense: Band;
  /** Relative weights for splitting the operating expense total across the profile's cost lines. */
  expenseWeights: Readonly<Record<string, number>>;
  /** Relative weights for splitting operating income across the profile's revenue lines. */
  incomeWeights: Readonly<Record<string, number>>;
  /** Financial items, as a share of operating income (or of total assets when there is none). */
  financialIncomeRate: Band;
  financialExpenseRate: Band;
  /** Tax on a positive profit before tax. A loss carries no tax expense. */
  taxRate: number;
  /** Share of a positive profit assumed distributed in the following year's bridge. */
  distributionRate: Band;
  /** Operating income divided by total assets. Lower means a more asset-heavy business. */
  assetTurnover: Band;
  /** Total assets for a company with no operating income. */
  baseAssets: Band;
  /** Share of total assets held as non-current assets. */
  noncurrentAssetShare: Band;
  assetWeights: Readonly<Record<string, number>>;
  /** Equity as a share of total assets, used to open the multi-year bridge. */
  openingEquityRatio: Band;
  /**
   * Share of total liabilities that is long-term. It must be zero for a profile whose concept
   * set has no long-term liability line: a subtotal with nowhere to sit is an unpublishable
   * statement, not a rounding problem.
   */
  longTermLiabilityShare: Band;
  liabilityWeights: Readonly<Record<string, number>>;
  /** Registered share capital. The Norwegian minimum for an AS is 30 000. */
  shareCapital: Band;
  /**
   * How much of the balance sheet is left for creditors when the equity side has to be made to
   * fit the asset side, or the other way round. Retained profits compound faster than an assumed
   * turnover ratio grows total assets, so by the fifth year the two have to be reconciled.
   */
  liabilityHeadroom: Band;
  /** Probability that an optional catalog concept is published by a given company. */
  optionalConceptRate: number;
};

const COMMON_FINANCIAL = {
  financialIncomeRate: { min: 0.000, max: 0.006 },
  financialExpenseRate: { min: 0.002, max: 0.020 },
  taxRate: 0.22,
  distributionRate: { min: 0, max: 0.5 },
  liabilityHeadroom: { min: 0.05, max: 0.35 },
  optionalConceptRate: 0.5,
} as const;

export const FI_SIM_ASSUMPTIONS: Readonly<Record<FiSimProfileKey, FiSimProfileAssumptions>> = {
  SERVICE: {
    ...COMMON_FINANCIAL,
    baseOperatingIncome: { min: 2_000_000, max: 180_000_000 },
    operatingIncomeGrowth: { min: -0.08, max: 0.22 },
    operatingMargin: { min: -0.04, max: 0.18 },
    baseOperatingExpense: { min: 200_000, max: 2_000_000 },
    incomeWeights: { ServiceRevenue: 0.94, OtherOperatingIncome: 0.06 },
    expenseWeights: {
      PersonnelExpense: 0.62,
      AdministrativeExpense: 0.18,
      OtherOperatingExpense: 0.17,
      DepreciationExpense: 0.03,
    },
    assetTurnover: { min: 1.2, max: 3.0 },
    baseAssets: { min: 500_000, max: 8_000_000 },
    noncurrentAssetShare: { min: 0.05, max: 0.30 },
    assetWeights: {
      PropertyPlantEquipment: 1,
      TradeReceivables: 0.55,
      OtherReceivables: 0.10,
      Cash: 0.35,
    },
    openingEquityRatio: { min: 0.20, max: 0.60 },
    // The SERVICE concept set has no long-term liability line, so all debt is current.
    longTermLiabilityShare: { min: 0, max: 0 },
    liabilityWeights: {
      TradePayables: 0.35,
      PayrollAndPublicDutiesPayable: 0.30,
      TaxPayable: 0.10,
      OtherCurrentLiabilities: 0.25,
    },
    shareCapital: { min: 30_000, max: 1_000_000 },
  },
  TRADE: {
    ...COMMON_FINANCIAL,
    baseOperatingIncome: { min: 3_000_000, max: 400_000_000 },
    operatingIncomeGrowth: { min: -0.10, max: 0.18 },
    operatingMargin: { min: -0.03, max: 0.10 },
    baseOperatingExpense: { min: 300_000, max: 2_500_000 },
    incomeWeights: { MerchandiseRevenue: 0.96, OtherOperatingIncome: 0.04 },
    expenseWeights: {
      MerchandiseCost: 0.70,
      PersonnelExpense: 0.17,
      OtherOperatingExpense: 0.10,
      DepreciationExpense: 0.03,
    },
    assetTurnover: { min: 1.5, max: 4.0 },
    baseAssets: { min: 1_000_000, max: 15_000_000 },
    noncurrentAssetShare: { min: 0.05, max: 0.35 },
    assetWeights: {
      PropertyPlantEquipment: 1,
      Inventory: 0.45,
      TradeReceivables: 0.30,
      OtherReceivables: 0.05,
      Cash: 0.20,
    },
    openingEquityRatio: { min: 0.15, max: 0.50 },
    // The TRADE concept set has no long-term liability line either.
    longTermLiabilityShare: { min: 0, max: 0 },
    liabilityWeights: {
      TradePayables: 0.50,
      ShortTermBankBorrowings: 0.20,
      PayrollAndPublicDutiesPayable: 0.15,
      TaxPayable: 0.05,
      OtherCurrentLiabilities: 0.10,
    },
    shareCapital: { min: 30_000, max: 2_000_000 },
  },
  MANUFACTURING_CONSTRUCTION: {
    ...COMMON_FINANCIAL,
    baseOperatingIncome: { min: 5_000_000, max: 900_000_000 },
    operatingIncomeGrowth: { min: -0.15, max: 0.25 },
    operatingMargin: { min: -0.06, max: 0.14 },
    baseOperatingExpense: { min: 500_000, max: 4_000_000 },
    incomeWeights: {
      ContractRevenue: 0.88,
      MerchandiseRevenue: 0.08,
      OtherOperatingIncome: 0.04,
    },
    expenseWeights: {
      MaterialsAndSubcontractors: 0.52,
      PersonnelExpense: 0.30,
      OtherOperatingExpense: 0.12,
      DepreciationExpense: 0.06,
    },
    assetTurnover: { min: 0.8, max: 2.2 },
    baseAssets: { min: 2_000_000, max: 40_000_000 },
    noncurrentAssetShare: { min: 0.25, max: 0.60 },
    assetWeights: {
      PropertyPlantEquipment: 1,
      Inventory: 0.20,
      ContractAssets: 0.20,
      TradeReceivables: 0.40,
      OtherReceivables: 0.05,
      Cash: 0.15,
    },
    openingEquityRatio: { min: 0.15, max: 0.45 },
    longTermLiabilityShare: { min: 0.15, max: 0.55 },
    liabilityWeights: {
      LongTermBankBorrowings: 1,
      TradePayables: 0.40,
      ShortTermBankBorrowings: 0.15,
      PayrollAndPublicDutiesPayable: 0.20,
      TaxPayable: 0.05,
      OtherCurrentLiabilities: 0.20,
    },
    shareCapital: { min: 100_000, max: 5_000_000 },
  },
  PROPERTY: {
    ...COMMON_FINANCIAL,
    baseOperatingIncome: { min: 1_000_000, max: 120_000_000 },
    operatingIncomeGrowth: { min: -0.05, max: 0.12 },
    operatingMargin: { min: 0.10, max: 0.45 },
    baseOperatingExpense: { min: 200_000, max: 3_000_000 },
    incomeWeights: { RentalRevenue: 0.93, OtherOperatingIncome: 0.07 },
    expenseWeights: {
      PropertyOperatingExpense: 0.45,
      AdministrativeExpense: 0.15,
      OtherOperatingExpense: 0.10,
      DepreciationExpense: 0.30,
    },
    // Property is the asset-heavy extreme: a building turns over its own value slowly.
    assetTurnover: { min: 0.05, max: 0.25 },
    baseAssets: { min: 5_000_000, max: 200_000_000 },
    noncurrentAssetShare: { min: 0.75, max: 0.97 },
    assetWeights: {
      InvestmentProperty: 1,
      TradeReceivables: 0.20,
      OtherReceivables: 0.10,
      Cash: 0.70,
    },
    openingEquityRatio: { min: 0.10, max: 0.45 },
    longTermLiabilityShare: { min: 0.55, max: 0.90 },
    liabilityWeights: {
      LongTermBankBorrowings: 1,
      OtherLongTermLiabilities: 0.15,
      ShortTermBankBorrowings: 0.30,
      TradePayables: 0.25,
      TaxPayable: 0.10,
      OtherCurrentLiabilities: 0.35,
    },
    shareCapital: { min: 30_000, max: 3_000_000 },
  },
  HOLDING_INVESTMENT: {
    ...COMMON_FINANCIAL,
    // Spec 5.5: ordinary operating revenue is not required. Most of these companies have none,
    // so the band opens at zero rather than inventing a service business inside a holding company.
    baseOperatingIncome: { min: 0, max: 6_000_000 },
    operatingIncomeGrowth: { min: -0.20, max: 0.20 },
    operatingMargin: { min: -0.50, max: 0.30 },
    baseOperatingExpense: { min: 50_000, max: 1_500_000 },
    incomeWeights: { OtherOperatingIncome: 1 },
    expenseWeights: { AdministrativeExpense: 0.65, OtherOperatingExpense: 0.35 },
    financialIncomeRate: { min: 0.01, max: 0.08 },
    financialExpenseRate: { min: 0.00, max: 0.03 },
    assetTurnover: { min: 0.02, max: 0.40 },
    baseAssets: { min: 1_000_000, max: 400_000_000 },
    noncurrentAssetShare: { min: 0.60, max: 0.98 },
    assetWeights: {
      LongTermInvestments: 1,
      OtherNoncurrentAssets: 0.10,
      TradeReceivables: 0.10,
      OtherReceivables: 0.15,
      Cash: 0.75,
    },
    openingEquityRatio: { min: 0.35, max: 0.95 },
    longTermLiabilityShare: { min: 0.30, max: 0.90 },
    liabilityWeights: {
      LongTermBankBorrowings: 1,
      OtherLongTermLiabilities: 0.40,
      TaxPayable: 0.20,
      OtherCurrentLiabilities: 0.80,
    },
    shareCapital: { min: 30_000, max: 10_000_000 },
  },
  DORMANT_PRE_REVENUE: {
    ...COMMON_FINANCIAL,
    // Spec 5.6: no income line is required, and a dormant company that reports revenue is not
    // dormant. The band is exactly zero.
    baseOperatingIncome: { min: 0, max: 0 },
    operatingIncomeGrowth: { min: 0, max: 0 },
    operatingMargin: { min: 0, max: 0 },
    baseOperatingExpense: { min: 5_000, max: 400_000 },
    incomeWeights: {},
    expenseWeights: { AdministrativeExpense: 0.7, OtherOperatingExpense: 0.3 },
    financialIncomeRate: { min: 0, max: 0.02 },
    financialExpenseRate: { min: 0, max: 0.01 },
    assetTurnover: { min: 1, max: 1 },
    baseAssets: { min: 30_000, max: 3_000_000 },
    noncurrentAssetShare: { min: 0, max: 0 },
    assetWeights: { Cash: 1, OtherReceivables: 0.1 },
    openingEquityRatio: { min: 0.20, max: 1.00 },
    // A dormant company has no long-term liability concept, and typically no long-term debt.
    longTermLiabilityShare: { min: 0, max: 0 },
    liabilityWeights: { OtherCurrentLiabilities: 1, TaxPayable: 0.1 },
    shareCapital: { min: 30_000, max: 200_000 },
  },
};
