import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, leaseMock, executeMock } = vi.hoisted(() => ({
  prismaMock: {
    aiSearchJob: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  leaseMock: {
    acquirePipelineJobLease: vi.fn(),
    releasePipelineJobLease: vi.fn(),
  },
  executeMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/server/persistence/pipeline-job-lease-repository", () => leaseMock);
vi.mock("@/app/api/ai-search/route", () => ({ POST: executeMock }));

import { drainAiSearchJobs } from "@/server/services/ai-search-job-service";

describe("AI search background jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaseMock.acquirePipelineJobLease.mockResolvedValue({ acquired: true, lease: { leaseOwner: "test" } });
    leaseMock.releasePipelineJobLease.mockResolvedValue(undefined);
    prismaMock.aiSearchJob.updateMany.mockResolvedValue({ count: 0 });
  });

  it("executes a pending premium job in the worker and stores the result", async () => {
    prismaMock.aiSearchJob.findMany.mockResolvedValue([{
      id: "job-1",
      userId: "user-1",
      query: "Finn oppkjøpskandidater",
      analysisId: null,
      attemptCount: 0,
    }]);
    prismaMock.aiSearchJob.update.mockResolvedValue({});
    executeMock.mockResolvedValue({
      status: 200,
      json: vi.fn().mockResolvedValue({ answer: "To kandidater", companies: [] }),
    });

    const result = await drainAiSearchJobs({ limit: 5 });

    expect(executeMock).toHaveBeenCalledWith(expect.anything());
    expect(prismaMock.aiSearchJob.update).toHaveBeenLastCalledWith({
      where: { id: "job-1" },
      data: expect.objectContaining({
        status: "COMPLETED",
        result: { answer: "To kandidater", companies: [] },
        errorMessage: null,
      }),
    });
    expect(result).toEqual(expect.objectContaining({ claimed: 1, completed: 1, failed: 0 }));
  });

  it("requeues a recoverable worker failure with exponential backoff", async () => {
    prismaMock.aiSearchJob.findMany.mockResolvedValue([{
      id: "job-2",
      userId: "user-1",
      query: "Finn vekstselskaper",
      analysisId: null,
      attemptCount: 0,
    }]);
    prismaMock.aiSearchJob.update.mockResolvedValue({});
    executeMock.mockRejectedValue(new Error("temporary model outage"));
    const clock = new Date("2026-08-15T10:00:00.000Z");

    const result = await drainAiSearchJobs({ limit: 5, now: () => clock });

    expect(prismaMock.aiSearchJob.update).toHaveBeenLastCalledWith({
      where: { id: "job-2" },
      data: expect.objectContaining({
        status: "PENDING",
        nextAttemptAt: new Date("2026-08-15T10:00:30.000Z"),
        startedAt: null,
        completedAt: null,
      }),
    });
    expect(result).toEqual(expect.objectContaining({ retried: 1, failed: 0 }));
  });

  it("recovers stale RUNNING jobs before draining due work", async () => {
    prismaMock.aiSearchJob.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 });
    prismaMock.aiSearchJob.findMany.mockResolvedValue([]);
    const clock = new Date("2026-08-15T10:00:00.000Z");

    const result = await drainAiSearchJobs({ now: () => clock });

    expect(prismaMock.aiSearchJob.updateMany).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({
        status: "RUNNING",
        startedAt: { lte: new Date("2026-08-15T09:40:00.000Z") },
        attemptCount: { lt: 3 },
      }),
      data: expect.objectContaining({ status: "PENDING", nextAttemptAt: clock }),
    });
    expect(result).toEqual(expect.objectContaining({ recovered: 2, failed: 1 }));
  });
});
