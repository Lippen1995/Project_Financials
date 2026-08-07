import { describe, expect, it, vi } from "vitest";

import {
  createBuildMnaProFormaTool,
  type MnaDepreciationRow,
  type MnaFinancialSnapshot,
  type MnaProFormaToolDeps,
  type MnaStatementRow,
} from "./build-mna-pro-forma";

const observedAt = new Date("2026-07-22T08:00:00.000Z");

function statement(
  orgNumber: string,
  values: Partial<MnaStatementRow> = {},
): MnaStatementRow {
  return {
    id: `statement-${orgNumber}`,
    orgNumber,
    name: orgNumber === "111111111" ? "Buyer" : "Target",
    fiscalYear: 2025,
    statementScope: "COMPANY",
    currency: "NOK",
    revenue: orgNumber === "111111111" ? 1_000n : 500n,
    operatingProfit: orgNumber === "111111111" ? 100n : 40n,
    netIncome: orgNumber === "111111111" ? 70n : 25n,
    assets: orgNumber === "111111111" ? 2_000n : 600n,
    equity: orgNumber === "111111111" ? 800n : 200n,
    sourceFilingId: `filing-${orgNumber}`,
    sourceSystem: "BRREG",
    sourceEntityType: "annualAccounts",
    sourceId: `source-${orgNumber}`,
    fetchedAt: observedAt,
    normalizedAt: observedAt,
    ...values,
  };
}

const query = [
  "KjÃ¸pesum 400.",
  "Ny gjeld 250 til 5 prosent rente.",
  "Ny egenkapital 100.",
  "Transaksjonskostnader 10.",
  "Eiendelsoppjustering 100, gjeldsoppjustering 20 og skattepliktig oppjustering 100.",
  "Skattesats 22 prosent.",
  "Ã…rlige PPA-avskrivninger 10.",
  "Ã…rlige inntektssynergier 100 med 20 prosent EBIT-margin.",
  "Ã…rlige kostnadssynergier 30.",
  "Kjøpers avskrivninger er 50 og målselskapets avskrivninger er 20.",
  "Transaksjonskostnadene skal ikke resultatføres.",
].join(" ");

function amount(valueNok: string, evidenceText: string | null = null) {
  return { valueNok, evidenceText };
}

const toolInput = {
  buyerOrgNumber: "111111111",
  targetOrgNumber: "222222222",
  fiscalYear: 2025,
  buyerStatementScope: "AUTO" as const,
  targetStatementScope: "AUTO" as const,
  assumptions: {
    purchasePriceNok: amount("400", "KjÃ¸pesum 400"),
    newDebtNok: amount("250", "Ny gjeld 250"),
    newEquityNok: amount("100", "Ny egenkapital 100"),
    transactionCostsNok: amount("10", "Transaksjonskostnader 10"),
    fairValueAssetStepUpNok: amount("100", "Eiendelsoppjustering 100"),
    fairValueLiabilityStepUpNok: amount("20", "gjeldsoppjustering 20"),
    taxableAssetStepUpNok: amount("100", "skattepliktig oppjustering 100"),
    taxRateBps: { valueBps: 2_200, evidenceText: "Skattesats 22 prosent" },
    annualInterestRateBps: { valueBps: 500, evidenceText: "5 prosent rente" },
    annualPpaDepreciationAmortizationNok: amount("10", "Ã…rlige PPA-avskrivninger 10"),
    annualRevenueSynergiesNok: amount("100", "Ã…rlige inntektssynergier 100"),
    revenueSynergyEbitMarginBps: {
      valueBps: 2_000,
      evidenceText: "20 prosent EBIT-margin",
    },
    annualCostSynergiesNok: amount("30", "Ã…rlige kostnadssynergier 30"),
    buyerBaseDepreciationAmortizationOverrideNok: amount("50", "Kjøpers avskrivninger er 50"),
    targetBaseDepreciationAmortizationOverrideNok: amount("20", "målselskapets avskrivninger er 20"),
    includeTransactionCostsInIncomeStatement: {
      value: false,
      evidenceText: "Transaksjonskostnadene skal ikke resultatføres",
    },
  },
};

