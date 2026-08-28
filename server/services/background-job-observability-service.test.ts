import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  backgroundJobRun: {
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { runObservedBackgroundJob } from "@/server/services/background-job-observability-service";

describe("runObservedBackgroundJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.backgroundJobRun.create.mockResolvedValue({ id: "run-1" });
    prismaMock.backgroundJobRun.update.mockResolvedValue({});
  });

  it("records a completed worker run and returns the worker result", async () => {
    const times = [
      new Date("2026-08-28T08:00:00.000Z"),
      new Date("2026-08-28T08:00:02.500Z"),
    ];

    const result = await runObservedBackgroundJob({
      jobKey: "ai-search-jobs",
      now: () => times.shift() ?? new Date("2026-08-28T08:00:02.500Z"),
      execute: async () => ({ claimed: 3, completed: 2, failed: 1, skipped: false }),
      summarize: (value) => ({
        claimedCount: value.claimed,
        succeededCount: value.completed,
        failedCount: value.failed,
        skipped: value.skipped,
      }),
    });

    expect(result).toEqual({ claimed: 3, completed: 2, failed: 1, skipped: false });
    expect(prismaMock.backgroundJobRun.create).toHaveBeenCalledWith({
      data: {
        jobKey: "ai-search-jobs",
        status: "RUNNING",
        startedAt: new Date("2026-08-28T08:00:00.000Z"),
      },
      select: { id: true },
    });
    expect(prismaMock.backgroundJobRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: "PARTIAL",
        claimedCount: 3,
        succeededCount: 2,
        failedCount: 1,
        durationMs: 2500,
      }),
    });
  });

  it("does not turn a completed worker into a retry when only metric finalization fails", async () => {
    prismaMock.backgroundJobRun.update.mockRejectedValue(new Error("metrics write failed"));

    await expect(runObservedBackgroundJob({
      jobKey: "ai-search-jobs",
      execute: async () => ({ completed: 1 }),
      summarize: (value) => ({
        claimedCount: value.completed,
        succeededCount: value.completed,
        failedCount: 0,
      }),
    })).resolves.toEqual({ completed: 1 });
  });
});
