import {
  financialsRepository,
  type FinancialsRepository,
} from "@/server/financials/financials-repository";
import { findConcept } from "../catalog/concepts";
import type { FiSimAnchor } from "./generator";

/**
 * Binding reported lines to FI-SIM concepts, from spec section 9.3.
 *
 * This is not the mapping oracle and must never become it. The oracle maps an FI-SIM concept to a
 * canonical metric key so a test can check the mapping engine's work on simulated lines; it is
 * test fasit and the generator may not read it. This table runs the other way: it says which
 * reported line a simulated concept may *reference* as a hard constraint. A binding here never
 * gives a simulated line a metric key — simulated lines are written unmapped and are mapped by the
 * same engine that maps reported ones.
 *
 * Only unambiguous correspondences are listed. `revenue` is absent because which revenue concept
 * it is depends on the profile, and a wrong guess would anchor a shop's turnover to a rental line.
 * `total_equity_and_liabilities` is absent because it is the mirror of total assets: anchoring
 * both sides of the balance equation to two separately extracted figures buys nothing and can
 * only fail.
 */
export const FI_SIM_ANCHOR_BINDINGS: Readonly<Record<string, string>> = {
  total_operating_income: "OperatingIncomeTotal",
  cost_of_goods_sold: "MerchandiseCost",
  payroll_expense: "PersonnelExpense",
  depreciation_amortization: "DepreciationExpense",
  other_operating_expense: "OtherOperatingExpense",
  total_operating_expenses: "OperatingExpenseTotal",
  operating_profit: "OperatingResult",
  net_financial_items: "NetFinancialResult",
  profit_before_tax: "ProfitBeforeTax",
  tax_expense: "TaxExpense",
  net_income: "ProfitForPeriod",

  intangible_assets: "DevelopmentAssets",
  tangible_assets: "PropertyPlantEquipment",
  financial_fixed_assets: "LongTermInvestments",
  deferred_tax_asset: "OtherNoncurrentAssets",
  inventory: "Inventory",
  trade_receivables: "TradeReceivables",
  other_receivables: "OtherReceivables",
  cash_and_cash_equivalents: "Cash",
  current_assets: "CurrentAssetsTotal",
  total_assets: "AssetsTotal",
  share_capital: "ShareCapital",
  share_premium: "PaidInPremium",
  retained_earnings: "AccumulatedResults",
  total_equity: "EquityTotal",
  long_term_debt_credit_institutions: "LongTermBankBorrowings",
  long_term_liabilities: "LongTermLiabilitiesTotal",
  short_term_debt_credit_institutions: "ShortTermBankBorrowings",
  trade_payables: "TradePayables",
  tax_payable: "TaxPayable",
  public_duties_payable: "PayrollAndPublicDutiesPayable",
  other_current_liabilities: "OtherCurrentLiabilities",
  current_liabilities: "CurrentLiabilitiesTotal",
  total_liabilities: "LiabilitiesTotal",
};

export type FiSimCompanyAnchors = {
  companyId: string;
  anchorsByFiscalYear: Record<number, FiSimAnchor[]>;
  /** Metric keys that appeared more than once in a period and were left unbound. */
  ambiguous: Array<{ fiscalYear: number; metricKey: string; count: number }>;
};

export type FiSimAnchorSnapshot = {
  financialDatasetVersion: string;
  companies: Map<string, FiSimCompanyAnchors>;
};

/**
 * Loads and freezes the reported anchors for a set of companies.
 *
 * It reads through the live repository, not the source tables. That keeps the generator out of
 * the source-access register, and it makes the mode check below possible: if the live dataset is
 * already simulated then these "reported" lines would be a previous demo's synthetic figures, and
 * generating on top of them would produce a simulation of a simulation.
 */
export async function loadReportedAnchors(
  params: {
    companyIds: readonly string[];
    fiscalYears: readonly number[];
    statementScope: "COMPANY" | "CONSOLIDATED";
  },
  repository: Pick<FinancialsRepository, "getCompaniesFinancials"> = financialsRepository,
): Promise<FiSimAnchorSnapshot> {
  const snapshot = await repository.getCompaniesFinancials({
    companyIds: [...params.companyIds],
    statementScope: params.statementScope,
  });
  if (snapshot.datasetMode !== "reported") {
    throw new Error(
      "FI-SIM generation needs the reported dataset: anchors cannot be taken from a simulated one",
    );
  }

  const wantedYears = new Set(params.fiscalYears);
  const companies = new Map<string, FiSimCompanyAnchors>();
  for (const companyId of params.companyIds) {
    companies.set(companyId, { companyId, anchorsByFiscalYear: {}, ambiguous: [] });
  }

  for (const statement of snapshot.statements) {
    if (!wantedYears.has(statement.fiscalYear)) continue;
    const company = companies.get(statement.companyId);
    if (!company) continue;

    const byConcept = new Map<string, { anchor: FiSimAnchor; metricKey: string; count: number }>();
    for (const line of statement.lines) {
      if (line.metricKey === null || line.value === null) continue;
      if (line.reportedFinancialLineItemId === null) continue;
      const conceptKey = FI_SIM_ANCHOR_BINDINGS[line.metricKey];
      if (!conceptKey || !findConcept(conceptKey)) continue;

      const existing = byConcept.get(conceptKey);
      if (existing) {
        existing.count += 1;
        continue;
      }
      byConcept.set(conceptKey, {
        metricKey: line.metricKey,
        count: 1,
        anchor: {
          conceptKey,
          reportedFinancialLineItemId: line.reportedFinancialLineItemId,
          value: line.value,
          currency: line.currency,
          unitScale: line.unitScale,
        },
      });
    }

    const anchors: FiSimAnchor[] = [];
    for (const [, entry] of [...byConcept.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      if (entry.count > 1) {
        // Two reported lines claiming the same concept cannot both be the anchor, and picking one
        // would make the choice depend on row order. The concept is simulated instead.
        company.ambiguous.push({
          fiscalYear: statement.fiscalYear,
          metricKey: entry.metricKey,
          count: entry.count,
        });
        continue;
      }
      anchors.push(entry.anchor);
    }
    if (anchors.length > 0) {
      company.anchorsByFiscalYear[statement.fiscalYear] = anchors;
    }
  }

  return { financialDatasetVersion: snapshot.financialDatasetVersion, companies };
}
