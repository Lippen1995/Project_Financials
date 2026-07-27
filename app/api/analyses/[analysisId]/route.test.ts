import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeAuth: vi.fn(),
  get: vi.fn(),
  updateDraft: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ safeAuth: mocks.safeAuth }));
vi.mock("@/lib/recoverable-error", () => ({ logRecoverableError: vi.fn() }));
vi.mock("@/server/analysis/analysis-read-service", () => ({
  analysisReadService: { get: mocks.get },
}));
vi.mock("@/server/analysis/analysis-service", () => ({
  analysisService: {
    updateConclusion: vi.fn(),
    updateDraft: mocks.updateDraft,
  },
}));

import { GET, PUT } from "./route";

describe("GET /api/analyses/[analysisId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.safeAuth.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 404 when the access-controlled read seam finds no analysis", async () => {
    mocks.get.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/analyses/analysis-1"),
      { params: Promise.resolve({ analysisId: "analysis-1" }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.get).toHaveBeenCalledWith("user-1", "analysis-1");
  });

  it("returns the access-controlled analysis without remapping its internal contract", async () => {
    mocks.get.mockResolvedValue({ id: "analysis-1", worklists: [] });

    const response = await GET(
      new NextRequest("http://localhost/api/analyses/analysis-1"),
      { params: Promise.resolve({ analysisId: "analysis-1" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      analysis: { id: "analysis-1", worklists: [] },
    });
  });

  it("rejects unsigned requests before reading analysis data", async () => {
    mocks.safeAuth.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/analyses/analysis-1"),
      { params: Promise.resolve({ analysisId: "analysis-1" }) },
    );

    expect(response.status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });
});

describe("PUT /api/analyses/[analysisId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.safeAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.updateDraft.mockResolvedValue(undefined);
  });

  it("updates editable context through the access-controlled write seam", async () => {
    const body = {
      expectedVersion: 2,
      title: "Revidert analyse",
      purpose: "Dokumentert formål.",
      workflow: "SOURCING",
      criteria: { industries: ["62"] },
      universeQuery: {
        version: "company-universe-v1",
        workflow: "SOURCING",
        statuses: ["ACTIVE"],
        missingDataPolicy: "INCLUDE_WITH_GAP",
        limit: 100,
      },
    };

    const response = await PUT(
      new NextRequest("http://localhost/api/analyses/analysis-1", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ analysisId: "analysis-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.updateDraft).toHaveBeenCalledWith("user-1", "analysis-1", body);
  });
});
