import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AnalysisList } from "./analysis-list";

describe("AnalysisList", () => {
  it("renders resumable analyses and an honest empty state", () => {
    const analysisHtml = renderToStaticMarkup(
      <AnalysisList
        analyses={[{
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
          createdAt: "2026-07-27T10:00:00.000Z",
          updatedAt: "2026-07-27T11:00:00.000Z",
        }]}
      />,
    );
    const emptyHtml = renderToStaticMarkup(<AnalysisList analyses={[]} />);

    expect(analysisHtml).toContain("Oppkjøpsscreening");
    expect(analysisHtml).toContain("Fortsett analysen");
    expect(analysisHtml).toContain("1 arbeidsliste");
    expect(emptyHtml).toContain("Ingen analyser lagret ennå");
    expect(emptyHtml).toContain("Opprett analyse");
  });
});
