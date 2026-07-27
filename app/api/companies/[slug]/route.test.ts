import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCompanyProfileMock } = vi.hoisted(() => ({
  getCompanyProfileMock: vi.fn(),
}));

vi.mock("@/server/services/company-service", () => ({
  getCompanyProfile: getCompanyProfileMock,
}));

import { GET } from "@/app/api/companies/[slug]/route";

describe("GET /api/companies/[slug]", () => {
  beforeEach(() => {
    getCompanyProfileMock.mockReset();
    getCompanyProfileMock.mockResolvedValue(null);
  });

  it("rejects an invalid company reference before profile lookup", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/companies/invalid"),
      { params: Promise.resolve({ slug: "../invalid" }) },
    );

    expect(response.status).toBe(400);
    expect(getCompanyProfileMock).not.toHaveBeenCalled();
  });

  it("normalizes a valid organization number before profile lookup", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/companies/928846466"),
      { params: Promise.resolve({ slug: "928 846 466" }) },
    );

    expect(response.status).toBe(404);
    expect(getCompanyProfileMock).toHaveBeenCalledWith("928846466");
  });
});
