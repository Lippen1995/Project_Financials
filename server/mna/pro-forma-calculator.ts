export type MnaBaseFinancials = {
  orgNumber: string;
  name: string;
  fiscalYear: number;
  scope: "COMPANY" | "CONSOLIDATED";
  currency: string;
  revenue: bigint;
  ebit: bigint;
  netIncome: bigint;
  assets: bigint;
  equity: bigint;
  depreciationAmortization: bigint | null;
};

export type MnaProFormaAssumptions = {
  purchasePrice: bigint;
  newDebt: bigint;
  newEquity: bigint;
  transactionCosts: bigint;
  fairValueAssetStepUp: bigint;
  fairValueLiabilityStepUp: bigint;
  taxableAssetStepUp: bigint;
  taxRateBps: number | null;
  annualInterestRateBps: number | null;
  annualPpaDepreciationAmortization: bigint;
  annualRevenueSynergies: bigint;
  revenueSynergyEbitMarginBps: number | null;
  annualCostSynergies: bigint;
  includeTransactionCostsInIncomeStatement: boolean;
};

export type MnaProFormaResult = {
  status: "COMPLETE" | "PARTIAL";
  currency: "NOK";
  fiscalYear: number;
  missingInputs: string[];
  incomeStatement: {
    revenue: { buyer: string; target: string; adjustments: string; proForma: string };
    ebitda: { buyer: string; target: string; adjustments: string; proForma: string } | null;
    ebit: { buyer: string; target: string; adjustments: string; proForma: string } | null;
    netIncome: { buyer: string; target: string; adjustments: string; proForma: string } | null;
  };
  balanceSheet: {
    purchasePrice: string;
    goodwill: string;
    deferredTaxLiability: string;
    netCashImpact: string;
    assets: { buyer: string; target: string; adjustments: string; proForma: string };
    liabilities: { buyer: string; target: string; adjustments: string; proForma: string };
    equity: { buyer: string; targetEliminated: string; adjustments: string; proForma: string };
    balanceCheck: string;
  } | null;
};

function bps(amount: bigint, basisPoints: number) {
  return amount * BigInt(basisPoints) / 10_000n;
}

function afterTax(amount: bigint, taxRateBps: number) {
  return amount * BigInt(10_000 - taxRateBps) / 10_000n;
}

function absolute(value: bigint) {
  return value < 0n ? -value : value;
}

