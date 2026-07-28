import { describe, expect, it } from "vitest";

import { createClaimEvidenceTracker } from "./claim-evidence";

describe("createClaimEvidenceTracker", () => {
  it("maps a cited factual claim to the exact source metadata returned by a tool", () => {
    const tracker = createClaimEvidenceTracker();
    const recorded = tracker.recordToolResult({
      name: "resolve_company",
      toolVersion: "v1",
      outputKind: "DOCUMENTED_FACT",
      dataDomains: ["company-master"],
      output: {
        resolved: {
          orgNumber: "923609016",
          name: "EQUINOR ASA",
          provenance: {
            sourceSystem: "BRREG",
            sourceEntityType: "company",
            sourceId: "923609016",
            fetchedAt: "2026-07-27T09:00:00.000Z",
            normalizedAt: "2026-07-27T09:00:01.000Z",
          },
        },
      },
    });

    expect(recorded.citationSources).toHaveLength(1);
    const citationId = recorded.citationSources[0]!.citationId;
    const result = tracker.buildResult(
      `EQUINOR ASA har organisasjonsnummer 923609016 [${citationId}].`,
    );

    expect(result.invalidCitationIds).toEqual([]);
    expect(result.claims).toEqual([
      expect.objectContaining({
        text: "EQUINOR ASA har organisasjonsnummer 923609016.",
        kind: "DOCUMENTED_FACT",
        citationIds: [citationId],
        sources: [
          expect.objectContaining({
            citationId,
            sourceSystem: "BRREG",
            sourceEntityType: "company",
            sourceId: "923609016",
          }),
        ],
      }),
    ]);
  });

  it("preserves an official knowledge citation and its clickable source URL", () => {
    const tracker = createClaimEvidenceTracker();
    const recorded = tracker.recordToolResult({
      name: "search_norwegian_law",
      toolVersion: "v1",
      outputKind: "DOCUMENTED_FACT",
      dataDomains: ["official-knowledge"],
      output: {
        results: [{
          citationId: "knowledge:doc-1:chunk-1",
          title: "Aksjeloven",
          sourceUrl: "https://lovdata.no/dokument/NL/lov/1997-06-13-44",
          provenance: {
            sourceSystem: "LOVDATA_API",
            sourceEntityType: "law-document",
            sourceId: "LOV-1997-06-13-44",
            fetchedAt: "2026-07-27T09:00:00.000Z",
            normalizedAt: "2026-07-27T09:00:01.000Z",
          },
        }],
      },
    });

    expect(recorded.citationSources[0]).toMatchObject({
      citationId: "knowledge:doc-1:chunk-1",
      label: "Aksjeloven",
      sourceUrl: "https://lovdata.no/dokument/NL/lov/1997-06-13-44",
    });
    expect(
      tracker.buildResult(
        "Aksjeloven stiller krav til forsvarlig egenkapital (knowledge:doc-1:chunk-1).",
      ).claims[0],
    ).toMatchObject({
      text: "Aksjeloven stiller krav til forsvarlig egenkapital.",
      citationIds: ["knowledge:doc-1:chunk-1"],
    });
  });

  it("keeps separate knowledge chunks from the same official document citable", () => {
    const tracker = createClaimEvidenceTracker();
    const provenance = {
      sourceSystem: "LOVDATA_API",
      sourceEntityType: "law-document",
      sourceId: "LOV-1997-06-13-44",
      fetchedAt: "2026-07-27T09:00:00.000Z",
      normalizedAt: "2026-07-27T09:00:01.000Z",
    };
    const recorded = tracker.recordToolResult({
      name: "search_norwegian_law",
      toolVersion: "v1",
      outputKind: "DOCUMENTED_FACT",
      dataDomains: ["official-knowledge"],
      output: {
        results: [
          { citationId: "knowledge:doc-1:chunk-1", title: "§ 1", provenance },
          { citationId: "knowledge:doc-1:chunk-2", title: "§ 2", provenance },
        ],
      },
    });

    expect(recorded.citationSources.map((source) => source.citationId)).toEqual([
      "knowledge:doc-1:chunk-1",
      "knowledge:doc-1:chunk-2",
    ]);
  });

  it("does not expose a non-HTTP source URL to the client", () => {
    const tracker = createClaimEvidenceTracker();
    const recorded = tracker.recordToolResult({
      name: "search_norwegian_law",
      toolVersion: "v1",
      outputKind: "DOCUMENTED_FACT",
      dataDomains: ["official-knowledge"],
      output: {
        results: [{
          citationId: "knowledge:doc-1:chunk-1",
          sourceUrl: "javascript:alert(1)",
          provenance: {
            sourceSystem: "LOVDATA_API",
            sourceEntityType: "law-document",
            sourceId: "LOV-1",
            fetchedAt: "2026-07-27T09:00:00.000Z",
            normalizedAt: "2026-07-27T09:00:01.000Z",
          },
        }],
      },
    });

    expect(recorded.citationSources[0]?.sourceUrl).toBeNull();
  });

  it("creates a versioned calculation citation even when the result has no external source", () => {
    const tracker = createClaimEvidenceTracker();
    const recorded = tracker.recordToolResult({
      name: "screen_company_universe",
      toolVersion: "v1",
      outputKind: "CALCULATION",
      dataDomains: ["company-master", "financials"],
      output: {
        version: "company-universe-result-v1",
        counts: { evaluated: 12, included: 3, excluded: 9, truncated: 0 },
      },
    });

    expect(recorded.citationSources).toEqual([
      expect.objectContaining({
        citationId: "calculation:1",
        sourceSystem: "FJORD_INSIGHT",
        sourceEntityType: "deterministic-calculation",
        sourceId: "screen_company_universe@v1",
        kind: "CALCULATION",
      }),
    ]);
    expect(
      tracker.buildResult(
        "Tre selskaper ble inkludert av company-universe-v1 [calculation:1].",
      ).claims[0],
    ).toMatchObject({
      kind: "CALCULATION",
      citationIds: ["calculation:1"],
    });
  });
});
