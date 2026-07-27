import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeAuth: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ safeAuth: mocks.safeAuth }));
vi.mock("@/lib/recoverable-error", () => ({ logRecoverableError: vi.fn() }));
vi.mock("@/server/analysis/analysis-read-service", () => ({
  analysisReadService: { get: mocks.get },
}));
vi.mock("@/server/analysis/analysis-service", () => ({
  analysisService: { updateConclusion: vi.fn() },
}));

import { GET } from "./route";

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
