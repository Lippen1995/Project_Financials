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
      workflow: "MNA_SCREENING",
      criteria: { industries: ["62"] },
      universeQuery: {
        version: "company-universe-v1",
        workflow: "MNA_SCREENING",
        industryCodePrefixes: ["62"],
        statuses: ["ACTIVE"],
        missingDataPolicy: "INCLUDE_WITH_GAP",
        fiscalYear: 2022,
        limit: 100,
      },
      calculationConfig: null,
      worklistCount: 0,
      hasConclusion: false,
    }),
    updateAnalysis: vi.fn().mockResolvedValue(true),
    updateDraft: vi.fn().mockResolvedValue(true),
    loadOfficialCompanies: vi.fn().mockImplementation(async (orgNumbers: string[]) =>
      orgNumbers.map((orgNumber) => ({
        orgNumber,
        companyName: `Company ${orgNumber}`,
        sourceBasis: [{ ...source, sourceId: orgNumber }],
      }))
    ),
    hasRecordedNjordAnswer: vi.fn().mockResolvedValue(true),
    createWorklist: vi.fn().mockImplementation(async (input) => ({ id: "worklist-1", ...input })),
    getWorklist: vi.fn().mockResolvedValue({
      id: "worklist-1",
      analysisId: "analysis-1",
      items: [
        {
          id: "item-1",
          orgNumber: "100000001",
          companyName: "Company 100000001",
          sortOrder: 1,
          inclusionBasis: ["MATCHED"],
          dataGaps: [],
          sourceBasis: [{ ...source, sourceId: "100000001" }],
          notes: null,
        },
        {
          id: "item-2",
          orgNumber: "100000002",
          companyName: "Company 100000002",
          sortOrder: 2,
          inclusionBasis: ["MATCHED"],
          dataGaps: [],
          sourceBasis: [{ ...source, sourceId: "100000002" }],
          notes: null,
        },
      ],
    }),
    reorderWorklist: vi.fn().mockResolvedValue(undefined),
    addWorklistItem: vi.fn().mockResolvedValue({ id: "item-3" }),
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

  it("updates editable analysis context with optimistic versioning", async () => {
    const repo = repository();
    const service = createAnalysisService(repo);

    await service.updateDraft("user-1", "analysis-1", {
      expectedVersion: 2,
      title: "Revidert oppkjøpsscreening",
      purpose: "Bygg og dokumenter en prioritert longlist.",
      workflow: "MNA_SCREENING",
      criteria: { industries: ["62"] },
      universeQuery: {
        ...universeQuery,
        industryCodePrefixes: ["62"],
      },
    });

    expect(repo.requireWorkspaceAccess).toHaveBeenCalledWith("user-1", "workspace-1");
    expect(repo.updateDraft).toHaveBeenCalledWith(
      "analysis-1",
      2,
      expect.objectContaining({
        version: 3,
        title: "Revidert oppkjøpsscreening",
        universeQueryVersion: "company-universe-v1",
        calculationVersion: null,
      }),
    );
  });

  it("keeps analytical context immutable after dependent artifacts are saved", async () => {
    const repo = repository();
    vi.mocked(repo.getAnalysisAccess).mockResolvedValue({
      id: "analysis-1",
      workspaceId: "workspace-1",
      version: 2,
      workflow: "MNA_SCREENING",
      criteria: { industries: ["62"] },
      universeQuery: {
        ...universeQuery,
        industryCodePrefixes: ["62"],
      },
      calculationConfig: null,
      worklistCount: 1,
      hasConclusion: false,
    });
    const service = createAnalysisService(repo);

    await expect(service.updateDraft("user-1", "analysis-1", {
      expectedVersion: 2,
      title: "Ny tittel",
      purpose: "Samme formål.",
      workflow: "MNA_SCREENING",
      criteria: { industries: ["63"] },
      universeQuery: {
        ...universeQuery,
        industryCodePrefixes: ["63"],
      },
    })).rejects.toThrow(/locked/i);
    expect(repo.updateDraft).not.toHaveBeenCalled();
  });

  it("rejects duplicate companies in a batch worklist", async () => {
    const service = createAnalysisService(repository());
    const item = {
      orgNumber: "100000001",
      inclusionBasis: ["MATCHED"],
      dataGaps: [],
    };

    await expect(service.createWorklist("user-1", "analysis-1", {
      expectedAnalysisVersion: 2,
      type: "LONGLIST",
      name: "Longlist",
      purpose: "Review",
      criteriaVersion: "analysis-criteria-v1",
      items: [item, item],
    })).rejects.toThrow(/duplicate/i);
  });

  it("creates a worklist against the exact analysis version", async () => {
    const repo = repository();
    const service = createAnalysisService(repo);

    await service.createWorklist("user-1", "analysis-1", {
      expectedAnalysisVersion: 2,
      type: "LONGLIST",
      name: "Longlist",
      purpose: "Dokumentert første utvalg.",
      criteriaVersion: "analysis-criteria-v1",
      items: [{
        orgNumber: "100000001",
        inclusionBasis: ["MATCHED"],
        dataGaps: [],
      }],
    });

    expect(repo.createWorklist).toHaveBeenCalledWith(expect.objectContaining({
      analysisId: "analysis-1",
      expectedAnalysisVersion: 2,
      items: [expect.objectContaining({
        orgNumber: "100000001",
        companyName: "Company 100000001",
        sortOrder: 1,
      })],
    }));
  });

  it("reorders a worklist only when the complete stored item set is supplied", async () => {
    const repo = repository();
    const service = createAnalysisService(repo);

    await service.reorderWorklist(
      "user-1",
      "analysis-1",
      "worklist-1",
      { itemIds: ["item-2", "item-1"] },
    );

    expect(repo.requireWorkspaceAccess).toHaveBeenCalledWith("user-1", "workspace-1");
    expect(repo.reorderWorklist).toHaveBeenCalledWith(
      "worklist-1",
      ["item-2", "item-1"],
    );

    await expect(service.reorderWorklist(
      "user-1",
      "analysis-1",
      "worklist-1",
      { itemIds: ["item-1"] },
    )).rejects.toThrow(/all stored items/i);
  });

  it("promotes a stored company to another worklist without changing its evidence", async () => {
    const repo = repository();
    vi.mocked(repo.getWorklist)
      .mockResolvedValueOnce({
        id: "worklist-1",
        analysisId: "analysis-1",
        items: [{
          id: "item-1",
          orgNumber: "100000001",
          companyName: "Company 100000001",
          sortOrder: 1,
          inclusionBasis: ["MATCHED"],
          dataGaps: ["MISSING_FINANCIALS"],
          sourceBasis: [{ ...source, sourceId: "100000001" }],
          notes: "Kontroller manuelt.",
        }],
      })
      .mockResolvedValueOnce({
        id: "worklist-2",
        analysisId: "analysis-1",
        items: [{
          id: "item-2",
          orgNumber: "100000002",
          companyName: "Company 100000002",
          sortOrder: 1,
          inclusionBasis: ["MATCHED"],
          dataGaps: [],
          sourceBasis: [{ ...source, sourceId: "100000002" }],
          notes: null,
        }],
      });
    const service = createAnalysisService(repo);

    await service.promoteWorklistItem(
      "user-1",
      "analysis-1",
      "worklist-1",
      { itemId: "item-1", targetWorklistId: "worklist-2" },
    );

    expect(repo.addWorklistItem).toHaveBeenCalledWith({
      worklistId: "worklist-2",
      orgNumber: "100000001",
      companyName: "Company 100000001",
      sortOrder: 2,
      inclusionBasis: ["MATCHED"],
      dataGaps: ["MISSING_FINANCIALS"],
      sourceBasis: [{ ...source, sourceId: "100000001" }],
      notes: "Kontroller manuelt.",
    });
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
