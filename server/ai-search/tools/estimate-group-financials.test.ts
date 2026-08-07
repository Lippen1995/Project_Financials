import { describe, expect, it } from "vitest";

import {
  createEstimateGroupFinancialsTool,
  type GroupFinancialSnapshot,
  type GroupFinancialsDeps,
  type GroupFinancialStatementRow,
  type GroupDepreciationRow,
} from "./estimate-group-financials";

const at = new Date("2026-07-20T08:00:00.000Z");

function statement(
  orgNumber: string,
  fiscalYear: number,
  operatingProfit: bigint | null,
  netIncome: bigint | null,
): GroupFinancialStatementRow {
  return {
    id: `statement-${orgNumber}-${fiscalYear}`,
    orgNumber,
    fiscalYear,
    statementScope: "COMPANY",
    currency: "NOK",
    operatingProfit,
    netIncome,
    sourceFilingId: `filing-${orgNumber}-${fiscalYear}`,
    sourceSystem: "BRREG",
    sourceEntityType: "annualAccounts",
    sourceId: `source-${orgNumber}-${fiscalYear}`,
    fetchedAt: at,
    normalizedAt: at,
  };
}

function depreciation(
  orgNumber: string,
  fiscalYear: number,
  value: bigint,
): GroupDepreciationRow {
  return {
    id: `da-${orgNumber}-${fiscalYear}`,
    orgNumber,
    fiscalYear,
    filingId: `filing-${orgNumber}-${fiscalYear}`,
    currency: "NOK",
    finalInput: value,
    value,
    unitScale: 1,
    publicationSource: "MANUAL_REVIEW",
    publishedAt: at,
    sourceSystem: "BRREG",
    sourceEntityType: "annualReportLineItem",
    sourceId: `da-source-${orgNumber}-${fiscalYear}`,
    fetchedAt: at,
    normalizedAt: at,
  };
}

function financials(
  statements: GroupFinancialStatementRow[] = [
    statement("111111111", 2024, 100n, 80n),
    statement("222222222", 2024, 40n, 30n),
  ],
  depreciationRows: GroupDepreciationRow[] = [
    depreciation("111111111", 2024, 20n),
    depreciation("222222222", 2024, 10n),
  ],
): GroupFinancialSnapshot {
  return {
    financialDatasetMode: "reported",
    financialDatasetVersion: "reported:22",
    statements,
    depreciationRows,
  };
}

function deps(overrides: Partial<GroupFinancialsDeps> = {}): GroupFinancialsDeps {
  return {
    getCompany: async () => ({ orgNumber: "111111111", name: "Test parent" }),
    getOwnershipAvailableYears: async () => [2024],
    getOwnershipProvenance: async (taxYear, orgNumber) => ({
      orgNumber,
      sourceSystem: "SKATTEETATEN_CSV",
      sourceEntityType: "shareholder_register_csv",
      sourceId: `ownership-${taxYear}`,
      fetchedAt: at.toISOString(),
      normalizedAt: at.toISOString(),
      importStatus: "COMPLETED",
    }),
    getSubsidiaryTraversal: async () => ({ orgNumbers: ["222222222"], truncated: false }),
    getFinancials: async () => financials(),
    ...overrides,
  };
}

