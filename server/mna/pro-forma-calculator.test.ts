import { describe, expect, it } from "vitest";

import { calculateMnaProForma, type MnaBaseFinancials } from "./pro-forma-calculator";

function base(overrides: Partial<MnaBaseFinancials> = {}): MnaBaseFinancials {
  return {
    orgNumber: "111111111",
    name: "Buyer",
    fiscalYear: 2025,
    scope: "CONSOLIDATED",
    currency: "NOK",
    revenue: 1_000n,
    ebit: 100n,
    netIncome: 70n,
    assets: 2_000n,
    equity: 800n,
    depreciationAmortization: 50n,
    ...overrides,
  };
}

const assumptions = {
  purchasePrice: 400n,
  newDebt: 250n,
  newEquity: 100n,
  transactionCosts: 10n,
  fairValueAssetStepUp: 100n,
  fairValueLiabilityStepUp: 20n,
  taxableAssetStepUp: 100n,
  taxRateBps: 2_200,
  annualInterestRateBps: 500,
  annualPpaDepreciationAmortization: 10n,
  annualRevenueSynergies: 100n,
  revenueSynergyEbitMarginBps: 2_000,
  annualCostSynergies: 30n,
  includeTransactionCostsInIncomeStatement: false,
};

describe("calculateMnaProForma", () => {
  it("builds a balanced acquisition pro-forma and an income-statement bridge", () => {
    const result = calculateMnaProForma({
      buyer: base(),
      target: base({
        orgNumber: "222222222",
        name: "Target",
        scope: "COMPANY",
        revenue: 500n,
        ebit: 40n,
        netIncome: 25n,
        assets: 600n,
        equity: 200n,
        depreciationAmortization: 20n,
      }),
      assumptions,
    });

    expect(result.status).toBe("COMPLETE");
    expect(result.incomeStatement).toMatchObject({
      revenue: { proForma: "1600" },
      ebitda: { proForma: "260" },
      ebit: { proForma: "180" },
      netIncome: { proForma: "117" },
    });
    expect(result.balanceSheet).toMatchObject({
      goodwill: "142",
      deferredTaxLiability: "22",
      assets: { proForma: "2782" },
      liabilities: { proForma: "1892" },
      equity: { proForma: "890" },
      balanceCheck: "0",
    });
  });

  it("withholds EBITDA when base depreciation and amortisation is unavailable", () => {
    const result = calculateMnaProForma({
      buyer: base({ depreciationAmortization: null }),
      target: base({ orgNumber: "222222222", depreciationAmortization: 20n }),
      assumptions,
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.incomeStatement.ebit?.proForma).toBe("240");
    expect(result.incomeStatement.ebitda).toBeNull();
    expect(result.missingInputs).toContain("BUYER_BASE_DEPRECIATION_AMORTIZATION");
  });

  it("does not require rates for zero debt and zero revenue synergies", () => {
    const result = calculateMnaProForma({
      buyer: base(),
      target: base({
        orgNumber: "222222222",
        name: "Target",
        revenue: 500n,
        ebit: 40n,
        netIncome: 25n,
        assets: 600n,
        equity: 200n,
        depreciationAmortization: 20n,
      }),
      assumptions: {
        ...assumptions,
        newDebt: 0n,
        annualInterestRateBps: null,
        annualRevenueSynergies: 0n,
        revenueSynergyEbitMarginBps: null,
      },
    });

    expect(result.status).toBe("COMPLETE");
    expect(result.missingInputs).toEqual([]);
    expect(result.incomeStatement.ebit?.proForma).toBe("160");
    expect(result.incomeStatement.netIncome?.proForma).toBe("110");
  });

  it("withholds tax-dependent outputs when the user did not provide a tax rate", () => {
    const result = calculateMnaProForma({
      buyer: base(),
      target: base({
        orgNumber: "222222222",
        assets: 600n,
        equity: 200n,
        revenue: 500n,
        ebit: 40n,
        netIncome: 25n,
        depreciationAmortization: 20n,
      }),
      assumptions: { ...assumptions, taxRateBps: null },
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.incomeStatement.netIncome).toBeNull();
    expect(result.balanceSheet).toBeNull();
    expect(result.missingInputs).toContain("TAX_RATE");
  });

  it("uses gross non-deductible transaction costs consistently in income and equity", () => {
    const result = calculateMnaProForma({
      buyer: base(),
      target: base({
        orgNumber: "222222222",
        assets: 600n,
        equity: 200n,
        revenue: 500n,
        ebit: 40n,
        netIncome: 25n,
        depreciationAmortization: 20n,
      }),
      assumptions: { ...assumptions, includeTransactionCostsInIncomeStatement: true },
    });

    expect(result.incomeStatement.netIncome?.adjustments).toBe("12");
    expect(result.balanceSheet?.equity.adjustments).toBe("90");
    expect(result.balanceSheet?.balanceCheck).toBe("0");
  });

  it("withholds the balance and flags a bargain-purchase residual for reassessment", () => {
    const result = calculateMnaProForma({
      buyer: base(),
      target: base({ orgNumber: "222222222", equity: 500n }),
      assumptions: { ...assumptions, purchasePrice: 100n },
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.balanceSheet).toBeNull();
    expect(result.missingInputs).toContain("BARGAIN_PURCHASE_REASSESSMENT");
  });
});
