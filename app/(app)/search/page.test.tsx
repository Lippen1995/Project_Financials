import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { searchCompaniesMock, safeAuthMock, recordCompanySearchMock } = vi.hoisted(() => ({
  searchCompaniesMock: vi.fn(),
  safeAuthMock: vi.fn(),
  recordCompanySearchMock: vi.fn(),
}));

vi.mock("@/server/services/company-service", () => ({
  searchCompanies: searchCompaniesMock,
}));

vi.mock("@/lib/auth", () => ({ safeAuth: safeAuthMock }));
vi.mock("@/server/services/search-history-service", () => ({
  recordCompanySearch: recordCompanySearchMock,
}));

import SearchPage from "@/app/(app)/search/page";

describe("SearchPage", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    searchCompaniesMock.mockReset();
    safeAuthMock.mockReset();
    recordCompanySearchMock.mockReset();
    safeAuthMock.mockResolvedValue(null);
    recordCompanySearchMock.mockResolvedValue("event-id");
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

  it("accepts the public landing page q parameter as a company query", async () => {
    await SearchPage({ searchParams: Promise.resolve({ q: "orgnummer" }) });

    expect(searchCompaniesMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: "orgnummer" }),
    );
  });

  it("records an authenticated search with its real filters, sectors and result count", async () => {
    safeAuthMock.mockResolvedValue({ user: { id: "user-1" } });
    searchCompaniesMock.mockResolvedValue({
      results: [
        {
          company: {
            orgNumber: "000000001",
            name: "WIND_COMPANY",
            status: "ACTIVE",
            industryCode: { code: "35.110", title: "Produksjon av elektrisitet" },
            addresses: [],
            employeeCount: null,
          },
          revenue: 75_000_000,
          revenueFiscalYear: 2025,
          operatingProfit: null,
          netIncome: null,
        },
      ],
      interpretation: {
        originalQuery: "havvind",
        rewrittenQuery: "havvind",
        aiAssisted: true,
        fallbackReason: null,
        companyTerms: [],
        industryTerms: ["havvind"],
        geographicTerm: null,
        geographicType: null,
        intentSummary: null,
        matchedIndustryCodes: [
          { code: "35.110", title: "Produksjon av elektrisitet", score: 90 },
        ],
      },
    });

    const page = await SearchPage({
      searchParams: Promise.resolve({
        query: "havvind",
        industryCode: "35",
        city: "Stavanger",
        legalForm: "AS",
        status: "ACTIVE",
        revenueClass: "FROM_50M_TO_250M",
        searchEventId: "0f47b9f8-f447-4f9d-a842-30e10eb12236",
        ai: "1",
      }),
    });

    expect(page.props.rows).toHaveLength(1);
    expect(recordCompanySearchMock).toHaveBeenCalledWith({
      userId: "user-1",
      eventKey: "0f47b9f8-f447-4f9d-a842-30e10eb12236",
      query: "havvind",
      scope: "companies",
      industryCode: "35",
      city: "Stavanger",
      legalForm: "AS",
      status: "ACTIVE",
      revenueClass: "FROM_50M_TO_250M",
      aiAssisted: true,
      resultCount: 1,
      succeeded: true,
      sectors: [{ code: "35.110", title: "Produksjon av elektrisitet" }],
    });
  });

  it("does not duplicate history when a rendered result is refreshed without an event id", async () => {
    safeAuthMock.mockResolvedValue({ user: { id: "user-1" } });

    await SearchPage({ searchParams: Promise.resolve({ query: "havvind" }) });

    expect(recordCompanySearchMock).not.toHaveBeenCalled();
  });
});
