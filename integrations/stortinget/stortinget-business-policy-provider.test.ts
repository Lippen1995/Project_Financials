import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchStortingetCases,
  normalizeStortingetCase,
} from "./stortinget-business-policy-provider";

afterEach(() => vi.unstubAllGlobals());

describe("normalizeStortingetCase", () => {
  it("keeps a parliamentary proposal distinct from law in force", () => {
    // Public Stortinget case 200386, reduced to fields used by the provider.
    const result = normalizeStortingetCase({
      id: 200386,
      sak_sesjon: "2025-2026",
      tittel: "Riksrevisjonens undersøkelse av Bane NORs eiendomsvirksomhet",
      korttittel: "Bane NORs eiendomsvirksomhet",
      henvisning: "Dokument 3:19 (2025–2026)",
      status: 3,
      sist_oppdatert_dato: "/Date(1782338400000+0200)/",
      emne_liste: [{ id: 83, navn: "Priser og konkurranseforhold" }],
    }, new Date("2026-07-21T10:00:00.000Z"));

    expect(result).toMatchObject({
      externalId: "STORTING-SAK-200386",
      domain: "BUSINESS_POLICY",
      legalStatus: "PROPOSED",
      sourceSystem: "STORTINGET_API",
    });
    expect(result.content).toContain("Status: til behandling");
  });

  it("rejects malformed records from the external API before normalization", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      saker_liste: [{ id: "not-a-number", tittel: "Ugyldig post" }],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(fetchStortingetCases("2025-2026")).rejects.toThrow();
  });
});
