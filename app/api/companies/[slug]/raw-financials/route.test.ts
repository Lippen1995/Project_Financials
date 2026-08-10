import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readCompany: vi.fn(),
}));

vi.mock("@/server/financials/raw-financials-reader", () => ({
  rawFinancialsReader: { readCompany: mocks.readCompany },
}));

import { GET } from "@/app/api/companies/[slug]/raw-financials/route";

describe("GET /api/companies/[slug]/raw-financials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readCompany.mockResolvedValue({
      source: "live",
      datasetMode: "reported",
      financialDatasetVersion: "reported:24",
      statements: [],
      data: [],
    });
  });

  it("returns the versioned live response for a valid company and year", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/companies/931075268/raw-financials?year=2025",
      ),
      { params: Promise.resolve({ slug: "931075268" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.readCompany).toHaveBeenCalledWith({
      companyReference: "931075268",
      fiscalYear: 2025,
    });
    await expect(response.json()).resolves.toMatchObject({
      source: "live",
      datasetMode: "reported",
      financialDatasetVersion: "reported:24",
    });
  });

  it("rejects invalid input before reading financial data", async () => {
    const invalidCompany = await GET(
      new NextRequest("http://localhost/api/companies/928846467/raw-financials"),
      { params: Promise.resolve({ slug: "928846467" }) },
    );
    const invalidYear = await GET(
      new NextRequest("http://localhost/api/companies/931075268/raw-financials?year=oops"),
      { params: Promise.resolve({ slug: "931075268" }) },
    );

    expect(invalidCompany.status).toBe(400);
    expect(invalidYear.status).toBe(400);
    expect(mocks.readCompany).not.toHaveBeenCalled();
  });

  it("returns not found when the company reader has no match", async () => {
    mocks.readCompany.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/companies/931075268/raw-financials"),
      { params: Promise.resolve({ slug: "931075268" }) },
    );

    expect(response.status).toBe(404);
  });
});
