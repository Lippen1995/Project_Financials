import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  NjordClaimEvidence,
  stripNjordCitationMarkers,
} from "./njord-claim-evidence";

describe("NjordClaimEvidence", () => {
  it("renders each claim with inspectable provenance and an official source link", () => {
    const html = renderToStaticMarkup(
      <NjordClaimEvidence
        evidence={{
          invalidCitationIds: [],
          sources: [],
          claims: [{
            text: "Aksjeloven regulerer utbytte.",
            kind: "DOCUMENTED_FACT",
            citationIds: ["knowledge:doc-1:chunk-1"],
            sources: [{
              citationId: "knowledge:doc-1:chunk-1",
              label: "Aksjeloven",
              sourceUrl: "https://lovdata.no/dokument/NL/lov/1997-06-13-44",
              tool: "search_norwegian_law",
              toolVersion: "v1",
              kind: "DOCUMENTED_FACT",
              sourceSystem: "LOVDATA_API",
              sourceEntityType: "law-document",
              sourceId: "LOV-1997-06-13-44",
              fetchedAt: "2026-07-27T09:00:00.000Z",
              normalizedAt: "2026-07-27T09:00:01.000Z",
            }],
          }],
        }}
      />,
    );

    expect(html).toContain("Påstandsgrunnlag");
    expect(html).toContain("Aksjeloven regulerer utbytte.");
    expect(html).toContain("LOVDATA_API");
    expect(html).toContain("law-document");
    expect(html).toContain("LOV-1997-06-13-44");
    expect(html).toContain("Hentet");
    expect(html).toContain("Normalisert");
    expect(html).toContain('href="https://lovdata.no/dokument/NL/lov/1997-06-13-44"');
  });

  it("renders nothing when the answer has no source-backed claims", () => {
    expect(
      renderToStaticMarkup(
        <NjordClaimEvidence evidence={{ claims: [], sources: [], invalidCitationIds: [] }} />,
      ),
    ).toBe("");
  });

  it("removes machine citation markers from the chat copy", () => {
    expect(
      stripNjordCitationMarkers(
        "Fakta [source:1].\nBeregning [calculation:1].\nLov (knowledge:doc-1:chunk-1).",
      ),
    ).toBe("Fakta.\nBeregning.\nLov.");
  });
});
