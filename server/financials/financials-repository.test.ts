import { describe, expect, it, vi } from "vitest";

import {
  createFinancialsRepository,
  isInvestorDemoFinancialSimulationEnabled,
  type LiveFinancialsDataSource,
} from "@/server/financials/financials-repository";

/**
 * Every test names only the data-source method it is about. The rest answer with an empty
 * reported snapshot, so adding a method to the interface does not rewrite unrelated tests.
 */
const defaultDataSource: LiveFinancialsDataSource = {
  async readCompanyFinancials() {
    return {
      datasetMode: "reported",
      financialDatasetVersion: "reported:1",
      statements: [],
      lines: [],
    };
  },
  async searchCompanyUniverse() {
    return {
      datasetMode: "reported",
      financialDatasetVersion: "reported:1",
      statements: [],
      truncated: false,
    };
  },
  async aggregateCompanyFinancials() {
    return {
      datasetMode: "reported",
      financialDatasetVersion: "reported:1",
      buckets: [],
    };
  },
};

const headline = {
  liveStatementId: "reported:statement-1",
  reportedStatementId: "statement-1",
  companyId: "company-1",
  fiscalYear: 2025,
  statementScope: "COMPANY" as const,
  statementOrigin: "reported" as const,
  financialDatasetVersion: "reported:21" as const,
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
};

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
    const repository = createFinancialsRepository({ ...defaultDataSource, readCompanyFinancials });

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
      ...defaultDataSource,
      readCompanyFinancials: vi.fn().mockResolvedValue({
        datasetMode: "reported",
        financialDatasetVersion: "reported:21",
        statements: [{
          ...headline,
          liveStatementId: "simulated:statement-1",
          statementOrigin: "hybrid",
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
      ...defaultDataSource,
      readCompanyFinancials: vi.fn().mockResolvedValue({
        datasetMode: "reported",
        financialDatasetVersion: "reported:21",
        statements: [{ ...headline, liveStatementId: "simulated:statement-1" }],
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
    const repository = createFinancialsRepository({ ...defaultDataSource, readCompanyFinancials });

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
      ...defaultDataSource,
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
      ...defaultDataSource,
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
      ...defaultDataSource,
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

describe("FinancialsRepository universe search", () => {
  it("passes the caller's scope preference and source filter to one snapshot", async () => {
    const searchCompanyUniverse = vi.fn().mockResolvedValue({
      datasetMode: "reported",
      financialDatasetVersion: "reported:21",
      statements: [headline],
      truncated: true,
    });
    const repository = createFinancialsRepository({
      ...defaultDataSource,
      searchCompanyUniverse,
    });

    const result = await repository.searchCompanyUniverse({
      companyIds: ["company-1"],
      scopePreference: "CONSOLIDATED",
      reportedSourceSystems: ["BRREG"],
      limit: 1,
    });

    expect(searchCompanyUniverse).toHaveBeenCalledWith({
      companyIds: ["company-1"],
      scopePreference: "CONSOLIDATED",
      reportedSourceSystems: ["BRREG"],
      limit: 1,
    });
    expect(result.statements).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(result.financialDatasetVersion).toBe("reported:21");
  });

  it("refuses a result that names a company twice", async () => {
    // The whole point of the method is one row per company. If the selection ever stops being
    // one row per company the callers would silently keep whichever entry landed last in a Map,
    // which is exactly the non-determinism this replaced.
    const repository = createFinancialsRepository({
      ...defaultDataSource,
      async searchCompanyUniverse() {
        return {
          datasetMode: "reported" as const,
          financialDatasetVersion: "reported:21" as const,
          statements: [headline, { ...headline, liveStatementId: "reported:statement-2" }],
          truncated: false,
        };
      },
    });

    await expect(
      repository.searchCompanyUniverse({ limit: 10 }),
    ).rejects.toThrow(/company twice/i);
  });

  it("refuses a limit that cannot return anything", async () => {
    const repository = createFinancialsRepository(defaultDataSource);

    await expect(repository.searchCompanyUniverse({ limit: 0 })).rejects.toThrow(
      /positive limit/i,
    );
  });

  it("rejects a universe row whose provenance downgrades a simulated statement", async () => {
    const repository = createFinancialsRepository({
      ...defaultDataSource,
      async searchCompanyUniverse() {
        return {
          datasetMode: "simulated" as const,
          financialDatasetVersion: "simulated:dataset-1:3" as const,
          statements: [{
            ...headline,
            liveStatementId: "simulated:dataset-1:company-1:2025:COMPANY",
            statementOrigin: "simulated" as const,
            financialDatasetVersion: "simulated:dataset-1:3" as const,
            sourceSystem: "BRREG",
          }],
          truncated: false,
        };
      },
    });

    await expect(repository.searchCompanyUniverse({ limit: 10 })).rejects.toThrow(
      /FI-SIM statement provenance/i,
    );
  });
});

describe("FinancialsRepository aggregation", () => {
  it("returns dataset-versioned buckets that keep currency and unit apart", async () => {
    const repository = createFinancialsRepository({
      ...defaultDataSource,
      async aggregateCompanyFinancials() {
        return {
          datasetMode: "reported" as const,
          financialDatasetVersion: "reported:21" as const,
          buckets: [
            {
              fiscalYear: 2025,
              statementScope: "COMPANY" as const,
              currency: "NOK",
              unitScale: 1,
              statementCount: 2,
              companyCount: 2,
              revenue: { total: 300n, count: 2 },
              operatingProfit: { total: 40n, count: 2 },
              netIncome: { total: 30n, count: 1 },
              equity: { total: null, count: 0 },
              assets: { total: 200n, count: 2 },
            },
            {
              fiscalYear: 2025,
              statementScope: "COMPANY" as const,
              currency: "EUR",
              unitScale: 1000,
              statementCount: 1,
              companyCount: 1,
              revenue: { total: 5n, count: 1 },
              operatingProfit: { total: 1n, count: 1 },
              netIncome: { total: 1n, count: 1 },
              equity: { total: 2n, count: 1 },
              assets: { total: 9n, count: 1 },
            },
          ],
        };
      },
    });

    const result = await repository.aggregateCompanyFinancials({ fiscalYears: [2025] });

    expect(result.financialDatasetVersion).toBe("reported:21");
    expect(result.buckets.map((bucket) => [bucket.currency, bucket.unitScale])).toEqual([
      ["NOK", 1],
      ["EUR", 1000],
    ]);
    expect(result.buckets[0].equity).toEqual({ total: null, count: 0 });
  });

  it("rejects aggregate metadata whose mode and version disagree", async () => {
    const repository = createFinancialsRepository({
      ...defaultDataSource,
      async aggregateCompanyFinancials() {
        return {
          datasetMode: "simulated" as const,
          financialDatasetVersion: "reported:17" as const,
          buckets: [],
        };
      },
    });

    await expect(
      repository.aggregateCompanyFinancials({}),
    ).rejects.toThrow(/datasetMode/);
  });
});
