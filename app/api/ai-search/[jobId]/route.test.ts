import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ safeAuth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { aiSearchJob: { findFirst: mocks.findFirst } } }));

import { GET } from "@/app/api/ai-search/[jobId]/route";

describe("GET /api/ai-search/[jobId]", () => {
  it("returns only the authenticated owner's stored result", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findFirst.mockResolvedValue({
      id: "job-1",
      status: "COMPLETED",
      result: { answer: "Ferdig" },
      errorMessage: null,
      createdAt: new Date("2026-08-15T10:00:00Z"),
      completedAt: new Date("2026-08-15T10:00:05Z"),
    });

    const response = await GET(
      new NextRequest("http://localhost/api/ai-search/job-1"),
      { params: Promise.resolve({ jobId: "job-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "job-1", userId: "user-1" },
    }));
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      jobId: "job-1",
      status: "COMPLETED",
      result: { answer: "Ferdig" },
    }));
  });
});
