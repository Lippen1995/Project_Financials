import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  drain: vi.fn(),
  observe: vi.fn(async (input: { execute: () => Promise<unknown> }) => input.execute()),
  env: { cronSecret: "cron-secret", newsSyncSecret: "news-secret" },
}));

vi.mock("@/lib/env", () => ({ default: mocks.env }));
vi.mock("@/server/services/company-announcement-sync-service", () => ({
  drainCompanyAnnouncementQueue: mocks.drain,
}));
vi.mock("@/server/services/background-job-observability-service", () => ({
  runObservedBackgroundJob: mocks.observe,
}));

import { POST } from "@/app/api/internal/company-announcements/scheduled/route";

describe("POST /api/internal/company-announcements/scheduled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.drain.mockResolvedValue({ skipped: false, claimed: 1, succeeded: 1, failed: 0 });
  });

  it("drains a bounded queue for the authorized scheduler", async () => {
    const response = await POST(new NextRequest(
      "http://localhost/api/internal/company-announcements/scheduled?limit=20",
      { method: "POST", headers: { authorization: "Bearer cron-secret" } },
    ));

    expect(response.status).toBe(200);
    expect(mocks.drain).toHaveBeenCalledWith({ limit: 20 });
    expect(mocks.observe).toHaveBeenCalledWith(expect.objectContaining({
      jobKey: "company-announcement-queue",
    }));
  });

  it("rejects an unauthorized request", async () => {
    const response = await POST(new NextRequest(
      "http://localhost/api/internal/company-announcements/scheduled",
      { method: "POST" },
    ));

    expect(response.status).toBe(401);
    expect(mocks.drain).not.toHaveBeenCalled();
  });
});
