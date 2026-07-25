import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findCompanyMock, getCompanyByReferenceMock, getCompanyNewsMock } = vi.hoisted(
  () => ({
    findCompanyMock: vi.fn(),
    getCompanyByReferenceMock: vi.fn(),
    getCompanyNewsMock: vi.fn(),
  }),
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: {
      findUnique: findCompanyMock,
    },
  },
}));

vi.mock("@/server/services/company-service", () => ({
  getCompanyByReference: getCompanyByReferenceMock,
}));

vi.mock("@/server/services/news-aggregator-service", () => ({
  getCompanyNewsWithRelevance: getCompanyNewsMock,
}));

import { GET } from "@/app/api/companies/[slug]/news/route";

describe("GET /api/companies/[slug]/news", () => {
  beforeEach(() => {
    findCompanyMock.mockReset();
    getCompanyByReferenceMock.mockReset();
    getCompanyNewsMock.mockReset();
  });

  it("rejects a non-integer limit before company or database lookup", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/companies/928846466/news?limit=1.5"),
      { params: Promise.resolve({ slug: "928846466" }) },
    );

    expect(response.status).toBe(400);
    expect(getCompanyByReferenceMock).not.toHaveBeenCalled();
    expect(findCompanyMock).not.toHaveBeenCalled();
    expect(getCompanyNewsMock).not.toHaveBeenCalled();
  });
});
