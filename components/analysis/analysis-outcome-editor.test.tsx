import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  AnalysisOutcomeEditor,
  buildOutcomePayload,
} from "./analysis-outcome-editor";

describe("AnalysisOutcomeEditor", () => {
  it("builds a structured outcome while preserving existing fields", () => {
    expect(buildOutcomePayload({
      expectedVersion: 3,
      status: "COMPLETED",
      summary: "Prioriter de to øverste kandidatene.",
      nextStep: "Valider eierstruktur.",
      sourceOrgNumbers: "100 000 001, 100000002\n100000001",
      existingConclusion: { decisionOwner: "CFO" },
      existingFollowUp: { due: "2026-08-15" },
    })).toEqual({
      expectedVersion: 3,
      status: "COMPLETED",
      conclusion: {
        decisionOwner: "CFO",
        summary: "Prioriter de to øverste kandidatene.",
      },
      followUp: {
        due: "2026-08-15",
        nextStep: "Valider eierstruktur.",
      },
      sourceOrgNumbers: ["100000001", "100000002"],
    });
  });

  it("renders the edit action for an active analysis", () => {
    const html = renderToStaticMarkup(
      <AnalysisOutcomeEditor
        analysisId="analysis-1"
        analysisVersion={3}
        status="IN_PROGRESS"
        conclusion={{ summary: "Foreløpig vurdering." }}
        followUp={null}
        sourceOrgNumbers={["100000001"]}
      />,
    );

    expect(html).toContain("Lagre konklusjon");
  });
});
