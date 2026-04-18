import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = {
  acquirePipelineJobLease: vi.fn(),
  heartbeatPipelineJobLease: vi.fn(),
  releasePipelineJobLease: vi.fn(),
};

const financialService = {
  syncNewAnnualReportFilings: vi.fn(),
  reprocessAnnualReportFilingsByCriteria: vi.fn(),
  getAnnualReportPipelineOverview: vi.fn(),
};

vi.mock("@/server/persistence/annual-report-ingestion-repository", () => ({
  acquirePipelineJobLease: repo.acquirePipelineJobLease,
  heartbeatPipelineJobLease: repo.heartbeatPipelineJobLease,
  releasePipelineJobLease: repo.releasePipelineJobLease,
}));

vi.mock("@/server/services/annual-report-financials-service", () => ({
  syncNewAnnualReportFilings: financialService.syncNewAnnualReportFilings,
  reprocessAnnualReportFilingsByCriteria:
    financialService.reprocessAnnualReportFilingsByCriteria,
  getAnnualReportPipelineOverview: financialService.getAnnualReportPipelineOverview,
}));

describe("annual-report-financials-scheduler-service", () => {
  beforeEach(() => {
    Object.values(repo).forEach((mocked) => mocked.mockReset());
    Object.values(financialService).forEach((mocked) => mocked.mockReset());

    repo.releasePipelineJobLease.mockResolvedValue({ count: 1 });
    repo.heartbeatPipelineJobLease.mockResolvedValue({ count: 1 });
    financialService.syncNewAnnualReportFilings.mockResolvedValue({
      checkedCompanies: 2,
      discovered: [{ discoveredFilings: 3 }, { discoveredFilings: 1 }],
      versionChecks: [{ filingId: "f-1" }],
      processed: [
        { filingId: "f-1", published: true },
        { filingId: "f-2", published: false },
        { filingId: "f-3", error: "boom" },
      ],
    });
    financialService.reprocessAnnualReportFilingsByCriteria.mockResolvedValue({
      matchedFilings: [],
      results: [],
    });
    financialService.getAnnualReportPipelineOverview.mockResolvedValue({
      metrics: {
        reviews: [
          { status: "PENDING_REVIEW", _count: { _all: 2 } },
          { status: "RESOLVED_BY_NEW_RUN", _count: { _all: 1 } },
        ],
        incompleteCoverageCount: 4,
      },
    });
  });

  it("skips scheduled execution when another run holds the lease", async () => {
    repo.acquirePipelineJobLease.mockResolvedValue({
      acquired: false,
      lease: {
        jobKey: "annual-report-financial-sync",
        leaseOwner: "other-worker",
        leaseExpiresAt: new Date("2026-04-18T12:00:00.000Z"),
      },
    });

    const { runScheduledAnnualReportFinancialSync } = await import(
      "@/server/services/annual-report-financials-scheduler-service"
    );
    const result = await runScheduledAnnualReportFinancialSync();

    expect(result.skipped).toBe(true);
    expect(financialService.syncNewAnnualReportFilings).not.toHaveBeenCalled();
    expect(repo.releasePipelineJobLease).not.toHaveBeenCalled();
  });

  it("runs incremental sync under a lease and returns structured counts", async () => {
    repo.acquirePipelineJobLease.mockResolvedValue({
      acquired: true,
      lease: {
        jobKey: "annual-report-financial-sync",
        leaseOwner: "worker-1",
        leaseExpiresAt: new Date("2026-04-18T12:15:00.000Z"),
      },
    });

    const { runScheduledAnnualReportFinancialSync } = await import(
      "@/server/services/annual-report-financials-scheduler-service"
    );
    const result = await runScheduledAnnualReportFinancialSync({
      lowConfidenceRetryLimit: 0,
    });

    expect(result.skipped).toBe(false);
    if (result.skipped || !result.summary) {
      throw new Error("Expected scheduled run to execute and return a summary");
    }
    expect(result.summary.discoveredCount).toBe(4);
    expect(result.summary.processedCount).toBe(3);
    expect(result.summary.publishedCount).toBe(1);
    expect(result.summary.manualReviewCount).toBe(1);
    expect(result.summary.failedCount).toBe(1);
    expect(result.summary.reviewQueueCount).toBe(2);
    expect(repo.heartbeatPipelineJobLease).toHaveBeenCalledTimes(1);
    expect(repo.releasePipelineJobLease).toHaveBeenCalledTimes(1);
  });
});
