import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sync: vi.fn(),
  acquire: vi.fn(),
  release: vi.fn(),
  observe: vi.fn(async (input: { execute: () => Promise<unknown> }) => input.execute()),
  env: { cronSecret: "cron-secret" },
}));

vi.mock("@/lib/env", () => ({ default: mocks.env }));
vi.mock("@/server/services/ssb-classification-sync-service", () => ({
  syncSsbClassifications: mocks.sync,
}));
vi.mock("@/server/persistence/pipeline-job-lease-repository", () => ({
  acquirePipelineJobLease: mocks.acquire,
  releasePipelineJobLease: mocks.release,
}));
vi.mock("@/server/services/background-job-observability-service", () => ({
  runObservedBackgroundJob: mocks.observe,
}));

import { POST } from "@/app/api/internal/ssb-classifications/scheduled/route";

describe("POST /api/internal/ssb-classifications/scheduled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.acquire.mockResolvedValue({ acquired: true, lease: { leaseOwner: "test" } });
    mocks.release.mockResolvedValue(undefined);
    mocks.sync.mockResolvedValue({
      classifications: 3,
      codes: 1_200,
      datasetVersions: [
        "ssb-klass:6:2026-08-15",
        "ssb-klass:104:2026-08-15",
        "ssb-klass:131:2026-08-15",
      ],
    });
  });

  it("runs the official classification sync only for an authorized scheduler", async () => {
    const response = await POST(new NextRequest(
      "http://localhost/api/internal/ssb-classifications/scheduled",
      { method: "POST", headers: { authorization: "Bearer cron-secret" } },
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      job: "ssb-classifications",
      data: expect.objectContaining({ classifications: 3, codes: 1_200 }),
    });
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    expect(mocks.acquire).toHaveBeenCalledWith(expect.objectContaining({
      jobKey: "ssb-classifications",
    }));
    expect(mocks.release).toHaveBeenCalledWith(expect.objectContaining({
      jobKey: "ssb-classifications",
    }));
    expect(mocks.observe).toHaveBeenCalledWith(expect.objectContaining({
      jobKey: "ssb-classifications",
    }));
  });

  it("skips an overlapping sync while another worker owns the lease", async () => {
    mocks.acquire.mockResolvedValue({ acquired: false, lease: { leaseOwner: "other-worker" } });

    const response = await POST(new NextRequest(
      "http://localhost/api/internal/ssb-classifications/scheduled",
      { method: "POST", headers: { authorization: "Bearer cron-secret" } },
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      job: "ssb-classifications",
      data: expect.objectContaining({ skipped: true }),
    });
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("rejects requests when no scheduler secret matches", async () => {
    const response = await POST(new NextRequest(
      "http://localhost/api/internal/ssb-classifications/scheduled",
      { method: "POST" },
    ));

    expect(response.status).toBe(401);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
});