describe("estimate_group_financials", () => {
  it("calculates complete additive EBIT, EBITDA-like and net income without calling them consolidated accounts", async () => {
    const tool = createEstimateGroupFinancialsTool(deps());

    const result = await tool.execute({ parentOrgNumber: "111111111", years: 1 });

    expect(result.answerStatus).toBe("CALCULATED_UNADJUSTED_PRO_FORMA");
    expect(result).toMatchObject({
      financialDatasetMode: "reported",
      financialDatasetVersion: "reported:22",
    });
    expect(result.canRepresentConsolidatedAccounts).toBe(false);
    expect(result.years[0]).toMatchObject({
      fiscalYear: 2024,
      entityCount: 2,
      ownershipSnapshot: { taxYear: 2024, basis: "EXACT_YEAR" },
      ebit: { unadjustedAmount: { currency: "NOK", value: "140" }, complete: true },
      ebitdaLike: { unadjustedAmount: { currency: "NOK", value: "170" }, complete: true },
      netIncome: { unadjustedAmount: { currency: "NOK", value: "110" }, complete: true },
    });
    expect(result.limitations).toContain("Interne transaksjoner og mellomværender er ikke eliminert.");
  });

  it("returns only explicit partial sums when one subsidiary statement is missing", async () => {
    const tool = createEstimateGroupFinancialsTool(deps({
      getFinancials: async () => financials(
        [statement("111111111", 2024, 100n, 80n)],
        [depreciation("111111111", 2024, 20n)],
      ),
    }));

    const result = await tool.execute({ parentOrgNumber: "111111111", years: 1 });
    const year = result.years[0]!;

    expect(result.answerStatus).toBe("INSUFFICIENT_DATA");
    expect(year.ebit.unadjustedAmount).toBeNull();
    expect(year.ebit.partialAmountsByCurrency).toEqual([{ currency: "NOK", value: "100" }]);
    expect(year.ebit.missingOrgNumbers).toEqual(["222222222"]);
    expect(year.netIncome.unadjustedAmount).toBeNull();
  });

  it("does not calculate EBITDA-like when depreciation and amortisation is unavailable", async () => {
    const tool = createEstimateGroupFinancialsTool(deps({
      getFinancials: async () => financials(undefined, []),
    }));

    const result = await tool.execute({ parentOrgNumber: "111111111", years: 1 });

    expect(result.years[0]?.ebit.complete).toBe(true);
    expect(result.years[0]?.ebitdaLike.complete).toBe(false);
    expect(result.years[0]?.ebitdaLike.unadjustedAmount).toBeNull();
    expect(result.years[0]?.ebitdaLike.missingOrgNumbers).toEqual(["111111111", "222222222"]);
  });

  it("marks a reused ownership snapshot as an assumption and reports a truncated graph", async () => {
    const tool = createEstimateGroupFinancialsTool(deps({
      getOwnershipAvailableYears: async () => [2023],
      getSubsidiaryTraversal: async () => ({ orgNumbers: ["222222222"], truncated: true }),
    }));

    const result = await tool.execute({ parentOrgNumber: "111111111", years: 1 });

    expect(result.years[0]?.ownershipSnapshot).toMatchObject({
      taxYear: 2023,
      basis: "NEAREST_PRIOR_YEAR_ASSUMPTION",
    });
    expect(result.years[0]?.ownershipTraversalTruncated).toBe(true);
    expect(result.years[0]?.ebit.complete).toBe(false);
    expect(result.years[0]?.ebit.unadjustedAmount).toBeNull();
  });

  it("keeps the ownership coverage visible when no fiscal year can be established", async () => {
    const subsidiaries = Array.from({ length: 27 }, (_, index) => String(index + 1).padStart(9, "0"));
    const tool = createEstimateGroupFinancialsTool(deps({
      getSubsidiaryTraversal: async () => ({ orgNumbers: subsidiaries, truncated: false }),
      getFinancials: async () => financials([], []),
    }));

    const result = await tool.execute({ parentOrgNumber: "111111111", years: 5 });

    expect(result.answerStatus).toBe("INSUFFICIENT_DATA");
    expect(result.currentOwnershipSnapshot).toMatchObject({
      taxYear: 2024,
      subsidiaryCount: 27,
      traversalTruncated: false,
    });
    expect(result.years).toEqual([]);
  });

  it("uses the absolute, unit-scaled depreciation expense as the EBITDA-like add-back", async () => {
    const scaledNegative = {
      ...depreciation("111111111", 2024, -20n),
      unitScale: 1_000,
    };
    const scaledPositive = {
      ...depreciation("222222222", 2024, 10n),
      unitScale: 1_000,
    };
    const tool = createEstimateGroupFinancialsTool(deps({
      getFinancials: async () => financials(undefined, [scaledNegative, scaledPositive]),
    }));

    const result = await tool.execute({ parentOrgNumber: "111111111", years: 1 });

    expect(result.years[0]?.ebitdaLike.unadjustedAmount).toEqual({
      currency: "NOK",
      value: "30140",
    });
  });

  it("never treats a future ownership snapshot as complete historical evidence", async () => {
    const tool = createEstimateGroupFinancialsTool(deps({
      getOwnershipAvailableYears: async () => [2025],
    }));

    const result = await tool.execute({ parentOrgNumber: "111111111", years: 1 });

    expect(result.years[0]?.ownershipSnapshot.basis).toBe("EARLIEST_AVAILABLE_YEAR_ASSUMPTION");
    expect(result.years[0]?.ebit.complete).toBe(false);
    expect(result.answerStatus).toBe("INSUFFICIENT_DATA");
  });

  it("does not mark figures complete when the shareholder-register import was partial", async () => {
    const tool = createEstimateGroupFinancialsTool(deps({
      getOwnershipProvenance: async (taxYear, orgNumber) => ({
        orgNumber,
        sourceSystem: "SKATTEETATEN_CSV",
        sourceEntityType: "derivedOwnershipGraph",
        sourceId: `ownership-${taxYear}`,
        fetchedAt: at.toISOString(),
        normalizedAt: at.toISOString(),
        importStatus: "PARTIAL",
      }),
    }));

    const result = await tool.execute({ parentOrgNumber: "111111111", years: 1 });

    expect(result.years[0]?.ownershipSnapshot.provenance?.importStatus).toBe("PARTIAL");
    expect(result.years[0]?.ebit.complete).toBe(false);
    expect(result.answerStatus).toBe("INSUFFICIENT_DATA");
  });

  it("prefers a published consolidated statement and withholds additive pro-forma totals", async () => {
    const consolidated: GroupFinancialStatementRow = {
      ...statement("111111111", 2024, 900n, 700n),
      id: "consolidated-2024",
      statementScope: "CONSOLIDATED",
      sourceId: "consolidated-source-2024",
    };
    const tool = createEstimateGroupFinancialsTool(deps({
      getFinancials: async () => financials([
        statement("111111111", 2024, 100n, 80n),
        statement("222222222", 2024, 40n, 30n),
        consolidated,
      ]),
    }));

    const result = await tool.execute({ parentOrgNumber: "111111111", years: 1 });

    expect(result.years[0]?.publishedConsolidatedStatement).toMatchObject({
      operatingProfit: { currency: "NOK", value: "900" },
      netIncome: { currency: "NOK", value: "700" },
    });
    expect(result.years[0]?.ebit.unadjustedAmount).toBeNull();
    expect(result.answerStatus).toBe("INSUFFICIENT_DATA");
  });

  it("rejects an injected simulated snapshot until value-origin labels are supported", async () => {
    const tool = createEstimateGroupFinancialsTool(deps({
      getFinancials: async () => ({
        ...financials(),
        financialDatasetMode: "simulated",
        financialDatasetVersion: "simulated:investor-demo:23",
      }),
    }));

    await expect(
      tool.execute({ parentOrgNumber: "111111111", years: 1 }),
    ).rejects.toThrow(/labeling/);
  });

  it("rejects a calculation when the live dataset version changes between reads", async () => {
    let readCount = 0;
    const tool = createEstimateGroupFinancialsTool(deps({
      getFinancials: async () => {
        readCount += 1;
        return {
          ...financials(),
          financialDatasetVersion: readCount === 1 ? "reported:22" : "reported:23",
        };
      },
    }));

    await expect(
      tool.execute({ parentOrgNumber: "111111111", years: 1 }),
    ).rejects.toThrow(/changed/);
  });
});
