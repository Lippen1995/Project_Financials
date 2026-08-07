import { describe, expect, it, vi } from "vitest";

import { createWatchlistFinancialsService } from "@/server/services/watchlist-financials-service";

const timestamp = new Date("2026-08-07T00:00:00.000Z");

describe("watchlist financials service", () => {
  it("returns versioned statements from one live snapshot", async () => {
    const getCompaniesFinancials = vi.fn().mockResolvedValue({
      datasetMode: "reported",
      financialDatasetVersion: "reported:21",
      statements: [
        {
          companyId: "company-1",
          fiscalYear: 2025,
          statementOrigin: "reported",
          financialDatasetVersion: "reported:21",
          revenue: 100n,
          operatingProfit: 20n,
          netIncome: 15n,
          equity: 60n,
          assets: 100n,
          fetchedAt: timestamp,
          normalizedAt: timestamp,
        },
      ],
    });
    const service = createWatchlistFinancialsService({ getCompaniesFinancials });

    const result = await service.load(["company-1"]);

    expect(getCompaniesFinancials).toHaveBeenCalledWith({
      companyIds: ["company-1"],
      statementScope: "COMPANY",
    });
    expect(result).toEqual({
      datasetMode: "reported",
      financialDatasetVersion: "reported:21",
      statementsByCompany: {
        "company-1": [
          {
            year: 2025,
            revenue: 100,
            operatingProfit: 20,
            netIncome: 15,
            equity: 60,
            assets: 100,
            statementOrigin: "reported",
            financialDatasetVersion: "reported:21",
          },
        ],
      },
    });
  });

  it("fails closed when simulated statements cannot yet be labeled in the watchlist", async () => {
    const service = createWatchlistFinancialsService({
      getCompaniesFinancials: vi.fn().mockResolvedValue({
        datasetMode: "simulated",
        financialDatasetVersion: "simulated:dataset-1:4",
        statements: [],
      }),
    });

    await expect(service.load(["company-1"])).rejects.toThrow(/labeling/i);
  });
});