export function calculateMnaProForma(input: {
  buyer: MnaBaseFinancials;
  target: MnaBaseFinancials;
  assumptions: MnaProFormaAssumptions;
}): MnaProFormaResult {
  const { buyer, target, assumptions } = input;
  if (buyer.fiscalYear !== target.fiscalYear) {
    throw new Error("Buyer and target must use the same fiscal year.");
  }
  if (buyer.currency !== "NOK" || target.currency !== "NOK") {
    throw new Error("M&A pro-forma currently requires NOK base statements.");
  }

  const missingInputs: string[] = [];
  if (buyer.depreciationAmortization === null) {
    missingInputs.push("BUYER_BASE_DEPRECIATION_AMORTIZATION");
  }
  if (target.depreciationAmortization === null) {
    missingInputs.push("TARGET_BASE_DEPRECIATION_AMORTIZATION");
  }
  if (assumptions.taxRateBps === null) {
    missingInputs.push("TAX_RATE");
  }
  if (assumptions.newDebt !== 0n && assumptions.annualInterestRateBps === null) {
    missingInputs.push("NEW_DEBT_INTEREST_RATE");
  }
  if (
    assumptions.annualRevenueSynergies !== 0n &&
    assumptions.revenueSynergyEbitMarginBps === null
  ) {
    missingInputs.push("REVENUE_SYNERGY_EBIT_MARGIN");
  }

  const revenueAdjustment = assumptions.annualRevenueSynergies;
  const proFormaRevenue = buyer.revenue + target.revenue + revenueAdjustment;
  const revenueSynergyEbit = assumptions.annualRevenueSynergies === 0n
    ? 0n
    : assumptions.revenueSynergyEbitMarginBps === null
      ? null
      : bps(assumptions.annualRevenueSynergies, assumptions.revenueSynergyEbitMarginBps);
  const recurringEbitAdjustment = revenueSynergyEbit === null
    ? null
    : revenueSynergyEbit + assumptions.annualCostSynergies -
      assumptions.annualPpaDepreciationAmortization;
  const reportedEbitAdjustment = recurringEbitAdjustment === null
    ? null
    : recurringEbitAdjustment -
      (assumptions.includeTransactionCostsInIncomeStatement ? assumptions.transactionCosts : 0n);
  const proFormaEbit = reportedEbitAdjustment === null
    ? null
    : buyer.ebit + target.ebit + reportedEbitAdjustment;

  const ebitda = buyer.depreciationAmortization === null ||
    target.depreciationAmortization === null ||
    revenueSynergyEbit === null
    ? null
    : (() => {
      const buyerEbitda = buyer.ebit + absolute(buyer.depreciationAmortization);
      const targetEbitda = target.ebit + absolute(target.depreciationAmortization);
      const adjustments = revenueSynergyEbit + assumptions.annualCostSynergies -
        (assumptions.includeTransactionCostsInIncomeStatement ? assumptions.transactionCosts : 0n);
      return {
        buyer: buyerEbitda.toString(),
        target: targetEbitda.toString(),
        adjustments: adjustments.toString(),
        proForma: (buyerEbitda + targetEbitda + adjustments).toString(),
      };
    })();

  const interestExpense = assumptions.newDebt === 0n
    ? 0n
    : assumptions.annualInterestRateBps === null
      ? null
      : bps(assumptions.newDebt, assumptions.annualInterestRateBps);
  const netIncome = assumptions.taxRateBps === null ||
    recurringEbitAdjustment === null ||
    interestExpense === null
    ? null
    : (() => {
      const recurringAfterTax = afterTax(recurringEbitAdjustment, assumptions.taxRateBps!);
      const interestAfterTax = afterTax(interestExpense, assumptions.taxRateBps!);
      const transactionCostsInIncomeStatement = assumptions.includeTransactionCostsInIncomeStatement
        ? assumptions.transactionCosts
        : 0n;
      const adjustments = recurringAfterTax - interestAfterTax - transactionCostsInIncomeStatement;
      return {
        buyer: buyer.netIncome.toString(),
        target: target.netIncome.toString(),
        adjustments: adjustments.toString(),
        proForma: (buyer.netIncome + target.netIncome + adjustments).toString(),
      };
    })();

  const balanceSheet = assumptions.taxRateBps === null
    ? null
    : (() => {
      const buyerLiabilities = buyer.assets - buyer.equity;
      const targetLiabilities = target.assets - target.equity;
      const deferredTaxLiability = bps(
        assumptions.taxableAssetStepUp,
        assumptions.taxRateBps!,
      );
      const fairValueNetAssets = target.equity + assumptions.fairValueAssetStepUp -
        assumptions.fairValueLiabilityStepUp - deferredTaxLiability;
      const goodwill = assumptions.purchasePrice - fairValueNetAssets;
      if (goodwill < 0n) {
        missingInputs.push("BARGAIN_PURCHASE_REASSESSMENT");
        return null;
      }
      const netCashImpact = assumptions.newDebt + assumptions.newEquity -
        assumptions.purchasePrice - assumptions.transactionCosts;
      const assetAdjustments = netCashImpact + assumptions.fairValueAssetStepUp + goodwill;
      const liabilityAdjustments = assumptions.newDebt +
        assumptions.fairValueLiabilityStepUp + deferredTaxLiability;
      const equityAdjustments = assumptions.newEquity - assumptions.transactionCosts;
      const proFormaAssets = buyer.assets + target.assets + assetAdjustments;
      const proFormaLiabilities = buyerLiabilities + targetLiabilities + liabilityAdjustments;
      const proFormaEquity = buyer.equity + equityAdjustments;
      return {
        purchasePrice: assumptions.purchasePrice.toString(),
        goodwill: goodwill.toString(),
        deferredTaxLiability: deferredTaxLiability.toString(),
        netCashImpact: netCashImpact.toString(),
        assets: {
          buyer: buyer.assets.toString(),
          target: target.assets.toString(),
          adjustments: assetAdjustments.toString(),
          proForma: proFormaAssets.toString(),
        },
        liabilities: {
          buyer: buyerLiabilities.toString(),
          target: targetLiabilities.toString(),
          adjustments: liabilityAdjustments.toString(),
          proForma: proFormaLiabilities.toString(),
        },
        equity: {
          buyer: buyer.equity.toString(),
          targetEliminated: (-target.equity).toString(),
          adjustments: equityAdjustments.toString(),
          proForma: proFormaEquity.toString(),
        },
        balanceCheck: (proFormaAssets - proFormaLiabilities - proFormaEquity).toString(),
      };
    })();

  return {
    status: missingInputs.length === 0 ? "COMPLETE" : "PARTIAL",
    currency: "NOK",
    fiscalYear: buyer.fiscalYear,
    missingInputs,
    incomeStatement: {
      revenue: {
        buyer: buyer.revenue.toString(),
        target: target.revenue.toString(),
        adjustments: revenueAdjustment.toString(),
        proForma: proFormaRevenue.toString(),
      },
      ebitda,
      ebit: reportedEbitAdjustment === null || proFormaEbit === null
        ? null
        : {
          buyer: buyer.ebit.toString(),
          target: target.ebit.toString(),
          adjustments: reportedEbitAdjustment.toString(),
          proForma: proFormaEbit.toString(),
        },
      netIncome,
    },
    balanceSheet,
  };
}
