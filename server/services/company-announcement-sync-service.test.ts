import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, leaseMock, syncSourceMock } = vi.hoisted(() => ({
  prismaMock: {
    companyAnnouncementFetchState: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
  leaseMock: {
    acquirePipelineJobLease: vi.fn(),
    releasePipelineJobLease: vi.fn(),
  },
  syncSourceMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/server/persistence/pipeline-job-lease-repository", () => leaseMock);
vi.mock("@/server/news/company-event-ingestion-service", () => ({ syncSource: syncSourceMock }));

import { drainCompanyAnnouncementQueue } from "@/server/services/company-announcement-sync-service";

describe("company announcement background queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaseMock.acquirePipelineJobLease.mockResolvedValue({
      acquired: true,
      lease: { leaseOwner: "test" },
    });
    leaseMock.releasePipelineJobLease.mockResolvedValue(undefined);
  });

  it("syncs due companies outside the request path and marks successful coverage available", async () => {
    prismaMock.companyAnnouncementFetchState.findMany.mockResolvedValue([
      {
        companyId: "company-1",
        failureCount: 0,
        company: { orgNumber: "912345678", name: "Fjord AS" },
      },
    ]);
    syncSourceMock.mockResolvedValue({
      sourcesProcessed: 1,
      documentsFetched: 2,
      errors: [],
    });
    prismaMock.companyAnnouncementFetchState.update.mockResolvedValue({});

    const now = new Date("2026-08-15T10:00:00Z");
    const result = await drainCompanyAnnouncementQueue({ limit: 10, now: () => now });

    expect(syncSourceMock).toHaveBeenCalledWith("brreg-announcements", {
      companyScopes: [{ companyId: "company-1", orgNumber: "912345678", name: "Fjord AS" }],
    });
    expect(prismaMock.companyAnnouncementFetchState.update).toHaveBeenCalledWith({
      where: { companyId: "company-1" },
      data: expect.objectContaining({
        status: "AVAILABLE",
        announcementCount: 2,
        failureCount: 0,
        sourceEntityType: "announcementList",
        sourceId: "912345678",
        nextCheckAt: new Date("2026-08-15T11:00:00Z"),
      }),
    });
    expect(result).toMatchObject({ skipped: false, claimed: 1, succeeded: 1, failed: 0 });
    expect(leaseMock.releasePipelineJobLease).toHaveBeenCalled();
  });

  it("records a bounded retry when the external background sync fails", async () => {
    prismaMock.companyAnnouncementFetchState.findMany.mockResolvedValue([
      {
        companyId: "company-1",
        failureCount: 1,
        company: { orgNumber: "912345678", name: "Fjord AS" },
      },
    ]);
    syncSourceMock.mockResolvedValue({
      sourcesProcessed: 1,
      documentsFetched: 0,
      errors: ["Brreg unavailable"],
    });
    prismaMock.companyAnnouncementFetchState.update.mockResolvedValue({});

    const now = new Date("2026-08-15T10:00:00Z");
    const result = await drainCompanyAnnouncementQueue({ now: () => now });

    expect(prismaMock.companyAnnouncementFetchState.update).toHaveBeenCalledWith({
      where: { companyId: "company-1" },
      data: expect.objectContaining({
        status: "ERROR",
        failureCount: 2,
        lastErrorCode: "BRREG_ANNOUNCEMENTS_SYNC_FAILED",
        nextCheckAt: new Date("2026-08-15T10:04:00Z"),
      }),
    });
    expect(result).toMatchObject({ succeeded: 0, failed: 1 });
  });
});
