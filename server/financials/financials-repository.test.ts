import { describe, expect, it } from "vitest";

import {
  createFinancialsRepository,
  isInvestorDemoFinancialSimulationEnabled,
} from "@/server/financials/financials-repository";

describe("isInvestorDemoFinancialSimulationEnabled", () => {
  it("requires both the exact demo environment and the off-by-default feature flag", () => {
    expect(
      isInvestorDemoFinancialSimulationEnabled({
        FJORD_DEPLOYMENT_ENVIRONMENT: "investor-demo",
        FJORD_FINANCIAL_SIMULATION_ENABLED: "true",
      }),
    ).toBe(true);
    expect(
      isInvestorDemoFinancialSimulationEnabled({
        FJORD_DEPLOYMENT_ENVIRONMENT: "production",
        FJORD_FINANCIAL_SIMULATION_ENABLED: "true",
      }),
    ).toBe(false);
    expect(
      isInvestorDemoFinancialSimulationEnabled({
        FJORD_DEPLOYMENT_ENVIRONMENT: "investor-demo",
      }),
    ).toBe(false);
  });
});

describe("FinancialsRepository", () => {
  it("assembles validated live statements and lines behind one interface", async () => {
    const repository = createFinancialsRepository({
      async readCompanyFinancials() {
        return {
          statements: [
            {
              liveStatementId: "simulated:dataset-1:company-1:2025:COMPANY",
              reportedStatementId: null,
              companyId: "company-1",
              fiscalYear: 2025,
              statementScope: "COMPANY",
              statementOrigin: "hybrid",
              financialDatasetVersion: "simulated:dataset-1:3",
              taxonomyVersion: "FI-SIM-2026.1",
              generatorVersion: "generator-1",
              currency: "NOK",
              unitScale: 1,
              periodStart: new Date("2025-01-01T00:00:00.000Z"),
              periodEnd: new Date("2025-12-31T00:00:00.000Z"),
              revenue: 100n,
              operatingProfit: 20n,
              netIncome: 15n,
              equity: 60n,
              assets: 100n,
            },
          ],
          lines: [
            {
              liveLineId: "simulated:line-1",
              liveStatementId: "simulated:dataset-1:company-1:2025:COMPANY",
              reportedFinancialLineItemId: "reported-line-1",
              statementType: "INCOME_STATEMENT",
              conceptKey: "OperatingIncomeTotal",
              sourceLabel: "Sum driftsinntekter",
              metricKey: "total_operating_revenue",
              value: 100n,
              valueOrigin: "reported",
              financialDatasetVersion: "simulated:dataset-1:3",
              taxonomyVersion: "FI-SIM-2026.1",
              generatorVersion: "generator-1",
              currency: "NOK",
              unitScale: 1,
              sortOrder: 10,
              reportedSourceSystem: "brreg",
              reportedSourceId: "reported-source-1",
            },
            {
              liveLineId: "simulated:line-2",
              liveStatementId: "simulated:dataset-1:company-1:2025:COMPANY",
              reportedFinancialLineItemId: null,
              statementType: "INCOME_STATEMENT",
              conceptKey: "PersonnelExpense",
              sourceLabel: "Personalkostnader",
              metricKey: null,
              value: 80n,
              valueOrigin: "synthetic",
              financialDatasetVersion: "simulated:dataset-1:3",
              taxonomyVersion: "FI-SIM-2026.1",
              generatorVersion: "generator-1",
              currency: "NOK",
              unitScale: 1,
              sortOrder: 20,
              reportedSourceSystem: null,
              reportedSourceId: null,
            },
          ],
        };
      },
      async readLatestReportedCompanyMetrics() {
        return { financialDatasetVersion: "reported:14", statements: [] };
      },
    });

    const statements = await repository.listCompanyStatements("company-1");

    expect(statements).toHaveLength(1);
    expect(statements[0].statementOrigin).toBe("hybrid");
    expect(statements[0].lines.map((line) => line.valueOrigin)).toEqual([
      "reported",
      "synthetic",
    ]);
  });

  it("returns one latest reported metric row per company and scope", async () => {
    const repository = createFinancialsRepository({
      async readCompanyFinancials() {
        return { statements: [], lines: [] };
      },
      async readLatestReportedCompanyMetrics() {
        return {
          financialDatasetVersion: "reported:14",
          statements: [
            {
              companyId: "company-1",
              reportedStatementId: "statement-company-1",
              orgNumber: "999999999",
              fiscalYear: 2025,
              statementScope: "COMPANY",
              currency: "NOK",
              unitScale: 1,
              revenue: 1_000n,
              ebit: 100n,
              preTaxProfit: 90n,
              preTaxProfitStatus: "AVAILABLE",
              netIncome: 70n,
              equity: 400n,
              totalAssets: 800n,
              financialDatasetVersion: "reported:14",
              valueOrigin: "reported",
              reportedSourceSystem: "BRREG",
              reportedSourceId: "filing-company-1",
              sourceFilingId: "filing-company-1",
              publishedAt: new Date("2026-07-01T00:00:00.000Z"),
              financialFetchedAt: new Date("2026-07-02T00:00:00.000Z"),
              financialNormalizedAt: new Date("2026-07-02T00:01:00.000Z"),
            },
            {
              companyId: "company-1",
              reportedStatementId: "statement-group-1",
              orgNumber: "999999999",
              fiscalYear: 2024,
              statementScope: "CONSOLIDATED",
              currency: "NOK",
              unitScale: 1,
              revenue: 2_000n,
              ebit: 250n,
              preTaxProfit: 225n,
              preTaxProfitStatus: "AVAILABLE",
              netIncome: 175n,
              equity: 700n,
              totalAssets: 1_400n,
              financialDatasetVersion: "reported:14",
              valueOrigin: "reported",
              reportedSourceSystem: "BRREG",
              reportedSourceId: "filing-group-1",
              sourceFilingId: "filing-group-1",
              publishedAt: new Date("2025-07-01T00:00:00.000Z"),
              financialFetchedAt: new Date("2025-07-02T00:00:00.000Z"),
              financialNormalizedAt: new Date("2025-07-02T00:01:00.000Z"),
            },
          ],
        };
      },
    });

    await expect(
      repository.listLatestReportedCompanyMetrics(),
    ).resolves.toEqual({
      financialDatasetVersion: "reported:14",
      statements: expect.arrayContaining([
        expect.objectContaining({
          orgNumber: "999999999",
          statementScope: "COMPANY",
          preTaxProfit: 90n,
        }),
        expect.objectContaining({
          orgNumber: "999999999",
          statementScope: "CONSOLIDATED",
          revenue: 2_000n,
        }),
      ]),
    });
  });
});
