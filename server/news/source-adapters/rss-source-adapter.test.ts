import { afterEach, describe, expect, it, vi } from "vitest";

import { RssSourceAdapter } from "@/server/news/source-adapters/rss-source-adapter";
import type { NewsSourceDefinition } from "@/server/news/news-source-registry";

const source: NewsSourceDefinition = {
  id: "test-rss",
  name: "Test RSS",
  type: "rss",
  tier: "general",
  country: "NO",
  language: "no",
  url: "https://example.com/feed.xml",
  enabled: true,
  defaultCredibilityScore: 0.5,
};

describe("rss source adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses RSS documents into source documents", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        `<?xml version="1.0"?>
        <rss><channel><item>
          <guid>article-1</guid>
          <title>Equinor announces contract</title>
          <link>https://example.com/article?utm_source=x</link>
          <description><![CDATA[Important update]]></description>
          <pubDate>Tue, 02 Jun 2026 10:00:00 GMT</pubDate>
        </item></channel></rss>`,
        { status: 200 },
      ),
    );

    const result = await new RssSourceAdapter().fetch(source);

    expect(result.errors).toEqual([]);
    expect(result.documents[0]).toMatchObject({
      sourceId: "test-rss",
      externalId: "article-1",
      title: "Equinor announces contract",
      summary: "Important update",
    });
  });

  it("returns adapter errors instead of throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("missing", { status: 404 }));

    const result = await new RssSourceAdapter().fetch(source);

    expect(result.documents).toEqual([]);
    expect(result.errors[0]).toContain("HTTP 404");
  });
});
