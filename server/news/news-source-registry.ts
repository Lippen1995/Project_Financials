import { RSS_FEEDS } from "@/integrations/news/rss-feed-provider";

export type NewsSourceType =
  | "rss"
  | "atom"
  | "newsweb"
  | "regulator"
  | "brreg"
  | "company_ir"
  | "media"
  | "internal"
  | "petroleum"
  | "financials";

export type NewsSourceTier = "primary" | "regulatory" | "premium_media" | "industry" | "general" | "internal";

export type NewsSourceDefinition = {
  id: string;
  name: string;
  type: NewsSourceType;
  tier: NewsSourceTier;
  country?: string;
  language?: string;
  url?: string;
  enabled: boolean;
  defaultCredibilityScore: number;
  sectorTags?: string[];
  fetchConfig?: Record<string, unknown>;
};

const REGULATORY_SOURCE_IDS = new Set([
  "regjeringen",
  "oslobors",
  "norgesbank",
  "finanstilsynet",
  "konkurransetilsynet",
]);

const INDUSTRY_SOURCE_IDS = new Set([
  "tu",
  "norsk-olje-gass",
  "sodir-news",
  "sodir-production",
  "sodir-drilling-permits",
  "sodir-exploration-results",
  "eia-today",
  "eia-press",
  "eia-petroleum-weekly",
]);

function classifyRssSource(feedId: string): Pick<NewsSourceDefinition, "type" | "tier" | "country" | "language" | "defaultCredibilityScore" | "sectorTags"> {
  if (REGULATORY_SOURCE_IDS.has(feedId)) {
    return {
      type: feedId === "oslobors" ? "newsweb" : "regulator",
      tier: "regulatory",
      country: feedId.startsWith("eia") ? "US" : "NO",
      language: feedId === "norgesbank" ? "en" : "no",
      defaultCredibilityScore: 0.9,
    };
  }

  if (INDUSTRY_SOURCE_IDS.has(feedId)) {
    return {
      type: "rss",
      tier: "industry",
      country: feedId.startsWith("eia") ? "US" : "NO",
      language: feedId.startsWith("eia") ? "en" : "no",
      defaultCredibilityScore: feedId.startsWith("eia") || feedId.startsWith("sodir") ? 0.88 : 0.72,
      sectorTags: feedId.includes("eia") || feedId.includes("sodir") || feedId.includes("olje") ? ["energy", "oil_gas"] : undefined,
    };
  }

  return {
    type: "rss",
    tier: "general",
    country: feedId === "reuters-business" ? "US" : "NO",
    language: feedId === "reuters-business" ? "en" : "no",
    defaultCredibilityScore: feedId === "dn" || feedId === "e24" ? 0.74 : 0.62,
  };
}

export const NEWS_SOURCE_REGISTRY: NewsSourceDefinition[] = [
  ...RSS_FEEDS.map((feed) => ({
    id: feed.id,
    name: feed.name,
    url: feed.url,
    enabled: true,
    fetchConfig: { rssUrl: feed.url },
    ...classifyRssSource(feed.id),
  })),
  {
    id: "brreg-announcements",
    name: "Brønnøysundregistrene kunngjøringer",
    type: "brreg",
    tier: "primary",
    country: "NO",
    language: "no",
    enabled: true,
    defaultCredibilityScore: 0.95,
  },
  {
    id: "internal-financials",
    name: "Fjord Insight financial filing events",
    type: "financials",
    tier: "internal",
    country: "NO",
    enabled: true,
    defaultCredibilityScore: 0.86,
  },
  {
    id: "internal-company-status",
    name: "Fjord Insight company status events",
    type: "internal",
    tier: "internal",
    country: "NO",
    enabled: true,
    defaultCredibilityScore: 0.84,
  },
];

export function listEnabledNewsSources() {
  return NEWS_SOURCE_REGISTRY.filter((source) => source.enabled);
}

export function getNewsSourceDefinition(sourceId: string) {
  return NEWS_SOURCE_REGISTRY.find((source) => source.id === sourceId) ?? null;
}
