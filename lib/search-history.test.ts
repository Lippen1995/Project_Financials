import { describe, expect, it } from "vitest";

import {
  buildSearchHistoryHref,
  filterRowsByRevenueClass,
  summarizeSearchHistory,
} from "@/lib/search-history";

describe("search history", () => {
  it("filters search results by the selected revenue class", () => {
    const rows = [
      { revenue: null },
      { revenue: 9_999_999 },
      { revenue: 10_000_000 },
      { revenue: 49_999_999 },
      { revenue: 50_000_000 },
    ];

    expect(filterRowsByRevenueClass(rows, "FROM_10M_TO_50M")).toEqual([
      { revenue: 10_000_000 },
      { revenue: 49_999_999 },
    ]);
  });

  it("summarizes actual search terms, sectors, revenue classes and activity", () => {
    const summary = summarizeSearchHistory(
      [
        {
          query: "havvind",
          aiAssisted: true,
          city: "Oslo",
          legalForm: "AS",
          status: "ACTIVE",
          revenueClass: "FROM_50M_TO_250M",
          resultCount: 8,
          succeeded: true,
          sectors: [{ code: "35.110", title: "Produksjon av elektrisitet" }],
          searchedAt: new Date("2026-07-13T10:00:00Z"),
        },
        {
          query: "havvind",
          aiAssisted: false,
          city: "Bergen",
          legalForm: "AS",
          status: "ACTIVE",
          revenueClass: "FROM_50M_TO_250M",
          resultCount: 4,
          succeeded: true,
          sectors: [{ code: "35.110", title: "Produksjon av elektrisitet" }],
          searchedAt: new Date("2026-07-12T10:00:00Z"),
        },
        {
          query: "maritim",
          aiAssisted: false,
          city: null,
          legalForm: null,
          status: null,
          revenueClass: "OVER_1B",
          resultCount: 0,
          succeeded: false,
          sectors: [{ code: "50", title: "Sjøtransport" }],
          searchedAt: new Date("2026-06-01T10:00:00Z"),
        },
      ],
      new Date("2026-07-14T12:00:00Z"),
    );

    expect(summary.searchesLast30Days).toBe(2);
    expect(summary.uniqueQueries).toBe(1);
    expect(summary.averageResultCount).toBe(6);
    expect(summary.aiSearchShare).toBe(50);
    expect(summary.topQueries[0]).toMatchObject({ label: "havvind", count: 2 });
    expect(summary.topSectors[0]).toMatchObject({ label: "Produksjon av elektrisitet", count: 2 });
    expect(summary.topRevenueClasses[0]).toMatchObject({ label: "50–250 mill. kr", count: 2 });
    expect(summary.topLocations[0]).toMatchObject({ label: "Bergen", count: 1 });
  });

  it("reconstructs a search URL from a stored event", () => {
    expect(
      buildSearchHistoryHref({
        query: "havvind",
        scope: "industries",
        industryCode: "35",
        city: "Stavanger",
        legalForm: "AS",
        status: "ACTIVE",
        revenueClass: "OVER_1B",
        aiAssisted: true,
      }),
    ).toBe(
      "/search?query=havvind&scope=industries&industryCode=35&city=Stavanger&legalForm=AS&status=ACTIVE&revenueClass=OVER_1B&ai=1",
    );
  });
});
