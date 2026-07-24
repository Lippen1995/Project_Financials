import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeAuth: vi.fn(),
  searchCompanies: vi.fn(),
  searchRegistryCompanies: vi.fn(),
  reserveAiSearchUsage: vi.fn(),
  finalizeAiSearchUsage: vi.fn(),
  releaseAiSearchUsage: vi.fn(),
  getAiSearchSubscriptionContext: vi.fn(),
  recordCompanySearch: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ safeAuth: mocks.safeAuth }));
vi.mock("@/server/billing/subscription", () => ({
  getAiSearchSubscriptionContext: mocks.getAiSearchSubscriptionContext,
}));
vi.mock("@/server/services/company-service", () => ({
  searchCompanies: mocks.searchCompanies,
}));
vi.mock("@/server/registry/entity-search-service", () => ({
  searchRegistryCompanies: mocks.searchRegistryCompanies,
}));
vi.mock("@/server/services/search-history-service", () => ({
  reserveAiSearchUsage: mocks.reserveAiSearchUsage,
  finalizeAiSearchUsage: mocks.finalizeAiSearchUsage,
  releaseAiSearchUsage: mocks.releaseAiSearchUsage,
  recordCompanySearch: mocks.recordCompanySearch,
}));

import { GET } from "@/app/api/companies/search/route";

describe("GET /api/companies/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.safeAuth.mockResolvedValue(null);
  });

  it("does not allow anonymous callers to bypass the Premium AI gate", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/companies/search?query=havvind&ai=1"),
    );

    expect(response.status).toBe(403);
    expect(mocks.searchCompanies).not.toHaveBeenCalled();
  });

  it("reserves usage within the Premium billing period", async () => {
    const billingPeriod = {
      periodStart: new Date("2026-07-14T10:00:00.000Z"),
      periodEnd: new Date("2026-08-14T10:00:00.000Z"),
      resetAt: new Date("2026-08-14T10:00:00.000Z"),
      daysUntilReset: 31,
    };
    mocks.safeAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getAiSearchSubscriptionContext.mockResolvedValue({
      premium: true,
      billingPeriod,
    });
    mocks.reserveAiSearchUsage.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/companies/search?query=havvind&ai=1"),
    );

    expect(mocks.reserveAiSearchUsage).toHaveBeenCalledWith("user-1", billingPeriod);
    expect(response.status).toBe(429);
    expect(mocks.searchCompanies).not.toHaveBeenCalled();
  });

  it("reports an unavailable Premium billing period without claiming the quota is spent", async () => {
    mocks.safeAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getAiSearchSubscriptionContext.mockResolvedValue({
      premium: true,
      billingPeriod: null,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/companies/search?query=havvind&ai=1"),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Abonnementsperioden for AI-søk er ikke tilgjengelig.",
    });
    expect(mocks.reserveAiSearchUsage).not.toHaveBeenCalled();
  });

  it("rejects an invalid typeahead limit before searching", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/companies/search?mode=typeahead&limit=-1"),
    );

    expect(response.status).toBe(400);
    expect(mocks.searchRegistryCompanies).not.toHaveBeenCalled();
  });

  it("rejects oversized search input", async () => {
    const query = "a".repeat(201);
    const response = await GET(
      new NextRequest(`http://localhost/api/companies/search?query=${query}`),
    );

    expect(response.status).toBe(400);
    expect(mocks.searchCompanies).not.toHaveBeenCalled();
  });
});
