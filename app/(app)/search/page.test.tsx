import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { searchCompaniesMock, getGroupEmployeeSummariesMock, safeAuthMock, recordCompanySearchMock, getAiSearchUsageStatusMock, reserveAiSearchUsageMock, finalizeAiSearchUsageMock, releaseAiSearchUsageMock, getAiSearchSubscriptionContextMock, getEconomicsMock, envMock } = vi.hoisted(() => ({
  searchCompaniesMock: vi.fn(),
  getGroupEmployeeSummariesMock: vi.fn(),
  safeAuthMock: vi.fn(),
  recordCompanySearchMock: vi.fn(),
  getAiSearchUsageStatusMock: vi.fn(),
  reserveAiSearchUsageMock: vi.fn(),
  finalizeAiSearchUsageMock: vi.fn(),
  releaseAiSearchUsageMock: vi.fn(),
  getAiSearchSubscriptionContextMock: vi.fn(),
  getEconomicsMock: vi.fn(),
  envMock: { aiSearchBillingEnabled: false },
}));

vi.mock("@/server/services/company-service", () => ({
  searchCompanies: searchCompaniesMock,
}));
vi.mock("@/server/ownership/group-employee-service", () => ({
  getGroupEmployeeSummaries: getGroupEmployeeSummariesMock,
}));

vi.mock("@/lib/auth", () => ({ safeAuth: safeAuthMock }));
vi.mock("@/lib/env", () => ({ default: envMock }));
vi.mock("@/server/billing/subscription", () => ({
  getAiSearchSubscriptionContext: getAiSearchSubscriptionContextMock,
}));
vi.mock("@/server/services/admin-ai-economics-service", () => ({
  getAiRuntimeEconomicsConfig: getEconomicsMock,
}));
vi.mock("@/server/services/search-history-service", () => ({
  recordCompanySearch: recordCompanySearchMock,
  getAiSearchUsageStatus: getAiSearchUsageStatusMock,
  reserveAiSearchUsage: reserveAiSearchUsageMock,
  finalizeAiSearchUsage: finalizeAiSearchUsageMock,
  releaseAiSearchUsage: releaseAiSearchUsageMock,
}));

import SearchPage from "@/app/(app)/search/page";

