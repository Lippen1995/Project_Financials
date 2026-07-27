import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const companies = {
  getCompanyByReference: vi.fn(),
};

const ownership = {
  getCompanyOwnershipOverview: vi.fn(),
};

vi.mock("@/server/services/company-service", () => ({
  getCompanyByReference: companies.getCompanyByReference,
}));

vi.mock("@/server/ownership/ownership-overview-service", () => ({
  getCompanyOwnershipOverview: ownership.getCompanyOwnershipOverview,
}));

describe("GET /api/companies/[slug]/group-structure", () => {
  beforeEach(() => {
    companies.getCompanyByReference.mockReset();
    ownership.getCompanyOwnershipOverview.mockReset();
    companies.getCompanyByReference.mockResolvedValue(null);
    ownership.getCompanyOwnershipOverview.mockResolvedValue({});
  });

  it("normalizes a valid organization-number path before lookup", async () => {
    const { GET } = await import("@/app/api/companies/[slug]/group-structure/route");
    const request = new NextRequest("http://localhost/api/companies/928846466/group-structure");

    const response = await GET(request, {
      params: Promise.resolve({ slug: "928 846 466" }),
    });

    expect(response.status).toBe(200);
    expect(ownership.getCompanyOwnershipOverview).toHaveBeenCalledWith({
      orgNumber: "928846466",
      companyName: null,
      requestedYear: undefined,
    });
  });

  it("rejects an invalid company reference before lookup", async () => {
    const { GET } = await import("@/app/api/companies/[slug]/group-structure/route");
    const request = new NextRequest("http://localhost/api/companies/bad/group-structure");

    const response = await GET(request, {
      params: Promise.resolve({ slug: "../bad" }),
    });

    expect(response.status).toBe(400);
    expect(companies.getCompanyByReference).not.toHaveBeenCalled();
    expect(ownership.getCompanyOwnershipOverview).not.toHaveBeenCalled();
  });

  it("rejects a partial year before lookup", async () => {
    const { GET } = await import("@/app/api/companies/[slug]/group-structure/route");
    const request = new NextRequest(
      "http://localhost/api/companies/928846466/group-structure?year=2024suffix",
    );

    const response = await GET(request, {
      params: Promise.resolve({ slug: "928846466" }),
    });

    expect(response.status).toBe(400);
    expect(companies.getCompanyByReference).not.toHaveBeenCalled();
    expect(ownership.getCompanyOwnershipOverview).not.toHaveBeenCalled();
  });
});
