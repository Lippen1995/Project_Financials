import { describe, expect, it } from "vitest";

import {
  ebitMarginSeries,
  revenueSeries,
  toBankruptcyRows,
  type BankruptCompany,
} from "@/server/services/oversikt-dashboard-service";
import type { WatchlistFinancialStatement } from "@/server/services/watchlist-financials-service";

const timestamp = new Date("2026-08-08T00:00:00.000Z");

function statement(
  year: number,
  revenue: number | null,
  operatingProfit: number | null,
): WatchlistFinancialStatement {
  return {
    year,
    revenue,
    operatingProfit,
    netIncome: null,
    equity: null,
    assets: null,
    origins: {
      revenue: "reported",
      operatingProfit: "reported",
      netIncome: null,
      equity: null,
      assets: null,
    },
    statementOrigin: "reported",
    financialDatasetVersion: "reported:21",
  };
}

function profile(
  id: string,
  name: string,
  overrides: Partial<{
    bankruptcyDate: Date | null;
    snapshotRevenue: number | null;
    sectorLabel: string | null;
    industryTitle: string | null;
  }> = {},
): BankruptCompany {
  return {
    bankruptcyDate: overrides.bankruptcyDate ?? new Date("2026-08-01T00:00:00.000Z"),
    company: {
      id,
      name,
      slug: name.toLowerCase(),
      industryCode:
        overrides.industryTitle === undefined ? null : { title: overrides.industryTitle },
      distressFinancialSnapshot:
        overrides.snapshotRevenue === undefined && overrides.sectorLabel === undefined
          ? null
          : {
              revenue: overrides.snapshotRevenue == null ? null : overrides.snapshotRevenue,
              sectorLabel: overrides.sectorLabel ?? null,
            },
    },
  } as unknown as BankruptCompany;
}

describe("oversikt dashboard figures", () => {
  it("keeps only the five most recent years", () => {
    const statements = [2019, 2020, 2021, 2022, 2023, 2024, 2025].map((year, index) =>
      statement(year, (index + 1) * 100, null),
    );

    expect(revenueSeries(statements)).toEqual([300, 400, 500, 600, 700]);
  });

  it("drops years without a revenue figure instead of emitting a gap", () => {
    expect(revenueSeries([statement(2024, null, 10), statement(2025, 500, 50)])).toEqual([500]);
  });

  it("computes EBIT margin in percent and skips a zero revenue year", () => {
    const series = ebitMarginSeries([
      statement(2023, 0, 10),
      statement(2024, 1000, 250),
      statement(2025, 400, -40),
    ]);

    expect(series).toEqual([25, -10]);
  });

  it("skips a year where the margin has no operating profit", () => {
    expect(ebitMarginSeries([statement(2025, 1000, null)])).toEqual([]);
  });
});

describe("oversikt bankruptcy rows", () => {
  it("assembles rows from the live snapshot and ranks them by latest revenue", () => {
    const rows = toBankruptcyRows(
      [profile("c1", "Small"), profile("c2", "Large")],
      {
        c1: [statement(2024, 100, 10), statement(2025, 200, 20)],
        c2: [statement(2025, 900, 90)],
      },
    );

    expect(rows.map((row) => row.name)).toEqual(["Large", "Small"]);
    expect(rows[1].revenueSeries).toEqual([100, 200]);
    expect(rows[1].ebitMarginSeries).toEqual([10, 10]);
    expect(rows[0].latestRevenue).toBe(900);
  });

  it("rejects a stale distress snapshot when the live dataset has no statement", () => {
    const rows = toBankruptcyRows([profile("c1", "Fallback", { snapshotRevenue: 750 })], {});

    expect(rows).toEqual([]);
  });

  it("excludes a company with neither live figures nor a usable snapshot", () => {
    expect(toBankruptcyRows([profile("c1", "Unknown")], {})).toEqual([]);
    expect(toBankruptcyRows([profile("c2", "Zero", { snapshotRevenue: 0 })], {})).toEqual([]);
  });

  it("prefers the registry industry title over the distress sector label", () => {
    const rows = toBankruptcyRows(
      [
        profile("c1", "Both", { industryTitle: "Bygg", sectorLabel: "Annet", snapshotRevenue: 1 }),
        profile("c2", "LabelOnly", { sectorLabel: "Handel", snapshotRevenue: 1 }),
        profile("c3", "Neither", { snapshotRevenue: 1 }),
      ],
      {
        c1: [statement(2025, 1, 1)],
        c2: [statement(2025, 1, 1)],
        c3: [statement(2025, 1, 1)],
      },
    );

    expect(rows.map((row) => row.sector)).toEqual(["Bygg", "Handel", "—"]);
  });

  it("reports how long ago the bankruptcy was filed", () => {
    const rows = toBankruptcyRows(
      [profile("c1", "Filed", { bankruptcyDate: new Date(Date.now() - 3 * 86_400_000) })],
      { c1: [statement(2025, 100, 10)] },
    );

    expect(rows[0].filedDaysAgo).toBe(3);
  });
});
