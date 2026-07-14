import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeAuth: vi.fn(),
  searchCompanies: vi.fn(),
  searchRegistryCompanies: vi.fn(),
  reserveAiSearchUsage: vi.fn(),
  finalizeAiSearchUsage: vi.fn(),
  releaseAiSearchUsage: vi.fn(),
  recordCompanySearch: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ safeAuth: mocks.safeAuth }));
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
});
