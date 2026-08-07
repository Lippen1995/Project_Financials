import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCompanyFinancials: vi.fn(),
  legacyReader: vi.fn(),
  readState: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  default: { betaStructuredFinancialsOnly: true },
}));

vi.mock("@/server/financials/financials-repository", () => ({
  financialsRepository: {
    getCompanyFinancials: mocks.getCompanyFinancials,
  },
}));

vi.mock("@/server/financials/published-financials-reader", () => ({
  getPublishedAnnualReportFinancials: mocks.legacyReader,
}));

vi.mock("@/server/services/structured-financials-service", () => ({
  readStructuredFinancialsState: mocks.readState,
}));

vi.mock("@/server/services/structured-financials-queue-service", () => ({
  STRUCTURED_FETCH_STATUS_PENDING: "PENDING",
  enqueueStructuredFinancialsFetch: mocks.enqueue,
}));

import { getPublicCompanyFinancials } from "@/server/services/public-financials-service";

const timestamp = new Date("2026-08-07T00:00:00.000Z");

describe("public financial live-repository boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readState.mockResolvedValue(null);
    mocks.legacyReader.mockResolvedValue({
      statements: [],
      allScopeStatements: [],
      lineItems: [],
      documents: [],
      availability: { available: false },
    });
  });

  it("serves a reported statement only through the live repository snapshot", async () => {
    mocks.getCompanyFinancials.mockResolvedValue({
      datasetMode: "reported",
      financialDatasetVersion: "reported:17",
      statements: [
        {
          liveStatementId: "reported:statement-1",
          reportedStatementId: "statement-1",
          companyId: "company-1",
          fiscalYear: 2025,
          statementScope: "COMPANY",
          statementOrigin: "reported",
          financialDatasetVersion: "reported:17",
          taxonomyVersion: null,
          generatorVersion: null,
          sourceSystem: "BRREG",
          sourceEntityType: "structuredAnnualAccounts",
          sourceId: "journal-1",
          fetchedAt: timestamp,
          normalizedAt: timestamp,
          rawPayload: {
            modelVersion: "brreg-structured-annual-accounts@1",
            canonicalValues: { total_operating_income: 100 },
          },
          currency: "NOK",
          unitScale: 1,
          periodStart: new Date("2025-01-01T00:00:00.000Z"),
          periodEnd: new Date("2025-12-31T00:00:00.000Z"),
          revenue: 100n,
          operatingProfit: 20n,
          netIncome: 15n,
          equity: 60n,
          assets: 100n,
          lines: [],
        },
      ],
    });

    const result = await getPublicCompanyFinancials("912345678");

    expect(mocks.getCompanyFinancials).toHaveBeenCalledWith({
      orgNumber: "912345678",
    });
    expect(mocks.legacyReader).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      datasetMode: "reported",
      financialDatasetVersion: "reported:17",
      statements: [
        {
          liveStatementId: "reported:statement-1",
          statementOrigin: "reported",
          financialDatasetVersion: "reported:17",
          revenue: 100,
          operatingProfit: 20,
          financialValues: { total_operating_income: 100 },
        },
      ],
    });
  });

  it("keeps synthetic line provenance and bypasses reported fetch state", async () => {
    mocks.getCompanyFinancials.mockResolvedValue({
      datasetMode: "simulated",
      financialDatasetVersion: "simulated:dataset-1:4",
      statements: [
        {
          liveStatementId: "simulated:dataset-1:company-1:2025:COMPANY",
          reportedStatementId: null,
          companyId: "company-1",
          fiscalYear: 2025,
          statementScope: "COMPANY",
          statementOrigin: "hybrid",
          financialDatasetVersion: "simulated:dataset-1:4",
          taxonomyVersion: "FI-SIM-2026.1",
          generatorVersion: "generator-1",
          sourceSystem: "FI-SIM",
          sourceEntityType: "simulatedFinancialStatement",
          sourceId: "simulated:dataset-1:company-1:2025:COMPANY",
          fetchedAt: timestamp,
          normalizedAt: timestamp,
          rawPayload: { internal: "must-not-leak" },
          currency: "NOK",
          unitScale: 1,
          periodStart: null,
          periodEnd: null,
          revenue: 100n,
          operatingProfit: 20n,
          netIncome: 15n,
          equity: 60n,
          assets: 100n,
          lines: [
            {
              liveLineId: "simulated:line-reported",
              liveStatementId: "simulated:dataset-1:company-1:2025:COMPANY",
              reportedFinancialLineItemId: "reported-line-1",
              statementType: "INCOME_STATEMENT",
              conceptKey: "OperatingIncomeTotal",
              sourceLabel: "Sum driftsinntekter",
              metricKey: "total_operating_revenue",
              value: 100n,
              valueOrigin: "reported",
              statementOrigin: "hybrid",
              financialDatasetVersion: "simulated:dataset-1:4",
              taxonomyVersion: "FI-SIM-2026.1",
              generatorVersion: "generator-1",
              currency: "NOK",
              unitScale: 1,
              sortOrder: 10,
              reportedSourceSystem: "BRREG",
              reportedSourceId: "source-line-1",
              sourceSystem: "BRREG",
              sourceEntityType: "structuredAnnualAccountsLine",
              sourceId: "source-line-1",
              fetchedAt: timestamp,
              normalizedAt: timestamp,
              rawPayload: { source: "must-not-leak" },
              derivationRuleId: null,
            },
            {
              liveLineId: "simulated:line-synthetic",
              liveStatementId: "simulated:dataset-1:company-1:2025:COMPANY",
              reportedFinancialLineItemId: null,
              statementType: "INCOME_STATEMENT",
              conceptKey: "PersonnelExpense",
              sourceLabel: "Personalkostnader",
              metricKey: null,
              value: 80n,
              valueOrigin: "synthetic",
              statementOrigin: "hybrid",
              financialDatasetVersion: "simulated:dataset-1:4",
              taxonomyVersion: "FI-SIM-2026.1",
              generatorVersion: "generator-1",
              currency: "NOK",
              unitScale: 1,
              sortOrder: 20,
              reportedSourceSystem: null,
              reportedSourceId: null,
              sourceSystem: "FI-SIM",
              sourceEntityType: "simulatedFinancialLine",
              sourceId: "simulated:line-synthetic",
              fetchedAt: timestamp,
              normalizedAt: timestamp,
              rawPayload: { derivationRuleId: "personnel-residual-1" },
              derivationRuleId: "personnel-residual-1",
            },
          ],
        },
      ],
    });

    const result = await getPublicCompanyFinancials("912345678");

    expect(mocks.readState).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(result.statements[0]).toMatchObject({
      statementOrigin: "hybrid",
      taxonomyVersion: "FI-SIM-2026.1",
      rawPayload: undefined,
    });
    expect(result.lineItems.map((line) => line.valueOrigin)).toEqual([
      "reported",
      "synthetic",
    ]);
    expect(result.lineItems[1]).toMatchObject({
      filingId: null,
      publicationSource: "FI_SIM",
      sourceSystem: "FI-SIM",
      metricKey: null,
      statementOrigin: "hybrid",
      derivationRuleId: "personnel-residual-1",
      rawPayload: undefined,
    });
    expect(result.availability.message).toContain("Simulert regnskap");
  });
});
