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
});
