import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  drain: vi.fn(),
  env: { cronSecret: "cron-secret" },
}));
vi.mock("@/lib/env", () => ({ default: mocks.env }));
vi.mock("@/server/services/ai-search-job-service", () => ({ drainAiSearchJobs: mocks.drain }));

import { POST } from "@/app/api/internal/ai-search-jobs/scheduled/route";

describe("POST /api/internal/ai-search-jobs/scheduled", () => {
  it("runs the model worker only for the authorized scheduler", async () => {
    mocks.drain.mockResolvedValue({ skipped: false, claimed: 1, completed: 1, failed: 0 });
    const response = await POST(new NextRequest(
      "http://localhost/api/internal/ai-search-jobs/scheduled?limit=5",
      { method: "POST", headers: { authorization: "Bearer cron-secret" } },
    ));

    expect(response.status).toBe(200);
    expect(mocks.drain).toHaveBeenCalledWith({ limit: 5 });
  });
});
