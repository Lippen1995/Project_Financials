import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  drain: vi.fn(),
  depth: vi.fn(),
  observe: vi.fn(async (input: { execute: () => Promise<unknown> }) => input.execute()),
  env: {
    cronSecret: "cron-secret",
    financialsSyncSecret: "financials-secret",
  },
}));

vi.mock("@/lib/env", () => ({ default: mocks.env }));
vi.mock("@/server/services/structured-financials-queue-service", () => ({
  drainStructuredFinancialsQueue: mocks.drain,
  getStructuredFinancialsQueueDepth: mocks.depth,
}));
vi.mock("@/server/services/background-job-observability-service", () => ({
  runObservedBackgroundJob: mocks.observe,
}));

import { POST } from "@/app/api/internal/structured-financials-queue/scheduled/route";

describe("POST /api/internal/structured-financials-queue/scheduled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.cronSecret = "cron-secret";
    mocks.env.financialsSyncSecret = "financials-secret";
    mocks.drain.mockResolvedValue({
      skipped: false,
      claimed: 2,
      succeeded: 2,
      failed: 0,
    });
    mocks.depth.mockResolvedValue({ pending: 1, due: 1 });
  });

  it("accepts the platform cron secret and records the scheduled run", async () => {
    const response = await POST(new NextRequest(
      "http://localhost/api/internal/structured-financials-queue/scheduled?limit=10",
      { method: "POST", headers: { authorization: "Bearer cron-secret" } },
    ));

    expect(response.status).toBe(200);
    expect(mocks.drain).toHaveBeenCalledWith({ limit: 10 });
    expect(mocks.observe).toHaveBeenCalledWith(expect.objectContaining({
      jobKey: "structured-financials-queue",
    }));
  });

  it("rejects an empty financials header when only the cron secret is configured", async () => {
    mocks.env.financialsSyncSecret = "";

    const response = await POST(new NextRequest(
      "http://localhost/api/internal/structured-financials-queue/scheduled?limit=10",
      { method: "POST", headers: { "x-financials-sync-secret": "" } },
    ));

    expect(response.status).toBe(401);
    expect(mocks.drain).not.toHaveBeenCalled();
  });
});
