import { describe, expect, it, vi } from "vitest";

import {
  financialDisclosureFor,
  SIMULATED_FINANCIALS_NOTICE,
} from "@/lib/financial-simulation-disclosure";
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
          lines: [
            { conceptKey: "OperatingIncomeTotal", metricKey: "total_operating_income", value: 100n, valueOrigin: "reported" },
            { conceptKey: "OperatingResult", metricKey: "operating_profit", value: 20n, valueOrigin: "synthetic" },
            { conceptKey: "ProfitForPeriod", metricKey: "net_income", value: 15n, valueOrigin: "reported" },
            { conceptKey: "EquityTotal", metricKey: "total_equity", value: 60n, valueOrigin: "reported" },
            { conceptKey: "AssetsTotal", metricKey: "total_assets", value: 100n, valueOrigin: "reported" },
          ],
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
      disclosure: financialDisclosureFor("reported", "reported:21"),
      statementsByCompany: {
        "company-1": [
          {
            year: 2025,
            revenue: 100,
            operatingProfit: 20,
            netIncome: 15,
            equity: 60,
            assets: 100,
            origins: {
              revenue: "reported",
              operatingProfit: "synthetic",
              netIncome: "reported",
              equity: "reported",
              assets: "reported",
            },
            statementOrigin: "reported",
            financialDatasetVersion: "reported:21",
          },
        ],
      },
    });
  });

  it("labels a simulated watchlist snapshot instead of refusing to render it", async () => {
    const service = createWatchlistFinancialsService({
      getCompaniesFinancials: vi.fn().mockResolvedValue({
        datasetMode: "simulated",
        financialDatasetVersion: "simulated:dataset-1:4",
        statements: [],
      }),
    });

    const snapshot = await service.load(["company-1"]);

    expect(snapshot.disclosure).toEqual({
      financialDatasetMode: "simulated",
      financialDatasetVersion: "simulated:dataset-1:4",
      simulated: true,
      notice: SIMULATED_FINANCIALS_NOTICE,
    });
  });
});
