import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = {
  financialsSyncSecret: "test-financials-secret",
};

const scheduler = {
  runScheduledAnnualReportFinancialSync: vi.fn(),
};

vi.mock("@/lib/env", () => ({
  default: env,
}));

vi.mock("@/server/services/annual-report-financials-scheduler-service", () => ({
  runScheduledAnnualReportFinancialSync: scheduler.runScheduledAnnualReportFinancialSync,
}));

describe("GET /api/internal/annual-report-financials/scheduled", () => {
  beforeEach(() => {
    scheduler.runScheduledAnnualReportFinancialSync.mockReset();
  });

  it("rejects unauthenticated scheduled sync requests", async () => {
    const { GET } = await import("@/app/api/internal/annual-report-financials/scheduled/route");
    const response = await GET(
      new NextRequest("http://localhost/api/internal/annual-report-financials/scheduled"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(scheduler.runScheduledAnnualReportFinancialSync).not.toHaveBeenCalled();
  });

  it("accepts bearer-authenticated requests and forwards retry options", async () => {
    scheduler.runScheduledAnnualReportFinancialSync.mockResolvedValue({
      ok: true,
      skipped: false,
      summary: {
        discoveredCount: 3,
        processedCount: 2,
        publishedCount: 1,
        manualReviewCount: 1,
        failedCount: 0,
      },
    });

    const { GET } = await import("@/app/api/internal/annual-report-financials/scheduled/route");
    const request = new NextRequest(
      "http://localhost/api/internal/annual-report-financials/scheduled?lowConfidenceRetryLimit=4",
      {
        headers: {
          authorization: `Bearer ${env.financialsSyncSecret}`,
        },
      },
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(scheduler.runScheduledAnnualReportFinancialSync).toHaveBeenCalledWith({
      lowConfidenceRetryLimit: 4,
    });
    await expect(response.json()).resolves.toEqual({
      job: "scheduled-annual-report-sync",
      data: {
        ok: true,
        skipped: false,
        summary: {
          discoveredCount: 3,
          processedCount: 2,
          publishedCount: 1,
          manualReviewCount: 1,
          failedCount: 0,
        },
      },
    });
  });
});
