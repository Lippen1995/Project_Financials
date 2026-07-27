import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ExclusionSourceEvidence,
  WorklistExclusionPanel,
} from "./analysis-worklist-exclusions";

describe("WorklistExclusionPanel", () => {
  it("identifies the stored screening run and its inspectable exclusions", () => {
    const html = renderToStaticMarkup(
      <WorklistExclusionPanel
        analysisId="analysis-1"
        worklistId="worklist-1"
        universeResultVersion="company-universe-result-v1"
        screeningVersion="company-screening-v1"
        rankingVersion="company-ranking-v1"
        evaluatedCount={3}
        includedCount={1}
        excludedCount={2}
        truncatedCount={0}
        universeExecutedAt="2026-07-27T20:00:00.000Z"
      />,
    );

    expect(html).toContain("company-screening-v1");
    expect(html).toContain("2 ekskludert");
    expect(html).toContain("Se eksklusjonsgrunnlag");
  });

  it("renders nothing for a manually curated worklist without a universe run", () => {
    expect(renderToStaticMarkup(
      <WorklistExclusionPanel
        analysisId="analysis-1"
        worklistId="worklist-1"
        universeResultVersion={null}
        screeningVersion={null}
        rankingVersion={null}
        evaluatedCount={null}
        includedCount={null}
        excludedCount={null}
        truncatedCount={null}
        universeExecutedAt={null}
      />,
    )).toBe("");
  });

  it("renders every provenance field for an excluded company source", () => {
    const html = renderToStaticMarkup(
      <ExclusionSourceEvidence
        value={[{
          sourceSystem: "BRREG",
          sourceEntityType: "company",
          sourceId: "100000002",
          fetchedAt: "2026-07-27T19:00:00.000Z",
          normalizedAt: "2026-07-27T19:01:00.000Z",
        }]}
      />,
    );

    expect(html).toContain("BRREG");
    expect(html).toContain("company");
    expect(html).toContain("100000002");
    expect(html).toContain("Hentet");
    expect(html).toContain("Normalisert");
  });
});
