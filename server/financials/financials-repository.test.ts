import { describe, expect, it, vi } from "vitest";

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
  it("reads bulk financial headlines without loading line items", async () => {
    const readCompanyFinancials = vi.fn().mockResolvedValue({
      datasetMode: "reported",
      financialDatasetVersion: "reported:21",
      statements: [{
        liveStatementId: "reported:statement-1",
        reportedStatementId: "statement-1",
        companyId: "company-1",
        fiscalYear: 2025,
        statementScope: "COMPANY",
        statementOrigin: "reported",
        financialDatasetVersion: "reported:21",
        taxonomyVersion: null,
        generatorVersion: null,
        sourceSystem: "BRREG",
        sourceEntityType: "annual-account",
        sourceId: "statement-1",
        fetchedAt: new Date("2026-08-07T00:00:00.000Z"),
        normalizedAt: new Date("2026-08-07T00:01:00.000Z"),
        rawPayload: null,
        currency: "NOK",
        unitScale: 1,
        periodStart: null,
        periodEnd: null,
        revenue: 100n,
        operatingProfit: 20n,
        netIncome: 15n,
        equity: 60n,
        assets: 100n,
      }],
      lines: [],
    });
    const repository = createFinancialsRepository({ readCompanyFinancials });

    const result = await repository.getCompaniesFinancialHeadlines({
      companyIds: ["company-1"],
      fiscalYear: 2025,
    });

    expect(readCompanyFinancials).toHaveBeenCalledWith({
      companyIds: ["company-1"],
      fiscalYear: 2025,
      includeLines: false,
    });
    expect(result.statements).toEqual([expect.objectContaining({
      companyId: "company-1",
      fiscalYear: 2025,
      revenue: 100n,
      operatingProfit: 20n,
    })]);
    expect(result.statements[0]).not.toHaveProperty("lines");
  });

  it("rejects a headline whose statement origin downgrades simulated provenance", async () => {
    const repository = createFinancialsRepository({
      readCompanyFinancials: vi.fn().mockResolvedValue({
        datasetMode: "reported",
        financialDatasetVersion: "reported:21",
        statements: [{
          liveStatementId: "simulated:statement-1",
          companyId: "company-1",
          fiscalYear: 2025,
          statementScope: "COMPANY",
          statementOrigin: "hybrid",
          financialDatasetVersion: "reported:21",
          sourceSystem: "BRREG",
          sourceEntityType: "annual-account",
          sourceId: "statement-1",
          fetchedAt: new Date("2026-08-07T00:00:00.000Z"),
          normalizedAt: new Date("2026-08-07T00:01:00.000Z"),
          revenue: 100n,
          operatingProfit: 20n,
        }],
        lines: [],
      }),
    });

    await expect(
      repository.getCompaniesFinancialHeadlines({ companyIds: ["company-1"] }),
    ).rejects.toThrow(/origin/i);
  });

  it("rejects a headline whose live ID namespace does not match its origin", async () => {
    const repository = createFinancialsRepository({
      readCompanyFinancials: vi.fn().mockResolvedValue({
        datasetMode: "reported",
        financialDatasetVersion: "reported:21",
        statements: [{
          liveStatementId: "simulated:statement-1",
          companyId: "company-1",
          fiscalYear: 2025,
          statementScope: "COMPANY",
          statementOrigin: "reported",
          financialDatasetVersion: "reported:21",
          sourceSystem: "BRREG",
          sourceEntityType: "annual-account",
          sourceId: "statement-1",
          fetchedAt: new Date("2026-08-07T00:00:00.000Z"),
          normalizedAt: new Date("2026-08-07T00:01:00.000Z"),
          revenue: 100n,
          operatingProfit: 20n,
        }],
        lines: [],
      }),
    });

    await expect(
      repository.getCompaniesFinancialHeadlines({ companyIds: ["company-1"] }),
    ).rejects.toThrow(/liveStatementId/i);
  });

  it("returns a versioned reported snapshot for a set of companies", async () => {
    const readCompanyFinancials = vi.fn().mockResolvedValue({
      datasetMode: "reported",
      financialDatasetVersion: "reported:21",
      statements: [],
      lines: [],
    });
    const repository = createFinancialsRepository({ readCompanyFinancials });

    const result = await repository.getCompaniesFinancials({
      companyIds: ["company-1", "company-2"],
      statementScope: "COMPANY",
    });

    expect(readCompanyFinancials).toHaveBeenCalledWith({
      companyIds: ["company-1", "company-2"],
      statementScope: "COMPANY",
    });
    expect(result).toEqual({
      datasetMode: "reported",
      financialDatasetVersion: "reported:21",
      statements: [],
    });
  });

  it("rejects dataset metadata whose mode and version disagree", async () => {
    const repository = createFinancialsRepository({
      async readCompanyFinancials() {
        return {
          datasetMode: "simulated",
          financialDatasetVersion: "reported:17",
          statements: [],
          lines: [],
        };
      },
    });

    await expect(
      repository.getCompanyFinancials({ orgNumber: "912345678" }),
    ).rejects.toThrow(/datasetMode/);
  });

  it("returns the active dataset version when a company has no statements", async () => {
    const repository = createFinancialsRepository({
      async readCompanyFinancials() {
        return {
          datasetMode: "reported",
          financialDatasetVersion: "reported:17",
          statements: [],
          lines: [],
        };
      },
    });

    const result = await repository.getCompanyFinancials({
      orgNumber: "912345678",
    });

    expect(result).toEqual({
      datasetMode: "reported",
      financialDatasetVersion: "reported:17",
      statements: [],
    });
  });

  it("assembles validated live statements and lines behind one interface", async () => {
    const repository = createFinancialsRepository({
      async readCompanyFinancials() {
        return {
          datasetMode: "simulated",
          financialDatasetVersion: "simulated:dataset-1:3",
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
              sourceSystem: "FI-SIM",
              sourceEntityType: "simulatedFinancialStatement",
              sourceId: "simulated:dataset-1:company-1:2025:COMPANY",
              fetchedAt: new Date("2026-08-06T00:00:00.000Z"),
              normalizedAt: new Date("2026-08-06T00:01:00.000Z"),
              rawPayload: { datasetVersion: "dataset-1" },
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
              statementOrigin: "hybrid",
              financialDatasetVersion: "simulated:dataset-1:3",
              taxonomyVersion: "FI-SIM-2026.1",
              generatorVersion: "generator-1",
              currency: "NOK",
              unitScale: 1,
              sortOrder: 10,
              reportedSourceSystem: "brreg",
              reportedSourceId: "reported-source-1",
              sourceSystem: "brreg",
              sourceEntityType: "structuredAnnualAccountsLine",
              sourceId: "reported-source-1",
              fetchedAt: new Date("2026-08-06T00:00:00.000Z"),
              normalizedAt: new Date("2026-08-06T00:01:00.000Z"),
              rawPayload: null,
              derivationRuleId: null,
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
              statementOrigin: "hybrid",
              financialDatasetVersion: "simulated:dataset-1:3",
              taxonomyVersion: "FI-SIM-2026.1",
              generatorVersion: "generator-1",
              currency: "NOK",
              unitScale: 1,
              sortOrder: 20,
              reportedSourceSystem: null,
              reportedSourceId: null,
              sourceSystem: "FI-SIM",
              sourceEntityType: "simulatedFinancialLine",
              sourceId: "simulated:line-2",
              fetchedAt: new Date("2026-08-06T00:00:00.000Z"),
              normalizedAt: new Date("2026-08-06T00:01:00.000Z"),
              rawPayload: { derivationRuleId: "residual-1" },
              derivationRuleId: "residual-1",
            },
          ],
        };
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
});
