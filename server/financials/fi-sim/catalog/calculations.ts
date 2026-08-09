import type { StatementFamily } from "./concepts";

/**
 * FI-SIM-2026.1 calculation relationships, from spec section 8.
 *
 * These identities must hold exactly after residual handling. They are expressed as data rather
 * than as arithmetic in the generator so the validator can check the same structure the
 * presentation layer renders, and so a change to an identity is a change to one table.
 *
 * "Absent optional children are treated as absent, not as published zero lines" — a sum is over
 * the children actually present on the statement.
 */

export type CalculationOperand = {
  conceptKey: string;
  /** How the operand enters its parent's sum. */
  weight: 1 | -1;
};

export type CalculationRelationship = {
  /** The concept whose value the operands must reconcile to. */
  parentConceptKey: string;
  statementFamily: StatementFamily;
  operands: readonly CalculationOperand[];
  /**
   * True when the parent totals whichever permitted children a profile actually published,
   * rather than a fixed operand list. The validator resolves the operand set per statement.
   */
  totalsActiveChildren: boolean;
};

const plus = (conceptKey: string): CalculationOperand => ({ conceptKey, weight: 1 });
const minus = (conceptKey: string): CalculationOperand => ({ conceptKey, weight: -1 });

export const FI_SIM_CALCULATIONS: readonly CalculationRelationship[] = [
  {
    parentConceptKey: "OperatingIncomeTotal",
    statementFamily: "INCOME_STATEMENT",
    operands: [
      plus("ServiceRevenue"),
      plus("MerchandiseRevenue"),
      plus("ContractRevenue"),
      plus("RentalRevenue"),
      plus("OtherOperatingIncome"),
    ],
    totalsActiveChildren: true,
  },
  {
    parentConceptKey: "OperatingExpenseTotal",
    statementFamily: "INCOME_STATEMENT",
    operands: [
      plus("MerchandiseCost"),
      plus("MaterialsAndSubcontractors"),
      plus("PersonnelExpense"),
      plus("PropertyOperatingExpense"),
      plus("AdministrativeExpense"),
      plus("OtherOperatingExpense"),
      plus("DepreciationExpense"),
    ],
    totalsActiveChildren: true,
  },
  {
    parentConceptKey: "OperatingResult",
    statementFamily: "INCOME_STATEMENT",
    operands: [plus("OperatingIncomeTotal"), minus("OperatingExpenseTotal")],
    totalsActiveChildren: false,
  },
  {
    parentConceptKey: "NetFinancialResult",
    statementFamily: "INCOME_STATEMENT",
    operands: [
      plus("InterestIncome"),
      plus("DividendIncome"),
      plus("InvestmentGainLoss"),
      minus("InterestExpense"),
      minus("OtherFinancialExpense"),
    ],
    totalsActiveChildren: true,
  },
  {
    parentConceptKey: "ProfitBeforeTax",
    statementFamily: "INCOME_STATEMENT",
    operands: [plus("OperatingResult"), plus("NetFinancialResult")],
    totalsActiveChildren: false,
  },
  {
    parentConceptKey: "ProfitForPeriod",
    statementFamily: "INCOME_STATEMENT",
    operands: [plus("ProfitBeforeTax"), minus("TaxExpense")],
    totalsActiveChildren: false,
  },

  {
    parentConceptKey: "NoncurrentAssetsTotal",
    statementFamily: "BALANCE_SHEET",
    operands: [
      plus("DevelopmentAssets"),
      plus("PropertyPlantEquipment"),
      plus("InvestmentProperty"),
      plus("LongTermInvestments"),
      plus("OtherNoncurrentAssets"),
    ],
    totalsActiveChildren: true,
  },
  {
    parentConceptKey: "CurrentAssetsTotal",
    statementFamily: "BALANCE_SHEET",
    operands: [
      plus("Inventory"),
      plus("ContractAssets"),
      plus("TradeReceivables"),
      plus("OtherReceivables"),
      plus("Cash"),
    ],
    totalsActiveChildren: true,
  },
  {
    parentConceptKey: "AssetsTotal",
    statementFamily: "BALANCE_SHEET",
    operands: [plus("NoncurrentAssetsTotal"), plus("CurrentAssetsTotal")],
    totalsActiveChildren: false,
  },
  {
    parentConceptKey: "EquityTotal",
    statementFamily: "BALANCE_SHEET",
    operands: [plus("ShareCapital"), plus("PaidInPremium"), plus("AccumulatedResults")],
    totalsActiveChildren: true,
  },
  {
    parentConceptKey: "LongTermLiabilitiesTotal",
    statementFamily: "BALANCE_SHEET",
    operands: [plus("LongTermBankBorrowings"), plus("OtherLongTermLiabilities")],
    totalsActiveChildren: true,
  },
  {
    parentConceptKey: "CurrentLiabilitiesTotal",
    statementFamily: "BALANCE_SHEET",
    operands: [
      plus("ShortTermBankBorrowings"),
      plus("TradePayables"),
      plus("TaxPayable"),
      plus("PayrollAndPublicDutiesPayable"),
      plus("OtherCurrentLiabilities"),
    ],
    totalsActiveChildren: true,
  },
  {
    parentConceptKey: "LiabilitiesTotal",
    statementFamily: "BALANCE_SHEET",
    operands: [plus("LongTermLiabilitiesTotal"), plus("CurrentLiabilitiesTotal")],
    totalsActiveChildren: false,
  },
  {
    parentConceptKey: "EquityAndLiabilitiesTotal",
    statementFamily: "BALANCE_SHEET",
    operands: [plus("EquityTotal"), plus("LiabilitiesTotal")],
    totalsActiveChildren: false,
  },
];

/**
 * The balance-sheet equation. Held separately because it relates two totals that each already
 * have their own relationship, rather than defining a parent from children.
 */
export const FI_SIM_BALANCE_IDENTITY = {
  left: "AssetsTotal",
  right: "EquityAndLiabilitiesTotal",
} as const;

export function calculationFor(parentConceptKey: string): CalculationRelationship | null {
  return FI_SIM_CALCULATIONS.find((rel) => rel.parentConceptKey === parentConceptKey) ?? null;
}
