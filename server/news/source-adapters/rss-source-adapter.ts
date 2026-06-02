import { fetchAndParseRssFeed } from "@/integrations/news/rss-feed-provider";
import type { NewsSourceDefinition } from "@/server/news/news-source-registry";
import type { NewsSourceAdapter, SourceFetchResult } from "@/server/news/source-adapters/types";

export class RssSourceAdapter implements NewsSourceAdapter {
  sourceType = "rss";

  async fetch(source: NewsSourceDefinition): Promise<SourceFetchResult> {
    const fetchedAt = new Date();
    if (!source.url) {
      return {
        sourceId: source.id,
        documents: [],
        errors: [`Source ${source.id} has no RSS/Atom URL configured.`],
        fetchedAt,
      };
    }

    try {
      const items = await fetchAndParseRssFeed({
        id: source.id,
        name: source.name,
        url: source.url,
      });

      return {
        sourceId: source.id,
        documents: items.map((item) => ({
          sourceId: source.id,
          externalId: item.guid,
          url: item.url,
          canonicalUrl: item.url,
          title: item.title,
          summary: item.summary,
          language: source.language ?? null,
          publishedAt: item.publishedAt,
          rawPayload: item,
        })),
        errors: [],
        fetchedAt,
      };
    } catch (error) {
      return {
        sourceId: source.id,
        documents: [],
        errors: [error instanceof Error ? error.message : String(error)],
        fetchedAt,
      };
    }
  }
}
