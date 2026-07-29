import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  parseWorklistLines,
  WorklistCreateForm,
  WorklistItemActions,
} from "./analysis-worklist-actions";

describe("analysis worklist actions", () => {
  it("parses only user-supplied organisation numbers and evidence labels", () => {
    expect(parseWorklistLines(
      "100 000 001 | Matcher næringskode; Aktiv | Mangler regnskap | Kontroller eierbildet\n" +
      "100000002 | Relevant geografi |",
    )).toEqual([
      {
        orgNumber: "100000001",
        inclusionBasis: ["Matcher næringskode", "Aktiv"],
        dataGaps: ["Mangler regnskap"],
        notes: "Kontroller eierbildet",
      },
      {
        orgNumber: "100000002",
        inclusionBasis: ["Relevant geografi"],
        dataGaps: [],
      },
    ]);
  });

  it("rejects lines without a real organisation number or inclusion basis", () => {
    expect(() => parseWorklistLines("bedrift | relevant")).toThrow(/organisasjonsnummer/i);
    expect(() => parseWorklistLines("100000001")).toThrow(/inklusjonsgrunn/i);
  });

  it("renders create, reorder and promotion controls", () => {
    const createHtml = renderToStaticMarkup(
      <WorklistCreateForm
        analysisId="analysis-1"
        analysisVersion={2}
        criteriaVersion="analysis-criteria-v1"
      />,
    );
    const actionHtml = renderToStaticMarkup(
      <WorklistItemActions
        analysisId="analysis-1"
        sourceWorklistId="worklist-1"
        itemId="item-1"
        itemIndex={0}
        orderedItemIds={["item-1", "item-2"]}
        targets={[{ id: "worklist-2", name: "Shortlist" }]}
      />,
    );

    expect(createHtml).toContain("Ny arbeidsliste");
    expect(actionHtml).toContain("Flytt ned");
    expect(actionHtml).toContain("Shortlist");
    expect(actionHtml).toContain("Promoter");
  });
});