describe("SearchPage", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    searchCompaniesMock.mockReset();
    getGroupEmployeeSummariesMock.mockReset();
    getGroupEmployeeSummariesMock.mockResolvedValue(new Map());
    safeAuthMock.mockReset();
    recordCompanySearchMock.mockReset();
    getAiSearchUsageStatusMock.mockReset();
    reserveAiSearchUsageMock.mockReset();
    finalizeAiSearchUsageMock.mockReset();
    releaseAiSearchUsageMock.mockReset();
    getAiSearchSubscriptionContextMock.mockReset();
    getEconomicsMock.mockReset();
    envMock.aiSearchBillingEnabled = false;
    safeAuthMock.mockResolvedValue(null);
    recordCompanySearchMock.mockResolvedValue("event-id");
    getAiSearchUsageStatusMock.mockResolvedValue({
      enabled: true,
      tokenLimit: 41_000_000,
      usedTokens: 0,
      remainingTokens: 41_000_000,
      usagePercent: 0,
      billingPeriod: {
        periodStart: new Date("2026-07-14T10:00:00Z"),
        periodEnd: new Date("2026-08-14T10:00:00Z"),
        resetAt: new Date("2026-08-14T10:00:00Z"),
        daysUntilReset: 31,
      },
    });
    getAiSearchSubscriptionContextMock.mockResolvedValue({
      premium: true,
      tokenLimit: 1_000_000,
      userMonthlyCostLimitNok: 100,
      usageCategory: "CUSTOMER",
      appRole: "USER",
      subscriptionPlan: "premium",
      subscriptionStatus: "ACTIVE",
      billingPeriod: {
        periodStart: new Date("2026-07-14T10:00:00Z"),
        periodEnd: new Date("2026-08-14T10:00:00Z"),
        resetAt: new Date("2026-08-14T10:00:00Z"),
        daysUntilReset: 31,
      },
    });
    getEconomicsMock.mockResolvedValue({
      runtimeEnabled: true,
      billingCurrency: "USD",
      exchangeRateNok: 10,
      fxRiskBufferBps: 1_500,
      inputPricePerMillion: 1,
      cachedInputPricePerMillion: 0.1,
      outputPricePerMillion: 8,
      globalMonthlyBudgetNok: 2_500,
      requestCostLimitNok: 25,
      dailyRequestLimit: 50,
      internalMonthlyTokenAllowance: 500_000,
      version: 1,
    });
    reserveAiSearchUsageMock.mockResolvedValue("reservation-1");
    finalizeAiSearchUsageMock.mockResolvedValue(1);
    releaseAiSearchUsageMock.mockResolvedValue(1);
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
    envMock.aiSearchBillingEnabled = true;
    safeAuthMock.mockResolvedValue({
      user: { id: "user-1", subscriptionPlan: "premium", subscriptionStatus: "ACTIVE" },
    });
    await SearchPage({
      searchParams: Promise.resolve({ query: "konkurrenter", ai: "1" }),
    });

    expect(searchCompaniesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "konkurrenter",
        aiAssisted: true,
      }),
      expect.any(Object),
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

  it("adds the consolidated employee count for parents with controlled subsidiaries", async () => {
    searchCompaniesMock.mockResolvedValue({
      results: [{
        company: {
          orgNumber: "922493626",
          name: "REACH SUBSEA ASA",
          status: "ACTIVE",
          industryCode: null,
          addresses: [],
          employeeCount: 5,
        },
        revenue: null,
        revenueFiscalYear: null,
        operatingProfit: null,
        netIncome: null,
      }],
      interpretation: {
        originalQuery: "Reach Subsea",
        rewrittenQuery: "Reach Subsea",
        aiAssisted: false,
        fallbackReason: null,
        companyTerms: ["Reach Subsea"],
        industryTerms: [],
        geographicTerm: null,
        geographicType: null,
        intentSummary: null,
        matchedIndustryCodes: [],
      },
    });
    getGroupEmployeeSummariesMock.mockResolvedValue(new Map([[
      "922493626",
      {
        employeeCount: 307,
        companyCount: 2,
        coveredCompanyCount: 2,
        complete: true,
        traversalTruncated: false,
        ownershipYear: 2025,
      },
    ]]));

    const page = await SearchPage({
      searchParams: Promise.resolve({ query: "Reach Subsea" }),
    });

    expect(getGroupEmployeeSummariesMock).toHaveBeenCalledWith([
      { orgNumber: "922493626", employeeCount: 5 },
    ]);
    expect(page.props.rows[0]).toMatchObject({
      employeeCount: 5,
      groupEmployeeCount: 307,
      groupEmployeeCountComplete: true,
      groupEmployeeCompanyCount: 2,
      groupEmployeeOwnershipYear: 2025,
    });
  });

  it("reports group employee lookup failures without hiding the company's own count", async () => {
    searchCompaniesMock.mockResolvedValue({
      results: [{
        company: {
          orgNumber: "922493626",
          name: "REACH SUBSEA ASA",
          status: "ACTIVE",
          industryCode: null,
          addresses: [],
          employeeCount: 5,
        },
        revenue: null,
        revenueFiscalYear: null,
        operatingProfit: null,
        netIncome: null,
      }],
      interpretation: {
        originalQuery: "Reach Subsea",
        rewrittenQuery: "Reach Subsea",
        aiAssisted: false,
        fallbackReason: null,
        companyTerms: ["Reach Subsea"],
        industryTerms: [],
        geographicTerm: null,
        geographicType: null,
        intentSummary: null,
        matchedIndustryCodes: [],
      },
    });
    getGroupEmployeeSummariesMock.mockRejectedValue(new Error("ownership unavailable"));

    const page = await SearchPage({
      searchParams: Promise.resolve({ query: "Reach Subsea" }),
    });

    expect(page.props.rows[0].employeeCount).toBe(5);
    expect(page.props.groupEmployeeError).toContain("midlertidig utilgjengelig");
  });

  it("runs without AI when the Premium token quota is exhausted", async () => {
    envMock.aiSearchBillingEnabled = true;
    safeAuthMock.mockResolvedValue({
      user: { id: "user-1", subscriptionPlan: "premium", subscriptionStatus: "ACTIVE" },
    });
    getAiSearchUsageStatusMock.mockResolvedValue({
      enabled: true,
      tokenLimit: 41_000_000,
      usedTokens: 41_000_000,
      remainingTokens: 0,
      usagePercent: 100,
      billingPeriod: {
        periodStart: new Date("2026-07-14T10:00:00Z"),
        periodEnd: new Date("2026-08-14T10:00:00Z"),
        resetAt: new Date("2026-08-14T10:00:00Z"),
        daysUntilReset: 31,
      },
    });
    reserveAiSearchUsageMock.mockResolvedValue(null);

    const page = await SearchPage({
      searchParams: Promise.resolve({ query: "konkurrenter", ai: "1" }),
    });

    expect(searchCompaniesMock).toHaveBeenCalledWith(
      expect.objectContaining({ aiAssisted: false }),
      expect.any(Object),
    );
    expect(page.props.aiAccessMessage).toContain("kostnads-, dags- eller tokenrammen");
  });

  it("accepts the public landing page q parameter as a company query", async () => {
    await SearchPage({ searchParams: Promise.resolve({ q: "orgnummer" }) });

    expect(searchCompaniesMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: "orgnummer" }),
      expect.any(Object),
    );
  });

  it("rejects oversized server-rendered AI queries before reserving or calling the provider", async () => {
    envMock.aiSearchBillingEnabled = true;
    safeAuthMock.mockResolvedValue({
      user: { id: "user-1", subscriptionPlan: "premium", subscriptionStatus: "ACTIVE" },
    });

    const page = await SearchPage({
      searchParams: Promise.resolve({ query: "a".repeat(201), ai: "1" }),
    });

    expect(reserveAiSearchUsageMock).not.toHaveBeenCalled();
    expect(searchCompaniesMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: undefined, aiAssisted: false }),
      expect.any(Object),
    );
    expect(page.props.searchError).toContain("200 tegn");
    expect(page.props.aiAccessMessage).toContain("lengre enn 200 tegn");
  });

  it("records an authenticated search with its real filters, sectors and result count", async () => {
    envMock.aiSearchBillingEnabled = true;
    safeAuthMock.mockResolvedValue({
      user: { id: "user-1", subscriptionPlan: "premium", subscriptionStatus: "ACTIVE" },
    });
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
