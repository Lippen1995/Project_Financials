import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cleanup = vi.fn();

vi.mock("@/lib/env", () => ({ default: { cronSecret: "cron-secret" } }));
vi.mock("@/server/services/search-history-service", () => ({
  deleteExpiredSearchHistory: cleanup,
}));

describe("GET /api/internal/search-history-cleanup", () => {
  beforeEach(() => cleanup.mockReset());

  it("rejects requests without the cron secret", async () => {
    const { GET } = await import("@/app/api/internal/search-history-cleanup/route");
    const response = await GET(
      new NextRequest("http://localhost/api/internal/search-history-cleanup"),
    );

    expect(response.status).toBe(401);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("deletes expired history for an authenticated cron request", async () => {
    cleanup.mockResolvedValue(7);
    const { GET } = await import("@/app/api/internal/search-history-cleanup/route");
    const response = await GET(
      new NextRequest("http://localhost/api/internal/search-history-cleanup", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: 7, retentionDays: 30 });
  });
});
