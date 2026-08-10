import { describe, expect, it, vi } from "vitest";

import { createCompanyUniverseService } from "./company-universe-service";

const source = {
  sourceSystem: "BRREG",
  sourceEntityType: "company",
  sourceId: "100000001",
  fetchedAt: "2026-07-27T00:00:00.000Z",
  normalizedAt: "2026-07-27T00:00:00.000Z",
};

describe("company universe service", () => {
  // Headline selection — newest year, group statement preferred, official sources only — used to
  // live here as a loop over every statement of every candidate. It is now one snapshot query in
  // FinancialsRepository.searchCompanyUniverse, verified against a real database by
  // npm run financials:verify-simulation-foundation.

  it("uses the same versioned screening and ranking path for callers", async () => {
    const loadCandidates = vi.fn().mockResolvedValue({ candidates: [
      {
        orgNumber: "100000001",
        name: "Company 1",
        legalForm: "AS",
        status: "ACTIVE",
        naceCode: "62.010",
        municipalityNumber: "0301",
        employeeCount: 10,
        companySource: source,
        financials: {
          fiscalYear: 2024,
          revenue: 100,
          operatingProfit: 10,
          operatingMarginBps: 1_000,
          statementOrigin: "reported",
          financialDatasetVersion: "reported:21",
          source: { ...source, sourceEntityType: "annual-account" },
        },
      },
      {
        orgNumber: "100000002",
        name: "Company 2",
        legalForm: "AS",
        status: "ACTIVE",
        naceCode: "62.010",
        municipalityNumber: "0301",
        employeeCount: 20,
        companySource: { ...source, sourceId: "100000002" },
        financials: {
          fiscalYear: 2024,
          revenue: 200,
          operatingProfit: 30,
          operatingMarginBps: 1_500,
          statementOrigin: "reported",
          financialDatasetVersion: "reported:21",
          source: {
            ...source,
            sourceId: "statement-100000002",
            sourceEntityType: "annual-account",
          },
        },
      },
    ], truncated: false, datasetMode: "reported", financialDatasetVersion: "reported:21" });
    const service = createCompanyUniverseService({ loadCandidates });

    const result = await service.run({
      query: {
        version: "company-universe-v1",
        workflow: "SOURCING",
        statuses: ["ACTIVE"],
        missingDataPolicy: "INCLUDE_WITH_GAP",
        limit: 1,
      },
      ranking: [
        { metric: "REVENUE", direction: "HIGHER_BETTER", weight: 100 },
      ],
    });

    expect(loadCandidates).toHaveBeenCalledWith(expect.objectContaining({
      version: "company-universe-v1",
    }));
    expect(result).toMatchObject({
      version: "company-universe-result-v1",
      datasetMode: "reported",
      financialDatasetVersion: "reported:21",
      status: "COMPLETE",
      screeningVersion: "company-screening-v1",
      rankingVersion: "company-ranking-v1",
      included: [{ orgNumber: "100000002", rank: 1 }],
    });
  });

  it("refuses to rank an incomplete candidate pool", async () => {
    const service = createCompanyUniverseService({
      loadCandidates: vi.fn().mockResolvedValue({
        candidates: [],
        truncated: true,
        datasetMode: "reported",
        financialDatasetVersion: "reported:21",
      }),
    });

    const result = await service.run({
      query: {
        version: "company-universe-v1",
        workflow: "MNA_SCREENING",
        statuses: ["ACTIVE"],
        missingDataPolicy: "INCLUDE_WITH_GAP",
        limit: 100,
      },
      ranking: [{ metric: "REVENUE", direction: "HIGHER_BETTER", weight: 100 }],
    });

    expect(result).toMatchObject({
      status: "REFINE_REQUIRED",
      included: [],
      counts: { truncated: 1 },
    });
  });
});
