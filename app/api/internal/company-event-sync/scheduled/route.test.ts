import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = {
  cronSecret: "test-cron-secret",
  newsSyncSecret: "test-news-secret",
};

const intelligence = {
  syncCompanyEventIntelligence: vi.fn(),
};

vi.mock("@/lib/env", () => ({
  default: env,
}));

vi.mock("@/server/news/company-event-intelligence-sync", () => ({
  syncCompanyEventIntelligence: intelligence.syncCompanyEventIntelligence,
}));

describe("GET /api/internal/company-event-sync/scheduled", () => {
  beforeEach(() => {
    intelligence.syncCompanyEventIntelligence.mockReset();
  });

  it("rejects unauthenticated scheduled sync requests", async () => {
    const { GET } = await import("@/app/api/internal/company-event-sync/scheduled/route");
    const response = await GET(
      new NextRequest("http://localhost/api/internal/company-event-sync/scheduled"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(intelligence.syncCompanyEventIntelligence).not.toHaveBeenCalled();
  });

  it("runs a bounded Oslo Bors sync for authenticated requests", async () => {
    const result = {
      ingestion: {
        sourcesProcessed: 1,
        sourcesFailed: 0,
        documentsFetched: 320,
        documentsCreated: 2,
        documentsUpdated: 0,
        documentsDuplicate: 0,
        errors: [],
      },
      entityResolution: { documentsProcessed: 40, signalsCreated: 2 },
      extraction: { documentsProcessed: 40, eventsUpserted: 2, evidenceAttached: 2 },
      reconciliation: { evidenceRemoved: 0, eventsDeactivated: 0 },
      readAcross: {
        eventsProcessed: 2,
        companiesEvaluated: 20,
        exposuresCreated: 0,
        exposuresRemoved: 0,
      },
    };
    intelligence.syncCompanyEventIntelligence.mockResolvedValue(result);

    const { GET } = await import("@/app/api/internal/company-event-sync/scheduled/route");
    const response = await GET(
      new NextRequest("http://localhost/api/internal/company-event-sync/scheduled", {
        headers: {
          authorization: `Bearer ${env.newsSyncSecret}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(intelligence.syncCompanyEventIntelligence).toHaveBeenCalledWith({
      sourceIds: ["oslobors"],
      limit: 40,
    });
    await expect(response.json()).resolves.toEqual({
      job: "scheduled-company-event-sync",
      data: result,
    });
  });

  it("accepts the bearer secret sent by Vercel Cron", async () => {
    intelligence.syncCompanyEventIntelligence.mockResolvedValue({
      ingestion: {},
    });

    const { GET } = await import("@/app/api/internal/company-event-sync/scheduled/route");
    const response = await GET(
      new NextRequest("http://localhost/api/internal/company-event-sync/scheduled", {
        headers: {
          authorization: `Bearer ${env.cronSecret}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(intelligence.syncCompanyEventIntelligence).toHaveBeenCalledWith({
      sourceIds: ["oslobors"],
      limit: 40,
    });
  });
});
