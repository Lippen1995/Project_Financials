import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ safeAuth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { aiSearchJob: { findFirst: mocks.findFirst } } }));

import { GET } from "@/app/api/ai-search/[jobId]/route";

const jobId = "clz8x8y9z0000qwertyuiopas";

describe("GET /api/ai-search/[jobId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only the authenticated owner's stored result", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findFirst.mockResolvedValue({
      id: jobId,
      status: "COMPLETED",
      result: { answer: "Ferdig" },
      errorMessage: null,
      createdAt: new Date("2026-08-15T10:00:00Z"),
      completedAt: new Date("2026-08-15T10:00:05Z"),
    });

    const response = await GET(
      new NextRequest(`http://localhost/api/ai-search/${jobId}`),
      { params: Promise.resolve({ jobId }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: jobId, userId: "user-1" },
    }));
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      jobId,
      status: "COMPLETED",
      result: { answer: "Ferdig" },
    }));
  });

  it("rejects malformed job identifiers before querying the database", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });

    const response = await GET(
      new NextRequest("http://localhost/api/ai-search/not-a-cuid"),
      { params: Promise.resolve({ jobId: "not-a-cuid" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});
