import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeAuth: vi.fn(),
  listWorklistExclusions: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ safeAuth: mocks.safeAuth }));
vi.mock("@/server/analysis/analysis-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/analysis/analysis-service")>()),
  analysisService: {
    listWorklistExclusions: mocks.listWorklistExclusions,
  },
}));

import { GET } from "./route";

describe("GET /api/analyses/[analysisId]/worklists/[worklistId]/exclusions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.safeAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.listWorklistExclusions.mockResolvedValue({
      screeningVersion: "company-screening-v1",
      excludedCount: 1,
      items: [{
        orgNumber: "100000002",
        companyName: "Company 100000002",
        reasons: ["REVENUE_BELOW_MINIMUM"],
        sourceBasis: [],
      }],
      nextCursor: null,
    });
  });

  it("returns a bounded page through the access-controlled analysis seam", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/analyses/analysis-1/worklists/worklist-1/exclusions?limit=25",
      ),
      {
        params: Promise.resolve({
          analysisId: "analysis-1",
          worklistId: "worklist-1",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(mocks.listWorklistExclusions).toHaveBeenCalledWith(
      "user-1",
      "analysis-1",
      "worklist-1",
      { cursor: undefined, limit: 25 },
    );
  });

  it("rejects unsigned requests before reading exclusion evidence", async () => {
    mocks.safeAuth.mockResolvedValue(null);
    const response = await GET(
      new NextRequest(
        "http://localhost/api/analyses/analysis-1/worklists/worklist-1/exclusions",
      ),
      {
        params: Promise.resolve({
          analysisId: "analysis-1",
          worklistId: "worklist-1",
        }),
      },
    );

    expect(response.status).toBe(401);
    expect(mocks.listWorklistExclusions).not.toHaveBeenCalled();
  });
});
