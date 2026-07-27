import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import {
  AnalysisEditor,
  buildAnalysisPayload,
  isAnalysisContextLocked,
} from "./analysis-editor";

describe("AnalysisEditor", () => {
  it("builds a versioned universe from user-provided filters without company data", () => {
    expect(buildAnalysisPayload({
      title: "Nordisk programvarescreening",
      purpose: "Finn norske kandidater for videre vurdering.",
      workflow: "MNA_SCREENING",
      query: "programvare",
      industryCodePrefixes: "62, 63.1",
      municipalityNumbers: "0301",
      legalForms: "AS",
      statuses: ["ACTIVE"],
      minEmployees: "10",
      maxEmployees: "",
      minRevenue: "50000000",
      maxRevenue: "",
      fiscalYear: "2024",
      missingDataPolicy: "INCLUDE_WITH_GAP",
      limit: "100",
    })).toMatchObject({
      title: "Nordisk programvarescreening",
      workflow: "MNA_SCREENING",
      criteria: {
        query: "programvare",
        industryCodePrefixes: ["62", "63.1"],
      },
      universeQuery: {
        version: "company-universe-v1",
        workflow: "MNA_SCREENING",
        statuses: ["ACTIVE"],
        minEmployees: 10,
        minRevenue: 50_000_000,
        fiscalYear: 2024,
        limit: 100,
      },
    });
  });

  it("renders the three supported workflows and the active workspace", () => {
    const html = renderToStaticMarkup(
      <AnalysisEditor
        mode="create"
        workspace={{ id: "workspace-1", name: "Fjord-teamet" }}
      />,
    );

    expect(html).toContain("Ny analyse");
    expect(html).toContain("Fjord-teamet");
    expect(html).toContain("M&amp;A-screening");
    expect(html).toContain("Sourcing");
    expect(html).toContain("Konkurrentanalyse");
  });

  it("locks analytical context after a conclusion has been saved", () => {
    expect(isAnalysisContextLocked({
      worklists: [],
      conclusion: { summary: "Lagret." },
      sourceBasis: [],
    })).toBe(true);
    expect(isAnalysisContextLocked({
      worklists: [],
      conclusion: null,
      sourceBasis: [],
    })).toBe(false);
  });
});
