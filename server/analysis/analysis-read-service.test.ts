import { describe, expect, it, vi } from "vitest";

import {
  createAnalysisReadService,
  type AnalysisReadRepository,
} from "./analysis-read-service";

function repository(): AnalysisReadRepository {
  return {
    listAccessible: vi.fn().mockResolvedValue([{
      id: "analysis-1",
      workspaceId: "workspace-1",
      workspaceName: "Personlig",
      title: "Oppkjøpsscreening",
      purpose: "Finn relevante kandidater.",
      workflow: "MNA_SCREENING",
      status: "IN_PROGRESS",
      criteriaVersion: "analysis-criteria-v1",
      universeQueryVersion: "company-universe-v1",
      calculationVersion: "company-ranking-v1",
      version: 2,
      worklistCount: 1,
      createdAt: new Date("2026-07-27T10:00:00.000Z"),
      updatedAt: new Date("2026-07-27T11:00:00.000Z"),
    }]),
    loadAccessibleDetail: vi.fn().mockResolvedValue({
      id: "analysis-1",
      workspaceId: "workspace-1",
      workspaceName: "Personlig",
      title: "Oppkjøpsscreening",
      purpose: "Finn relevante kandidater.",
      workflow: "MNA_SCREENING",
      status: "IN_PROGRESS",
      criteriaVersion: "analysis-criteria-v1",
      criteria: { activeOnly: true },
      universeQueryVersion: "company-universe-v1",
      universeQuery: { version: "company-universe-v1", fiscalYear: 2024 },
      calculationVersion: "company-ranking-v1",
      calculationConfig: { metric: "REVENUE" },
      sourceBasis: [],
      conclusion: null,
      followUp: null,
      version: 2,
      createdAt: new Date("2026-07-27T10:00:00.000Z"),
      updatedAt: new Date("2026-07-27T11:00:00.000Z"),
      worklists: [{
        id: "worklist-1",
        type: "LONGLIST",
        name: "Longlist",
        purpose: "Første screening.",
        criteriaVersion: "analysis-criteria-v1",
        universeResultVersion: "company-universe-result-v1",
        financialDatasetMode: "reported",
        financialDatasetVersion: "reported:21",
        screeningVersion: "company-screening-v1",
        rankingVersion: "company-ranking-v1",
        evaluatedCount: 3,
        includedCount: 1,
        excludedCount: 2,
        truncatedCount: 0,
        universeExecutedAt: new Date("2026-07-27T10:29:00.000Z"),
        createdAt: new Date("2026-07-27T10:30:00.000Z"),
        updatedAt: new Date("2026-07-27T10:30:00.000Z"),
        items: [{
          id: "item-1",
          orgNumber: "100000001",
          companyName: "Company 100000001",
          sortOrder: 1,
          inclusionBasis: ["MATCHED"],
          dataGaps: [],
          sourceBasis: [],
          notes: null,
        }],
      }],
    }),
  };
}

describe("analysis read service", () => {
  it("lists only analyses the repository exposes for the signed-in user", async () => {
    const repo = repository();
    const service = createAnalysisReadService(repo);

    const result = await service.list("user-1");

    expect(repo.listAccessible).toHaveBeenCalledWith("user-1", false);
    expect(result).toEqual([expect.objectContaining({
      id: "analysis-1",
      workflow: "MNA_SCREENING",
      worklistCount: 1,
      updatedAt: "2026-07-27T11:00:00.000Z",
    })]);
  });

  it("loads one resumable analysis with ordered worklists through the same access seam", async () => {
    const repo = repository();
    const service = createAnalysisReadService(repo);

    const result = await service.get("user-1", "analysis-1");

    expect(repo.loadAccessibleDetail).toHaveBeenCalledWith("user-1", "analysis-1");
    expect(result).toEqual(expect.objectContaining({
      id: "analysis-1",
      updatedAt: "2026-07-27T11:00:00.000Z",
      worklists: [
        expect.objectContaining({
          id: "worklist-1",
          createdAt: "2026-07-27T10:30:00.000Z",
          universeExecutedAt: "2026-07-27T10:29:00.000Z",
          financialDatasetMode: "reported",
          financialDatasetVersion: "reported:21",
          screeningVersion: "company-screening-v1",
          excludedCount: 2,
          items: [expect.objectContaining({ orgNumber: "100000001", sortOrder: 1 })],
        }),
      ],
    }));
  });
});
