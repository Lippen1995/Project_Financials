import { describe, expect, it, vi } from "vitest";

import { SIMULATED_FINANCIALS_NOTICE } from "@/lib/financial-simulation-disclosure";
import { createNjordFinancialDataReader } from "./njord-financial-data-reader";

const observedAt = new Date("2026-08-07T00:00:00.000Z");

describe("Njord financial data reader", () => {
  it("returns statements and mapped D&A from one reported live snapshot", async () => {
    const findCompanies = vi.fn().mockResolvedValue([
      { id: "company-1", orgNumber: "111111111", name: "Buyer" },
    ]);
    const getCompaniesFinancials = vi.fn().mockResolvedValue({
      datasetMode: "reported",
      financialDatasetVersion: "reported:22",
      statements: [{
        liveStatementId: "reported:statement-1",
        reportedStatementId: "statement-1",
        companyId: "company-1",
        fiscalYear: 2025,
        statementScope: "COMPANY",
        statementOrigin: "reported",
        financialDatasetVersion: "reported:22",
        currency: "NOK",
        revenue: 1_000n,
        operatingProfit: 100n,
        netIncome: 70n,
        equity: 800n,
        assets: 2_000n,
        sourceSystem: "BRREG",
        sourceEntityType: "annualAccounts",
        sourceId: "source-statement-1",
        fetchedAt: observedAt,
        normalizedAt: observedAt,
        lines: [{
          liveLineId: "reported:line-da-1",
          liveStatementId: "reported:statement-1",
          metricKey: "depreciation_amortization",
          value: 50n,
          currency: "NOK",
          unitScale: 1,
          sortOrder: 10,
          valueOrigin: "reported",
          sourceSystem: "BRREG",
          sourceEntityType: "structuredAnnualAccountsLine",
          sourceId: "source-line-da-1",
          fetchedAt: observedAt,
          normalizedAt: observedAt,
        }],
      }],
    });
    const reader = createNjordFinancialDataReader(
      { findCompanies },
      { getCompaniesFinancials },
    );

    const result = await reader.readCompanies(["111111111"]);

    expect(getCompaniesFinancials).toHaveBeenCalledWith({
      companyIds: ["company-1"],
    });
    expect(result).toMatchObject({
      financialDatasetMode: "reported",
      financialDatasetVersion: "reported:22",
      statements: [{
        liveStatementId: "reported:statement-1",
        orgNumber: "111111111",
        name: "Buyer",
        depreciationAmortization: {
          liveLineId: "reported:line-da-1",
          value: 50n,
          sourceId: "source-line-da-1",
        },
      }],
    });
  });

  it("labels a simulated snapshot rather than refusing to answer from it", async () => {
    const reader = createNjordFinancialDataReader(
      {
        findCompanies: vi.fn().mockResolvedValue([
          { id: "company-1", orgNumber: "111111111", name: "Buyer" },
        ]),
      },
      {
        getCompaniesFinancials: vi.fn().mockResolvedValue({
          datasetMode: "simulated",
          financialDatasetVersion: "simulated:demo-1:3",
          statements: [],
        }),
      },
    );

    const snapshot = await reader.readCompanies(["111111111"]);

    expect(snapshot.disclosure).toEqual({
      financialDatasetMode: "simulated",
      financialDatasetVersion: "simulated:demo-1:3",
      simulated: true,
      notice: SIMULATED_FINANCIALS_NOTICE,
    });
  });

  it("withholds D&A when the live statement has more than one mapped candidate", async () => {
    const line = (id: string, value: bigint) => ({
      liveLineId: id,
      metricKey: "depreciation_amortization",
      value,
      currency: "NOK",
      unitScale: 1,
      valueOrigin: "reported",
      financialDatasetVersion: "reported:22",
      sourceSystem: "BRREG",
      sourceEntityType: "structuredAnnualAccountsLine",
      sourceId: id,
      fetchedAt: observedAt,
      normalizedAt: observedAt,
    });
    const reader = createNjordFinancialDataReader(
      {
        findCompanies: vi.fn().mockResolvedValue([
          { id: "company-1", orgNumber: "111111111", name: "Buyer" },
        ]),
      },
      {
        getCompaniesFinancials: vi.fn().mockResolvedValue({
          datasetMode: "reported",
          financialDatasetVersion: "reported:22",
          statements: [{
            liveStatementId: "reported:statement-1",
            companyId: "company-1",
            financialDatasetVersion: "reported:22",
            lines: [line("reported:line-da-1", 50n), line("reported:line-da-2", 60n)],
          }],
        }),
      },
    );

    const result = await reader.readCompanies(["111111111"]);

    expect(result.statements[0]?.depreciationAmortization).toBeNull();
  });
});
