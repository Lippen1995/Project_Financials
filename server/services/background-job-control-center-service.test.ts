import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  backgroundJobRun: { findMany: vi.fn() },
  pipelineJobLease: { findMany: vi.fn() },
  structuredFinancialFetchState: {
    groupBy: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
  },
  companyAnnouncementFetchState: {
    groupBy: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
  },
  aiSearchJob: {
    groupBy: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
  },
  ssbClassificationSyncState: {
    groupBy: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { buildBackgroundJobControlCenter } from "@/server/services/background-job-control-center-service";

describe("buildBackgroundJobControlCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.pipelineJobLease.findMany.mockResolvedValue([]);
    prismaMock.backgroundJobRun.findMany
      .mockResolvedValueOnce([
        {
          jobKey: "structured-financials-queue",
          status: "COMPLETED",
          startedAt: new Date("2026-08-28T07:59:00.000Z"),
          completedAt: new Date("2026-08-28T07:59:04.000Z"),
          claimedCount: 2,
          succeededCount: 2,
          failedCount: 0,
          errorMessage: null,
        },
        {
          jobKey: "ai-search-jobs",
          status: "FAILED",
          startedAt: new Date("2026-08-28T07:58:00.000Z"),
          completedAt: new Date("2026-08-28T07:58:01.000Z"),
          claimedCount: 1,
          succeededCount: 0,
          failedCount: 1,
          errorMessage: "Provider utilgjengelig",
        },
        {
          jobKey: "ssb-classifications",
          status: "RUNNING",
          startedAt: new Date("2026-08-28T07:30:00.000Z"),
          completedAt: null,
          claimedCount: 0,
          succeededCount: 0,
          failedCount: 0,
          errorMessage: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          jobKey: "structured-financials-queue",
          status: "COMPLETED",
          startedAt: new Date("2026-08-28T07:59:00.000Z"),
          completedAt: new Date("2026-08-28T07:59:04.000Z"),
          claimedCount: 2,
          succeededCount: 2,
          failedCount: 0,
          errorMessage: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          jobKey: "ai-search-jobs",
          status: "FAILED",
          startedAt: new Date("2026-08-28T07:58:00.000Z"),
          completedAt: new Date("2026-08-28T07:58:01.000Z"),
          claimedCount: 1,
          succeededCount: 0,
          failedCount: 1,
          errorMessage: "Provider utilgjengelig",
        },
      ]);

    prismaMock.structuredFinancialFetchState.groupBy.mockResolvedValue([
      { status: "PENDING", _count: { id: 1 } },
    ]);
    prismaMock.structuredFinancialFetchState.count.mockResolvedValue(1);
    prismaMock.structuredFinancialFetchState.findFirst.mockResolvedValue({
      createdAt: new Date("2026-08-28T07:57:00.000Z"),
    });

    prismaMock.companyAnnouncementFetchState.groupBy.mockResolvedValue([]);
    prismaMock.companyAnnouncementFetchState.count.mockResolvedValue(0);
    prismaMock.companyAnnouncementFetchState.findFirst.mockResolvedValue(null);

    prismaMock.aiSearchJob.groupBy.mockResolvedValue([
      { status: "PENDING", _count: { id: 2 } },
      { status: "FAILED", _count: { id: 1 } },
    ]);
    prismaMock.aiSearchJob.count.mockResolvedValue(2);
    prismaMock.aiSearchJob.findFirst.mockResolvedValue({
      createdAt: new Date("2026-08-28T07:50:00.000Z"),
    });

    prismaMock.ssbClassificationSyncState.groupBy.mockResolvedValue([
      { status: "AVAILABLE", _count: { id: 3 } },
    ]);
    prismaMock.ssbClassificationSyncState.count.mockResolvedValue(0);
    prismaMock.ssbClassificationSyncState.findFirst.mockResolvedValue(null);
  });

  it("summarizes queue saturation, failures and latest runs for the admin interface", async () => {
    const result = await buildBackgroundJobControlCenter({
      now: new Date("2026-08-28T08:00:00.000Z"),
    });

    expect(result).toHaveLength(4);
    expect(result.find((job) => job.jobKey === "structured-financials-queue"))
      .toEqual(expect.objectContaining({
        title: "Strukturerte regnskap",
        queueDepth: 1,
        dueCount: 1,
        errorCount: 0,
        health: "healthy",
        latestRun: expect.objectContaining({ status: "COMPLETED", succeededCount: 2 }),
      }));
    expect(result.find((job) => job.jobKey === "ai-search-jobs"))
      .toEqual(expect.objectContaining({
        title: "Premium AI-søk",
        queueDepth: 2,
        dueCount: 2,
        errorCount: 1,
        health: "error",
        oldestQueuedAt: "2026-08-28T07:50:00.000Z",
        latestFailure: expect.objectContaining({ errorMessage: "Provider utilgjengelig" }),
      }));
    expect(result.find((job) => job.jobKey === "ssb-classifications"))
      .toEqual(expect.objectContaining({
        health: "warning",
        statusLabel: "Kjøring uten aktiv lease",
      }));
  });

  it("counts an active lease as a running worker without hiding existing errors", async () => {
    prismaMock.pipelineJobLease.findMany.mockResolvedValue([
      { jobKey: "ai-search-jobs" },
      { jobKey: "ssb-classifications" },
    ]);

    const result = await buildBackgroundJobControlCenter({
      now: new Date("2026-08-28T08:00:00.000Z"),
    });

    expect(result.find((job) => job.jobKey === "ai-search-jobs"))
      .toEqual(expect.objectContaining({
        runningCount: 1,
        errorCount: 1,
        health: "error",
        statusLabel: "Feil krever tiltak",
        latestRun: expect.objectContaining({ failedCount: 1 }),
      }));
    expect(result.find((job) => job.jobKey === "ssb-classifications"))
      .toEqual(expect.objectContaining({
        runningCount: 1,
        health: "active",
        statusLabel: "Kjører nå",
      }));
  });
});
