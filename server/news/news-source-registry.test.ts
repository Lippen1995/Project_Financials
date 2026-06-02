import { describe, expect, it } from "vitest";

import { getNewsSourceDefinition, listEnabledNewsSources, NEWS_SOURCE_REGISTRY } from "@/server/news/news-source-registry";

describe("news source registry", () => {
  it("contains only uniquely identified sources", () => {
    const ids = NEWS_SOURCE_REGISTRY.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("converts existing RSS feeds into enabled source definitions", () => {
    const eia = getNewsSourceDefinition("eia-press");

    expect(eia).toMatchObject({
      id: "eia-press",
      enabled: true,
      tier: "industry",
      language: "en",
    });
    expect(eia?.url).toContain("eia.gov");
  });

  it("exposes only configured enabled sources", () => {
    expect(listEnabledNewsSources().length).toBeGreaterThan(0);
    expect(listEnabledNewsSources().every((source) => source.enabled && Boolean(source.name))).toBe(true);
  });
});