function financials(
  statements = [statement("111111111"), statement("222222222")],
  depreciationAmortization: MnaDepreciationRow[] = [],
): MnaFinancialSnapshot {
  return {
    financialDatasetMode: "reported",
    financialDatasetVersion: "reported:22",
    statements,
    depreciationAmortization,
  };
}

function deps(): MnaProFormaToolDeps {
  return {
    getFinancials: vi.fn(async () => financials()),
  };
}

function depreciation(
  orgNumber: string,
  value: bigint,
  currency = "NOK",
): MnaDepreciationRow {
  return {
    orgNumber,
    filingId: `filing-${orgNumber}`,
    statementScope: "COMPANY",
    value,
    currency,
    unitScale: 1,
    publicationSource: "MANUAL_REVIEW",
    publishedAt: observedAt,
    sourceSystem: "BRREG",
    sourceEntityType: "publishedFinancialLineItem",
    sourceId: `line-${orgNumber}-da`,
    fetchedAt: observedAt,
    normalizedAt: observedAt,
  };
}

describe("build_mna_pro_forma", () => {
  it("uses official base accounts and traceable user assumptions to build result and balance", async () => {
    const tool = createBuildMnaProFormaTool({ userQuery: query, deps: deps() });

    const result = await tool.execute(toolInput);

    expect(result).toMatchObject({
      status: "COMPLETE",
      financialDatasetMode: "reported",
      financialDatasetVersion: "reported:22",
      accessRequirement: "DUE_DILIGENCE",
      fiscalYear: 2025,
      incomeStatement: {
        revenue: { proForma: "1600" },
        ebitda: { proForma: "260" },
        ebit: { proForma: "180" },
        netIncome: { proForma: "117" },
      },
      balanceSheet: {
        assets: { proForma: "2782" },
        liabilities: { proForma: "1892" },
        equity: { proForma: "890" },
        balanceCheck: "0",
      },
    });
    if (result.status !== "COMPLETE" && result.status !== "PARTIAL") {
      throw new Error(`Unexpected result status: ${result.status}`);
    }
    expect(result.baseStatements).toHaveLength(2);
    expect(result.baseDepreciationAmortization).toEqual([
      expect.objectContaining({ orgNumber: "111111111", valueNok: "50", origin: "USER_INPUT" }),
      expect.objectContaining({ orgNumber: "222222222", valueNok: "20", origin: "USER_INPUT" }),
    ]);
    expect(result.assumptions.every((item) => item.sourceSystem === "USER_INPUT")).toBe(true);
  });

  it("rejects a non-zero assumption without an exact quote from the current user query", async () => {
    const localDeps = deps();
    const tool = createBuildMnaProFormaTool({ userQuery: query, deps: localDeps });

    const result = await tool.execute({
      ...toolInput,
      assumptions: {
        ...toolInput.assumptions,
        purchasePriceNok: amount("999", "KjÃ¸pesum 400"),
      },
    });

    expect(result).toMatchObject({
      status: "INVALID_USER_INPUT_EVIDENCE",
      issues: [expect.stringContaining("purchasePriceNok")],
    });
    expect(localDeps.getFinancials).not.toHaveBeenCalled();
  });

  it("rejects a rate that does not match the quoted percentage", async () => {
    const localDeps = deps();
    const tool = createBuildMnaProFormaTool({ userQuery: query, deps: localDeps });

    const result = await tool.execute({
      ...toolInput,
      assumptions: {
        ...toolInput.assumptions,
        annualInterestRateBps: { valueBps: 900, evidenceText: "5 prosent rente" },
      },
    });

    expect(result).toMatchObject({
      status: "INVALID_USER_INPUT_EVIDENCE",
      issues: [expect.stringContaining("annualInterestRateBps")],
    });
    expect(localDeps.getFinancials).not.toHaveBeenCalled();
  });

  it("accepts Norwegian dot-separated thousands in assumption evidence", async () => {
    const localizedQuery = query.replace("KjÃ¸pesum 400.", "KjÃ¸pesum 1.000.");
    const tool = createBuildMnaProFormaTool({ userQuery: localizedQuery, deps: deps() });

    const result = await tool.execute({
      ...toolInput,
      assumptions: {
        ...toolInput.assumptions,
        purchasePriceNok: amount("1000", "KjÃ¸pesum 1.000"),
      },
    });

    expect(result.status).toBe("COMPLETE");
  });

  it("does not let the model default unstated assumptions to zero or false", async () => {
    const localDeps = deps();
    const tool = createBuildMnaProFormaTool({ userQuery: "Kjøpesum 400.", deps: localDeps });
    const zero = amount("0", null);

    const result = await tool.execute({
      ...toolInput,
      assumptions: {
        purchasePriceNok: amount("400", "Kjøpesum 400"),
        newDebtNok: zero,
        newEquityNok: zero,
        transactionCostsNok: zero,
        fairValueAssetStepUpNok: zero,
        fairValueLiabilityStepUpNok: zero,
        taxableAssetStepUpNok: zero,
        taxRateBps: null,
        annualInterestRateBps: null,
        annualPpaDepreciationAmortizationNok: zero,
        annualRevenueSynergiesNok: zero,
        revenueSynergyEbitMarginBps: null,
        annualCostSynergiesNok: zero,
        buyerBaseDepreciationAmortizationOverrideNok: null,
        targetBaseDepreciationAmortizationOverrideNok: null,
        includeTransactionCostsInIncomeStatement: { value: false, evidenceText: null },
      },
    });

    expect(result).toMatchObject({
      status: "INVALID_USER_INPUT_EVIDENCE",
      issues: expect.arrayContaining([
        expect.stringContaining("newDebtNok"),
        expect.stringContaining("annualCostSynergiesNok"),
        expect.stringContaining("includeTransactionCostsInIncomeStatement"),
      ]),
    });
    expect(localDeps.getFinancials).not.toHaveBeenCalled();
  });

  it("keeps exact provenance for published depreciation and amortisation", async () => {
    const localDeps = deps();
    vi.mocked(localDeps.getFinancials).mockResolvedValue(financials(undefined, [
      {
        orgNumber: "111111111",
        filingId: "filing-111111111",
        statementScope: "COMPANY",
        value: 999n,
        currency: "NOK",
        unitScale: 1,
        publicationSource: "MACHINE_EXTRACTION",
        publishedAt: new Date("2026-07-22T09:00:00.000Z"),
        sourceSystem: "BRREG",
        sourceEntityType: "publishedFinancialLineItem",
        sourceId: "line-buyer-machine-da",
        fetchedAt: observedAt,
        normalizedAt: observedAt,
      },
      {
        orgNumber: "111111111",
        filingId: "filing-111111111",
        statementScope: "COMPANY",
        value: 50n,
        currency: "NOK",
        unitScale: 1,
        publicationSource: "MANUAL_REVIEW",
        publishedAt: observedAt,
        sourceSystem: "BRREG",
        sourceEntityType: "publishedFinancialLineItem",
        sourceId: "line-buyer-da",
        fetchedAt: observedAt,
        normalizedAt: observedAt,
      },
      {
        orgNumber: "222222222",
        filingId: "filing-222222222",
        statementScope: "COMPANY",
        value: 20n,
        currency: "NOK",
        unitScale: 1,
        publicationSource: "MANUAL_REVIEW",
        publishedAt: observedAt,
        sourceSystem: "BRREG",
        sourceEntityType: "publishedFinancialLineItem",
        sourceId: "line-target-da",
        fetchedAt: observedAt,
        normalizedAt: observedAt,
      },
    ]));
    const tool = createBuildMnaProFormaTool({ userQuery: query, deps: localDeps });

    const result = await tool.execute({
      ...toolInput,
      assumptions: {
        ...toolInput.assumptions,
        buyerBaseDepreciationAmortizationOverrideNok: null,
        targetBaseDepreciationAmortizationOverrideNok: null,
      },
    });

    if (result.status !== "COMPLETE" && result.status !== "PARTIAL") {
      throw new Error(`Unexpected result status: ${result.status}`);
    }
    expect(result.baseDepreciationAmortization).toEqual([
      expect.objectContaining({
        orgNumber: "111111111",
        valueNok: "50",
        origin: "OFFICIAL_FILING",
        provenance: expect.objectContaining({ sourceId: "line-buyer-da" }),
      }),
      expect.objectContaining({
        orgNumber: "222222222",
        origin: "OFFICIAL_FILING",
        provenance: expect.objectContaining({ sourceId: "line-target-da" }),
      }),
    ]);
  });

  it("does not combine a depreciation line in another currency with NOK EBIT", async () => {
    const localDeps = deps();
    vi.mocked(localDeps.getFinancials).mockResolvedValue(financials(undefined, [
      depreciation("111111111", 50n, "USD"),
      depreciation("222222222", 20n),
    ]));
    const tool = createBuildMnaProFormaTool({ userQuery: query, deps: localDeps });

    const result = await tool.execute({
      ...toolInput,
      assumptions: {
        ...toolInput.assumptions,
        buyerBaseDepreciationAmortizationOverrideNok: null,
        targetBaseDepreciationAmortizationOverrideNok: null,
      },
    });

    if (result.status !== "COMPLETE" && result.status !== "PARTIAL") {
      throw new Error(`Unexpected result status: ${result.status}`);
    }
    expect(result.status).toBe("PARTIAL");
    expect(result.incomeStatement.ebitda).toBeNull();
    expect(result.baseDepreciationAmortization[0]).toMatchObject({
      orgNumber: "111111111",
      origin: "UNAVAILABLE",
      valueNok: null,
    });
  });

  it("returns missing base-data fields instead of treating them as zero", async () => {
    const localDeps = deps();
    vi.mocked(localDeps.getFinancials).mockResolvedValue(financials([
      statement("111111111"),
      statement("222222222", { assets: null }),
    ]));
    const tool = createBuildMnaProFormaTool({ userQuery: query, deps: localDeps });

    const result = await tool.execute(toolInput);

    expect(result).toMatchObject({
      status: "INSUFFICIENT_BASE_DATA",
      financialDatasetMode: "reported",
      financialDatasetVersion: "reported:22",
      missingBaseData: ["222222222.assets"],
    });
  });

  it("applies the live line unit scale to depreciation and amortisation", async () => {
    const localDeps = deps();
    vi.mocked(localDeps.getFinancials).mockResolvedValue(financials(undefined, [
      { ...depreciation("111111111", 50n), unitScale: 1_000 },
      depreciation("222222222", 20n),
    ]));
    const tool = createBuildMnaProFormaTool({ userQuery: query, deps: localDeps });

    const result = await tool.execute({
      ...toolInput,
      assumptions: {
        ...toolInput.assumptions,
        buyerBaseDepreciationAmortizationOverrideNok: null,
        targetBaseDepreciationAmortizationOverrideNok: null,
      },
    });

    if (result.status !== "COMPLETE" && result.status !== "PARTIAL") {
      throw new Error(`Unexpected result status: ${result.status}`);
    }
    expect(result.baseDepreciationAmortization[0]).toMatchObject({
      orgNumber: "111111111",
      origin: "OFFICIAL_FILING",
      valueNok: "50000",
    });
  });

  it("rejects an injected simulated financial snapshot until value-origin labels are supported", async () => {
    const localDeps = deps();
    vi.mocked(localDeps.getFinancials).mockResolvedValue({
      ...financials(),
      financialDatasetMode: "simulated",
      financialDatasetVersion: "simulated:investor-demo:23",
    });
    const tool = createBuildMnaProFormaTool({ userQuery: query, deps: localDeps });

    await expect(tool.execute(toolInput)).rejects.toThrow(/labeling/);
  });
});
