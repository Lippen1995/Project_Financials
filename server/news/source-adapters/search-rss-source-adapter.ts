import { fetchGoogleNewsSearchFeed } from "@/integrations/news/rss-feed-provider";
import type { NewsSourceDefinition } from "@/server/news/news-source-registry";
import type { NewsSourceAdapter, SourceFetchResult } from "@/server/news/source-adapters/types";

type SearchFeedConfig = {
  query?: string;
  language?: string;
  geography?: string;
  edition?: string;
};

function asConfig(value: unknown): SearchFeedConfig {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as SearchFeedConfig)
    : {};
}

export class SearchRssSourceAdapter implements NewsSourceAdapter {
  sourceType = "search_rss";

  async fetch(source: NewsSourceDefinition): Promise<SourceFetchResult> {
    const fetchedAt = new Date();
    const config = asConfig(source.fetchConfig);
    const query = config.query?.trim();

    if (!query) {
      return {
        sourceId: source.id,
        documents: [],
        errors: [`Source ${source.id} is missing search query configuration.`],
        fetchedAt,
      };
    }

    try {
      const items = await fetchGoogleNewsSearchFeed(query, {
        feedId: source.id,
        language: config.language,
        geography: config.geography,
        edition: config.edition,
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
          rawPayload: {
            ...item,
            searchQuery: query,
          },
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
