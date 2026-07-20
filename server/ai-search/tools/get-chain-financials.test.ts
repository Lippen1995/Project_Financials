import { beforeEach, describe, expect, it, vi } from "vitest";

import { findChainProfile } from "@/server/franchise/chain-service";
import { getLatestFinancialsByOrgNumbers } from "./enrich";
import { getChainFinancialsTool } from "./get-chain-financials";

vi.mock("@/server/franchise/chain-service", () => ({ findChainProfile: vi.fn() }));
vi.mock("./enrich", () => ({ getLatestFinancialsByOrgNumbers: vi.fn() }));

describe("get_chain_financials", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns every chain operator and attaches only real latest financials", async () => {
    vi.mocked(findChainProfile).mockResolvedValue({
      slug: "rema-1000",
      name: "REMA 1000",
      nameKey: "rema 1000",
      naceCode: "47.11",
      naceDescription: "Butikkhandel med bredt vareutvalg",
      storeCount: 2,
      activeStoreCount: 2,
      operatorCount: 2,
      municipalityCount: 2,
      confidence: 0.98,
      builtAt: new Date("2026-07-20T08:00:00.000Z"),
      stores: [],
      operators: [
        { orgNumber: "111111111", name: "Butikkdrift Nord AS", storeCount: 1 },
        { orgNumber: "222222222", name: "Butikkdrift Sør AS", storeCount: 1 },
      ],
    });
    vi.mocked(getLatestFinancialsByOrgNumbers).mockResolvedValue(
      new Map([
        [
          "111111111",
          {
            fiscalYear: 2024,
            currency: "NOK",
            revenue: 100_000_000,
            operatingProfit: 5_000_000,
            netIncome: 4_000_000,
            equity: 10_000_000,
            assets: 20_000_000,
            provenance: {
              sourceSystem: "BRREG",
              sourceEntityType: "annualAccounts",
              sourceId: "statement-2024",
              fetchedAt: "2026-07-20T08:00:00.000Z",
              normalizedAt: "2026-07-20T08:00:00.000Z",
            },
          },
        ],
      ]),
    );

    const result = await getChainFinancialsTool.execute({ chainQuery: "rema1000" });

    expect(getLatestFinancialsByOrgNumbers).toHaveBeenCalledWith(["111111111", "222222222"]);
    expect(result).toMatchObject({
      chain: { slug: "rema-1000", name: "REMA 1000" },
      coverage: { operatorCount: 2, withLatestFinancials: 1, plottableCount: 1 },
      operators: [
        { orgNumber: "111111111", latestFinancials: { revenue: 100_000_000 } },
        { orgNumber: "222222222", latestFinancials: null },
      ],
    });
  });
});
