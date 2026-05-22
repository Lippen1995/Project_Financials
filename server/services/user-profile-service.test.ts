import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  companyFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: {
      findMany: prismaMocks.companyFindMany,
    },
  },
}));

vi.mock("@/server/services/workspace-service", () => ({
  ensureUserWorkspaceState: vi.fn(),
}));

describe("user profile company search", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("maps matched companies into onboarding search results", async () => {
    prismaMocks.companyFindMany.mockResolvedValue([
      {
        id: "company-1",
        slug: "fjord-insight",
        name: "Fjord Insight AS",
        orgNumber: "123456789",
        industryCode: {
          title: "Business intelligence",
          description: "Analytics software",
        },
        addresses: [{ city: "Oslo", region: "Oslo" }],
      },
    ]);

    const { searchCompaniesForProfile } = await import("@/server/services/user-profile-service");
    const results = await searchCompaniesForProfile("fjord");

    expect(results).toEqual([
      {
        id: "company-1",
        slug: "fjord-insight",
        name: "Fjord Insight AS",
        orgNumber: "123456789",
        location: "Oslo, Oslo",
        sector: "Business intelligence",
        logoUrl: null,
      },
    ]);
  });

  it("returns no results for too-short queries so manual entry can take over", async () => {
    const { searchCompaniesForProfile } = await import("@/server/services/user-profile-service");
    const results = await searchCompaniesForProfile("f");

    expect(results).toEqual([]);
    expect(prismaMocks.companyFindMany).not.toHaveBeenCalled();
  });
});
