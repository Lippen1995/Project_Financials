import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = {
  workspaceSyncSecret: "test-workspace-secret",
};

const pipeline = {
  getAnnualReportPipelineOverview: vi.fn(),
};

vi.mock("@/lib/env", () => ({
  default: env,
}));

vi.mock("@/server/services/annual-report-financials-service", () => ({
  getAnnualReportPipelineOverview: pipeline.getAnnualReportPipelineOverview,
}));

describe("GET /api/internal/annual-report-financials/overview", () => {
  beforeEach(() => {
    pipeline.getAnnualReportPipelineOverview.mockReset();
    pipeline.getAnnualReportPipelineOverview.mockResolvedValue({});
  });

  it("rejects an organization number with an invalid MOD11 control digit", async () => {
    const { GET } = await import("@/app/api/internal/annual-report-financials/overview/route");
    const request = new NextRequest(
      "http://localhost/api/internal/annual-report-financials/overview?org=928846467",
      {
        headers: {
          authorization: `Bearer ${env.workspaceSyncSecret}`,
        },
      },
    );

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(pipeline.getAnnualReportPipelineOverview).not.toHaveBeenCalled();
  });

  it("normalizes valid organization numbers before calling the service", async () => {
    const { GET } = await import("@/app/api/internal/annual-report-financials/overview/route");
    const request = new NextRequest(
      "http://localhost/api/internal/annual-report-financials/overview?org=928%20846%20466&limit=25",
      {
        headers: {
          authorization: `Bearer ${env.workspaceSyncSecret}`,
        },
      },
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(pipeline.getAnnualReportPipelineOverview).toHaveBeenCalledWith({
      orgNumbers: ["928846466"],
      sampleLimit: 25,
    });
  });
});
