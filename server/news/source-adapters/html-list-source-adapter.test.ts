import { afterEach, describe, expect, it, vi } from "vitest";

import type { NewsSourceDefinition } from "@/server/news/news-source-registry";
import { HtmlListSourceAdapter } from "@/server/news/source-adapters/html-list-source-adapter";

const source: NewsSourceDefinition = {
  id: "iea-news",
  name: "IEA News",
  type: "html_list",
  tier: "industry",
  country: "FR",
  language: "en",
  url: "https://www.iea.org/news?type=press-release",
  enabled: true,
  defaultCredibilityScore: 0.9,
  fetchConfig: {
    listUrl: "https://www.iea.org/news?type=press-release",
    itemSelector: "a[href^='/news/']",
    maxItems: 2,
    detailBodySelector: "main p",
    titleSelector: "h1",
    dateSelector: "time",
    dateAttribute: "datetime",
  },
};

describe("html list source adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses detail pages into source documents", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          `<html><body><a href="/news/example-story">Natural Gas Example story 24 April 2026</a></body></html>`,
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          `
            <html>
              <body>
                <main>
                  <h1>Example story</h1>
                  <time datetime="2026-04-24T06:00:00+00:00">24 April 2026</time>
                  <p>Press release 24 April 2026</p>
                  <p>Main market takeaway for the energy sector.</p>
                  <p>Second paragraph with more detail.</p>
                </main>
              </body>
            </html>
          `,
          { status: 200 },
        ),
      );

    const result = await new HtmlListSourceAdapter().fetch(source);

    expect(result.errors).toEqual([]);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toMatchObject({
      sourceId: "iea-news",
      title: "Example story",
      summary: "Main market takeaway for the energy sector.",
    });
    expect(result.documents[0]?.bodyText).toContain("Second paragraph");
  });
});
