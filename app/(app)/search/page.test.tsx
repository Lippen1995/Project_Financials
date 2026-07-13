import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { searchCompaniesMock } = vi.hoisted(() => ({
  searchCompaniesMock: vi.fn(),
}));

vi.mock("@/server/services/company-service", () => ({
  searchCompanies: searchCompaniesMock,
}));

import SearchPage from "@/app/(app)/search/page";

describe("SearchPage", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    searchCompaniesMock.mockReset();
    searchCompaniesMock.mockResolvedValue({
      results: [],
      interpretation: {
        originalQuery: "konkurrenter",
        rewrittenQuery: "konkurrenter",
        aiAssisted: false,
        fallbackReason: null,
        companyTerms: [],
        industryTerms: [],
        geographicTerm: null,
        geographicType: null,
        intentSummary: null,
        matchedIndustryCodes: [],
      },
    });
  });

  it("enables AI interpretation inside the selected company scope", async () => {
    await SearchPage({
      searchParams: Promise.resolve({ query: "konkurrenter", ai: "1" }),
    });

    expect(searchCompaniesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "konkurrenter",
        aiAssisted: true,
      }),
    );
  });

  it("keeps only companies in matched SSB industries for the industry scope", async () => {
    searchCompaniesMock.mockResolvedValue({
      results: [
        {
          company: {
            orgNumber: "000000001",
            name: "MATCHED_COMPANY",
            status: "ACTIVE",
            industryCode: { code: "63.110", title: "MATCHED_INDUSTRY" },
            addresses: [],
            employeeCount: null,
          },
          revenue: null,
          revenueFiscalYear: null,
          operatingProfit: null,
          netIncome: null,
        },
        {
          company: {
            orgNumber: "000000002",
            name: "UNMATCHED_COMPANY",
            status: "ACTIVE",
            industryCode: { code: "01.110", title: "UNMATCHED_INDUSTRY" },
            addresses: [],
            employeeCount: null,
          },
          revenue: null,
          revenueFiscalYear: null,
          operatingProfit: null,
          netIncome: null,
        },
      ],
      interpretation: {
        originalQuery: "MATCHED_INDUSTRY",
        rewrittenQuery: "MATCHED_INDUSTRY",
        aiAssisted: false,
        fallbackReason: null,
        companyTerms: [],
        industryTerms: ["MATCHED_INDUSTRY"],
        geographicTerm: null,
        geographicType: null,
        intentSummary: null,
        matchedIndustryCodes: [{ code: "63", title: "MATCHED_INDUSTRY", score: 50 }],
      },
    });

    const page = await SearchPage({
      searchParams: Promise.resolve({ query: "MATCHED_INDUSTRY", scope: "industries" }),
    });

    expect(page.props.rows).toHaveLength(1);
    expect(page.props.rows[0].name).toBe("MATCHED_COMPANY");
  });
});
