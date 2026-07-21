import { describe, expect, it } from "vitest";

import { normalizeStortingetCase } from "@/integrations/stortinget/stortinget-business-policy-provider";
import { officialKnowledgeDocumentSchema } from "./knowledge-ingestion-service";

function officialCase() {
  return normalizeStortingetCase({
    id: 200386,
    sak_sesjon: "2025-2026",
    tittel: "Riksrevisjonens undersøkelse av Bane NORs eiendomsvirksomhet",
    status: 3,
    sist_oppdatert_dato: "/Date(1782338400000+0200)/",
  }, new Date("2026-07-21T10:00:00.000Z"));
}

describe("officialKnowledgeDocumentSchema", () => {
  it("rejects a rule labelled in force without a documented effective date", () => {
    const result = officialKnowledgeDocumentSchema.safeParse({
      ...officialCase(),
      legalStatus: "IN_FORCE",
    });

    expect(result.success).toBe(false);
  });

  it("rejects EEA incorporation without decision and dated applicability metadata", () => {
    const result = officialKnowledgeDocumentSchema.safeParse({
      ...officialCase(),
      eeaIncorporationStatus: "INCORPORATED",
    });

    expect(result.success).toBe(false);
  });

  it("rejects applicability data that contradicts NOT_RELEVANT or NOT_REQUIRED", () => {
    const eeaResult = officialKnowledgeDocumentSchema.safeParse({
      ...officialCase(),
      eeaIncorporationStatus: "NOT_RELEVANT",
      eeaDecisionReference: "JCD 1/2026",
    });
    const norwayResult = officialKnowledgeDocumentSchema.safeParse({
      ...officialCase(),
      norwayImplementationStatus: "NOT_REQUIRED",
      norwayImplementingReference: "LOV-2026-01-01-1",
    });

    expect(eeaResult.success).toBe(false);
    expect(norwayResult.success).toBe(false);
  });
});
