import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeAuth: vi.fn(),
  list: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ safeAuth: mocks.safeAuth }));
vi.mock("@/lib/recoverable-error", () => ({ logRecoverableError: vi.fn() }));
vi.mock("@/server/analysis/analysis-read-service", () => ({
  analysisReadService: { list: mocks.list },
}));
vi.mock("@/server/analysis/analysis-service", () => ({
  analysisService: { create: vi.fn() },
}));

import { GET } from "./route";

describe("GET /api/analyses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.safeAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.list.mockResolvedValue([]);
  });

  it("lists accessible analyses and forwards the archived filter", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/analyses?includeArchived=true"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ analyses: [] });
    expect(mocks.list).toHaveBeenCalledWith("user-1", { includeArchived: true });
  });

  it("does not expose analyses without a signed-in user", async () => {
    mocks.safeAuth.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost/api/analyses"));

    expect(response.status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
