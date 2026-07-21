import { describe, expect, it } from "vitest";

import {
  assertOfficialKnowledgeSource,
  assertKnowledgeSourceSystemMatchesUrl,
  chunkKnowledgeContent,
  isRuleEffectiveAt,
} from "./knowledge-domain";

describe("knowledge-domain", () => {
  it("keeps legal provisions intact when chunking official text", () => {
    const chunks = chunkKnowledgeContent(
      [
        "§ 1 Formål\nLoven skal fremme forsvarlig virksomhet.",
        "§ 2 Virkeområde\nLoven gjelder for norske aksjeselskaper.",
      ].join("\n\n"),
      { maxCharacters: 90 },
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ chunkIndex: 0, provisionRef: "§ 1" });
    expect(chunks[1]).toMatchObject({ chunkIndex: 1, provisionRef: "§ 2" });
  });

  it("evaluates effectivity at the requested historical date", () => {
    expect(
      isRuleEffectiveAt(
        { legalStatus: "IN_FORCE", effectiveFrom: new Date("2025-01-01"), effectiveTo: null },
        new Date("2026-02-01"),
      ),
    ).toBe(true);
    expect(
      isRuleEffectiveAt(
        { legalStatus: "REPEALED", effectiveFrom: new Date("2020-01-01"), effectiveTo: new Date("2025-01-01") },
        new Date("2026-02-01"),
      ),
    ).toBe(false);
    expect(
      isRuleEffectiveAt(
        { legalStatus: "IN_FORCE", effectiveFrom: null, effectiveTo: null },
        new Date("2026-02-01"),
      ),
    ).toBe(false);
  });

  it("rejects non-official sources from the knowledge ingestion boundary", () => {
    expect(() => assertOfficialKnowledgeSource("https://example.com/advice")).toThrow(
      /ikke en tillatt offisiell kilde/i,
    );
    expect(() =>
      assertOfficialKnowledgeSource("https://eur-lex.europa.eu/eli/reg/2023/1803/oj"),
    ).not.toThrow();
    expect(() =>
      assertKnowledgeSourceSystemMatchesUrl(
        "LOVDATA_API",
        "https://eur-lex.europa.eu/eli/reg/2023/1803/oj",
      ),
    ).toThrow(/kan ikke bruke URL/i);
  });
});
