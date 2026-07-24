import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/companies/[slug]/raw-financials/route";

describe("GET /api/companies/[slug]/raw-financials", () => {
  it("does not expose PDF- or OCR-derived line items in structured-only beta mode", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/companies/931075268/raw-financials"),
      { params: Promise.resolve({ slug: "931075268" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source: "structured-brreg-only",
      data: [],
      availability: {
        available: false,
        sourceSystem: "BRREG",
      },
    });
  });
});
