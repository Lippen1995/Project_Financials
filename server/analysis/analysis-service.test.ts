import { describe, expect, it, vi } from "vitest";

import { createAnalysisService, type AnalysisRepository } from "./analysis-service";

function repository(): AnalysisRepository {
  return {
    requireWorkspaceAccess: vi.fn().mockResolvedValue(undefined),
    createAnalysis: vi.fn().mockImplementation(async (input) => ({ id: "analysis-1", ...input })),
    getAnalysisAccess: vi.fn().mockResolvedValue({
      id: "analysis-1",
      workspaceId: "workspace-1",
      version: 2,
      universeQuery: {
        version: "company-universe-v1",
        workflow: "MNA_SCREENING",
        statuses: ["ACTIVE"],
        missingDataPolicy: "INCLUDE_WITH_GAP",
        fiscalYear: 2022,
        limit: 100,
      },
    }),
    updateAnalysis: vi.fn().mockResolvedValue(true),
    loadOfficialCompanies: vi.fn().mockImplementation(async (orgNumbers: string[]) =>
      orgNumbers.map((orgNumber) => ({
        orgNumber,
        companyName: `Company ${orgNumber}`,
        sourceBasis: [{ ...source, sourceId: orgNumber }],
      }))
    ),
    hasRecordedNjordAnswer: vi.fn().mockResolvedValue(true),
    createWorklist: vi.fn().mockImplementation(async (input) => ({ id: "worklist-1", ...input })),
    saveFeedback: vi.fn().mockImplementation(async (input) => ({ id: "feedback-1", ...input })),
  };
}

const source = {
  sourceSystem: "BRREG",
  sourceEntityType: "company",
  sourceId: "100000001",
  fetchedAt: "2026-07-27T00:00:00.000Z",
  normalizedAt: "2026-07-27T00:00:00.000Z",
};

const universeQuery = {
  version: "company-universe-v1" as const,
  workflow: "MNA_SCREENING" as const,
  statuses: ["ACTIVE"] as ["ACTIVE"],
  missingDataPolicy: "INCLUDE_WITH_GAP" as const,
  limit: 100,
};

describe("analysis service", () => {
  it("creates an analysis only after checking workspace access", async () => {
    const repo = repository();
    const service = createAnalysisService(repo);

    const result = await service.create("user-1", {
      workspaceId: "workspace-1",
      title: "Oppkjøpsscreening",
      purpose: "Bygg en dokumentert longlist.",
      workflow: "MNA_SCREENING",
      criteria: { activeOnly: true },
      universeQuery,
    });

    expect(repo.requireWorkspaceAccess).toHaveBeenCalledWith("user-1", "workspace-1");
    expect(repo.createAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      createdByUserId: "user-1",
      criteriaVersion: "analysis-criteria-v1",
      universeQueryVersion: "company-universe-v1",
    }));
    expect(result.id).toBe("analysis-1");
  });

  it("uses optimistic versioning when saving a conclusion", async () => {
    const repo = repository();
    const service = createAnalysisService(repo);

    await service.updateConclusion("user-1", "analysis-1", {
      expectedVersion: 2,
      status: "COMPLETED",
      conclusion: { summary: "Dokumentert konklusjon." },
      followUp: { nextStep: "Valider shortlist." },
      sourceOrgNumbers: ["100000001"],
    });

    expect(repo.requireWorkspaceAccess).toHaveBeenCalledWith("user-1", "workspace-1");
    expect(repo.loadOfficialCompanies).toHaveBeenCalledWith(["100000001"], 2022);
    expect(repo.updateAnalysis).toHaveBeenCalledWith(
      "analysis-1",
      2,
      expect.objectContaining({
        version: 3,
        status: "COMPLETED",
        sourceBasis: [{ ...source, sourceId: "100000001" }],
      }),
    );
  });

  it("rejects duplicate companies in a batch worklist", async () => {
    const service = createAnalysisService(repository());
    const item = {
      orgNumber: "100000001",
      inclusionBasis: ["MATCHED"],
      dataGaps: [],
    };

    await expect(service.createWorklist("user-1", "analysis-1", {
      type: "LONGLIST",
      name: "Longlist",
      purpose: "Review",
      criteriaVersion: "analysis-criteria-v1",
      items: [item, item],
    })).rejects.toThrow(/duplicate/i);
  });

  it("stores one useful/incorrect feedback decision per user and answer key", async () => {
    const repo = repository();
    const service = createAnalysisService(repo);

    await service.saveNjordFeedback("user-1", {
      analysisId: "analysis-1",
      answerKey: "answer-123",
      label: "INCORRECT",
      notes: "Kilden støtter ikke konklusjonen.",
    });

    expect(repo.saveFeedback).toHaveBeenCalledWith({
      userId: "user-1",
      analysisId: "analysis-1",
      answerKey: "answer-123",
      label: "INCORRECT",
      notes: "Kilden støtter ikke konklusjonen.",
    });
    expect(repo.hasRecordedNjordAnswer).toHaveBeenCalledWith("user-1", "answer-123");
  });
});
