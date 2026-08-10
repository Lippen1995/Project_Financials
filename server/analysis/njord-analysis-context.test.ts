import { describe, expect, it } from "vitest";

import { buildNjordAnalysisContextPrompt } from "./njord-analysis-context";

describe("buildNjordAnalysisContextPrompt", () => {
  it("builds a bounded, explicitly untrusted context from a saved analysis", () => {
    const prompt = buildNjordAnalysisContextPrompt({
      id: "analysis-1",
      workspaceId: "workspace-1",
      workspaceName: "Fjord",
      title: "Oppkjøpsscreening",
      purpose: "Prioriter dokumenterte kandidater.",
      workflow: "MNA_SCREENING",
      status: "IN_PROGRESS",
      criteriaVersion: "analysis-criteria-v1",
      criteria: { industry: "62" },
      universeQueryVersion: "company-universe-v1",
      universeQuery: { statuses: ["ACTIVE"] },
      calculationVersion: null,
      calculationConfig: null,
      sourceBasis: [{
        sourceSystem: "BRREG",
        sourceEntityType: "company",
        sourceId: "100000001",
        fetchedAt: "2026-07-27T10:00:00.000Z",
        normalizedAt: "2026-07-27T10:01:00.000Z",
      }],
      conclusion: null,
      followUp: null,
      version: 2,
      createdAt: "2026-07-27T10:00:00.000Z",
      updatedAt: "2026-07-27T11:00:00.000Z",
      worklists: [{
        id: "worklist-1",
        type: "LONGLIST",
        name: "Longlist",
        purpose: "Første utvalg",
        criteriaVersion: "analysis-criteria-v1",
        universeResultVersion: null,
        financialDatasetMode: null,
        financialDatasetVersion: null,
        screeningVersion: null,
        rankingVersion: null,
        evaluatedCount: null,
        includedCount: null,
        excludedCount: null,
        truncatedCount: null,
        universeExecutedAt: null,
        createdAt: "2026-07-27T10:00:00.000Z",
        updatedAt: "2026-07-27T10:00:00.000Z",
        items: [{
          id: "item-1",
          orgNumber: "100000001",
          companyName: "Registerført selskap",
          sortOrder: 1,
          inclusionBasis: ["MATCHED_INDUSTRY"],
          dataGaps: [],
          sourceBasis: [],
          notes: null,
        }],
      }],
    });

    expect(prompt).toContain("<analysis_context_json");
    expect(prompt).toContain('"analysisId":"analysis-1"');
    expect(prompt).toContain('"orgNumber":"100000001"');
    expect(prompt).toContain('"sourceSystem":"BRREG"');
    expect(prompt).toContain("UNTRUSTED DATA");
    expect(prompt.length).toBeLessThan(30_000);
  });
});
