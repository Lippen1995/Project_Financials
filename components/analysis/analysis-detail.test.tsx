import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { AnalysisDetailView } from "./analysis-detail";

describe("AnalysisDetailView", () => {
  it("renders the saved analytical context and traceable worklist items", () => {
    const html = renderToStaticMarkup(
      <AnalysisDetailView
        analysis={{
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
          universeQuery: {
            version: "company-universe-v1",
            statuses: ["ACTIVE"],
            fiscalYear: 2024,
          },
          calculationVersion: "company-ranking-v1",
          calculationConfig: {
            ranking: [{ metric: "REVENUE", direction: "HIGHER_BETTER", weight: 60 }],
          },
          sourceBasis: [{
            sourceSystem: "BRREG",
            sourceEntityType: "annual-account",
            sourceId: "statement-1",
            fetchedAt: "2026-07-27T09:00:00.000Z",
            normalizedAt: "2026-07-27T09:01:00.000Z",
          }],
          conclusion: null,
          followUp: { nextStep: "Valider shortlist." },
          version: 2,
          createdAt: "2026-07-27T10:00:00.000Z",
          updatedAt: "2026-07-27T11:00:00.000Z",
          worklists: [{
            id: "worklist-1",
            type: "LONGLIST",
            name: "Longlist",
            purpose: "Første screening.",
            criteriaVersion: "analysis-criteria-v1",
            createdAt: "2026-07-27T10:30:00.000Z",
            updatedAt: "2026-07-27T10:30:00.000Z",
            items: [{
              id: "item-1",
              orgNumber: "100000001",
              companyName: "Company 100000001",
              sortOrder: 1,
              inclusionBasis: ["MATCHED"],
              dataGaps: [],
              sourceBasis: [{
                sourceSystem: "BRREG",
                sourceEntityType: "company",
                sourceId: "100000001",
                fetchedAt: "2026-07-27T09:00:00.000Z",
                normalizedAt: "2026-07-27T09:01:00.000Z",
              }, {
                sourceSystem: "BRREG",
                sourceEntityType: "annual-account",
                sourceId: "statement-1",
                fetchedAt: "2026-07-27T09:00:00.000Z",
                normalizedAt: "2026-07-27T09:01:00.000Z",
              }],
              notes: null,
            }],
          }],
        }}
      />,
    );

    expect(html).toContain("Oppkjøpsscreening");
    expect(html).toContain("Longlist");
    expect(html).toContain("100 000 001");
    expect(html).toContain("Ingen datagap");
    expect(html).toContain("2 kilder");
    expect(html).toContain("Konklusjon er ikke lagret ennå");
    expect(html).toContain("Valider shortlist.");
    expect(html).toContain("REVENUE");
    expect(html).toContain("statement-1");
  });
});
