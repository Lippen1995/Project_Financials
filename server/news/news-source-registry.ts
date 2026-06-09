import { RSS_FEEDS } from "@/integrations/news/rss-feed-provider";

export type NewsSourceType =
  | "rss"
  | "search_rss"
  | "html_list"
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
  "ecb-press",
  "federalreserve-press",
]);

const STATISTICAL_SOURCE_IDS = new Set([
  "ssb-business-financials",
  "ssb-energy-industry",
  "ssb-tech-innovation",
  "ssb-transport-travel",
  "ssb-construction-property",
  "ssb-bank-finance",
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
  "nasa-breaking",
  "fda-press",
  "offshore-energy",
  "offshorewind",
  "worldoil-news",
  "worldoil-permian",
  "pulpapernews",
  "mining-com",
  "mining-technology",
  "marinelink",
  "freightwaves",
  "splash247",
  "undercurrent-news",
  "fishfarmer",
  "renewable-energy-world",
  "semiengineering",
  "siliconangle",
  "fiercebiotech",
  "biopharmadive",
  "constructiondive",
  "recyclingtoday",
  "spacenews",
  "defensenews",
  "army-technology",
  "airport-technology",
  "agfunder",
  "insurancejournal",
  "scmp-business",
  "asiafinancial",
  "iea-news",
  "google-news-energy-majors",
  "google-news-us-shale",
  "google-news-upstream",
  "google-news-bloomberg-energy",
  "google-news-ft-energy",
  "google-news-middle-east-energy",
  "google-news-ai-software",
  "google-news-semiconductors",
  "google-news-metals-mining",
  "google-news-forestry-pulp-paper",
  "google-news-agriculture-fertilizer",
  "google-news-aquaculture-salmon",
  "google-news-robotics-automation",
  "google-news-china-industrial-policy",
  "google-news-defense-aerospace",
  "google-news-aviation-airports",
  "google-news-shipping-freight",
  "google-news-space",
  "google-news-healthcare-biotech",
  "google-news-construction-real-estate",
  "google-news-renewables-grid",
  "google-news-recycling-circular-materials",
  "google-news-bank-insurance-capital-markets",
]);

const SOURCE_SECTOR_TAG_OVERRIDES: Record<string, string[]> = {
  tu: ["technology", "industry"],
  "norsk-olje-gass": ["energy", "oil_gas", "petroleum"],
  "sodir-news": ["energy", "oil_gas", "petroleum", "offshore"],
  "sodir-production": ["energy", "oil_gas", "petroleum"],
  "sodir-drilling-permits": ["energy", "oil_gas", "petroleum", "offshore"],
  "sodir-exploration-results": ["energy", "oil_gas", "petroleum", "offshore"],
  "eia-today": ["energy", "oil_gas", "macro"],
  "eia-press": ["energy", "oil_gas", "macro"],
  "eia-petroleum-weekly": ["energy", "oil_gas", "macro"],
  "nasa-breaking": ["space", "aerospace", "technology"],
  "fda-press": ["healthcare", "pharma", "biotech", "regulatory"],
  "ecb-press": ["macro", "banking", "capital_markets", "finance"],
  "federalreserve-press": ["macro", "banking", "capital_markets", "finance"],
  "ssb-business-financials": ["statistics", "finance", "macro"],
  "ssb-energy-industry": ["statistics", "energy", "industry", "macro"],
  "ssb-tech-innovation": ["statistics", "technology", "ai", "innovation"],
  "ssb-transport-travel": ["statistics", "transport", "aviation", "shipping", "travel"],
  "ssb-construction-property": ["statistics", "construction", "real_estate", "housing"],
  "ssb-bank-finance": ["statistics", "banking", "insurance", "capital_markets", "finance"],
  "offshore-energy": ["energy", "offshore", "shipping", "renewables"],
  offshorewind: ["energy", "renewables", "offshore", "power"],
  "worldoil-news": ["energy", "oil_gas", "offshore"],
  "worldoil-permian": ["energy", "oil_gas", "shale"],
  pulpapernews: ["forestry", "pulp_paper", "packaging", "timber"],
  "mining-com": ["metals", "mining", "materials"],
  "mining-technology": ["metals", "mining", "materials"],
  marinelink: ["shipping", "maritime", "offshore", "freight"],
  freightwaves: ["shipping", "freight", "logistics", "transport"],
  splash247: ["shipping", "maritime", "freight"],
  "undercurrent-news": ["aquaculture", "seafood", "salmon"],
  fishfarmer: ["aquaculture", "seafood", "salmon"],
  "renewable-energy-world": ["renewables", "power", "grid", "energy"],
  semiengineering: ["semiconductors", "chips", "technology", "hardware"],
  siliconangle: ["ai", "software", "cloud", "technology"],
  fiercebiotech: ["healthcare", "biotech", "pharma"],
  biopharmadive: ["healthcare", "biotech", "pharma", "medtech"],
  constructiondive: ["construction", "housing", "building_materials", "real_estate"],
  recyclingtoday: ["recycling", "circular_economy", "materials"],
  spacenews: ["space", "satellites", "aerospace", "defense"],
  defensenews: ["defense", "aerospace", "geopolitics"],
  "army-technology": ["defense", "aerospace", "geopolitics"],
  "airport-technology": ["aviation", "airports", "travel", "infrastructure"],
  agfunder: ["agriculture", "fertilizer", "food", "technology"],
  insurancejournal: ["insurance", "finance", "capital_markets"],
  "scmp-business": ["china", "macro", "technology", "capital_markets"],
  asiafinancial: ["china", "macro", "capital_markets", "banking"],
  "bbc-business": ["macro", "capital_markets", "general_business"],
  "guardian-business": ["macro", "capital_markets", "general_business"],
  "guardian-world": ["macro", "geopolitics"],
  "reuters-business": ["macro", "capital_markets", "general_business"],
};

const SOURCE_CREDIBILITY_OVERRIDES: Record<string, number> = {
  tu: 0.74,
  "norsk-olje-gass": 0.78,
  "sodir-news": 0.9,
  "sodir-production": 0.9,
  "sodir-drilling-permits": 0.9,
  "sodir-exploration-results": 0.9,
  "eia-today": 0.9,
  "eia-press": 0.92,
  "eia-petroleum-weekly": 0.9,
  "nasa-breaking": 0.9,
  "fda-press": 0.9,
  "ecb-press": 0.92,
  "federalreserve-press": 0.92,
  "offshore-energy": 0.76,
  offshorewind: 0.78,
  "worldoil-news": 0.76,
  "worldoil-permian": 0.76,
  pulpapernews: 0.74,
  "mining-com": 0.76,
  "mining-technology": 0.75,
  marinelink: 0.74,
  freightwaves: 0.74,
  splash247: 0.74,
  "undercurrent-news": 0.78,
  fishfarmer: 0.74,
  "renewable-energy-world": 0.78,
  semiengineering: 0.78,
  siliconangle: 0.72,
  fiercebiotech: 0.8,
  biopharmadive: 0.78,
  constructiondive: 0.76,
  recyclingtoday: 0.74,
  spacenews: 0.8,
  defensenews: 0.8,
  "army-technology": 0.76,
  "airport-technology": 0.74,
  agfunder: 0.74,
  insurancejournal: 0.76,
  "scmp-business": 0.76,
  asiafinancial: 0.72,
  "bbc-business": 0.78,
  "guardian-business": 0.76,
  "guardian-world": 0.76,
  "reuters-business": 0.84,
};

function applySourceOverrides(
  feedId: string,
  base: Pick<NewsSourceDefinition, "type" | "tier" | "country" | "language" | "defaultCredibilityScore" | "sectorTags">,
) {
  return {
    ...base,
    defaultCredibilityScore: SOURCE_CREDIBILITY_OVERRIDES[feedId] ?? base.defaultCredibilityScore,
    sectorTags: SOURCE_SECTOR_TAG_OVERRIDES[feedId] ?? base.sectorTags,
  };
}

function classifyRssSource(feedId: string): Pick<NewsSourceDefinition, "type" | "tier" | "country" | "language" | "defaultCredibilityScore" | "sectorTags"> {
  if (REGULATORY_SOURCE_IDS.has(feedId)) {
    return applySourceOverrides(feedId, {
      type: feedId === "oslobors" ? "newsweb" : "regulator",
      tier: "regulatory",
      country:
        feedId === "ecb-press"
          ? "EU"
          : feedId === "federalreserve-press"
            ? "US"
            : feedId.startsWith("eia")
            ? "US"
            : "NO",
      language: feedId === "norgesbank" || feedId === "ecb-press" || feedId === "federalreserve-press" ? "en" : "no",
      defaultCredibilityScore: 0.9,
    });
  }

  if (STATISTICAL_SOURCE_IDS.has(feedId)) {
    return applySourceOverrides(feedId, {
      type: "rss",
      tier: "regulatory",
      country: "NO",
      language: "no",
      defaultCredibilityScore: 0.92,
      sectorTags: ["macro", "statistics"],
    });
  }

  if (INDUSTRY_SOURCE_IDS.has(feedId)) {
    return applySourceOverrides(feedId, {
      type: "rss",
      tier: "industry",
      country:
        feedId === "scmp-business" || feedId === "asiafinancial"
          ? "HK"
          : feedId === "fishfarmer"
            ? "GB"
            : feedId === "pulpapernews"
              ? "SE"
              : feedId.startsWith("eia") ||
        feedId.startsWith("google-news-") ||
        feedId === "iea-news" ||
        feedId === "nasa-breaking" ||
        feedId === "fda-press" ||
        feedId === "offshorewind" ||
        feedId === "pulpapernews" ||
        feedId === "mining-com" ||
        feedId === "mining-technology" ||
        feedId === "marinelink" ||
        feedId === "freightwaves" ||
        feedId === "splash247" ||
        feedId === "undercurrent-news" ||
        feedId === "fishfarmer" ||
        feedId === "renewable-energy-world" ||
        feedId === "semiengineering" ||
        feedId === "siliconangle" ||
        feedId === "fiercebiotech" ||
        feedId === "biopharmadive" ||
        feedId === "constructiondive" ||
        feedId === "recyclingtoday" ||
        feedId === "spacenews" ||
        feedId === "defensenews" ||
        feedId === "army-technology" ||
        feedId === "airport-technology" ||
        feedId === "agfunder" ||
        feedId === "insurancejournal" ||
        feedId === "scmp-business" ||
        feedId === "asiafinancial"
          ? "US"
          : "NO",
      language:
        feedId.startsWith("eia") ||
        feedId.startsWith("google-news-") ||
        feedId === "iea-news" ||
        feedId === "nasa-breaking" ||
        feedId === "fda-press" ||
        feedId === "offshorewind" ||
        feedId === "pulpapernews" ||
        feedId === "mining-com" ||
        feedId === "mining-technology" ||
        feedId === "marinelink" ||
        feedId === "freightwaves" ||
        feedId === "splash247" ||
        feedId === "undercurrent-news" ||
        feedId === "fishfarmer" ||
        feedId === "renewable-energy-world" ||
        feedId === "semiengineering" ||
        feedId === "siliconangle" ||
        feedId === "fiercebiotech" ||
        feedId === "biopharmadive" ||
        feedId === "constructiondive" ||
        feedId === "recyclingtoday" ||
        feedId === "spacenews" ||
        feedId === "defensenews" ||
        feedId === "army-technology" ||
        feedId === "airport-technology" ||
        feedId === "agfunder" ||
        feedId === "insurancejournal" ||
        feedId === "scmp-business" ||
        feedId === "asiafinancial"
          ? "en"
          : "no",
      defaultCredibilityScore:
        feedId.startsWith("eia") ||
        feedId.startsWith("sodir") ||
        feedId === "iea-news" ||
        feedId === "nasa-breaking" ||
        feedId === "fda-press"
          ? 0.88
          : 0.72,
      sectorTags:
        feedId.includes("eia") || feedId.includes("sodir") || feedId.includes("olje") ? ["energy", "oil_gas"] : undefined,
    });
  }

  return applySourceOverrides(feedId, {
    type: "rss",
    tier: "general",
    country: feedId === "reuters-business" ? "US" : "NO",
    language: feedId === "reuters-business" ? "en" : "no",
    defaultCredibilityScore: feedId === "dn" || feedId === "e24" ? 0.74 : 0.62,
  });
}

const GOOGLE_TOPIC_SEARCH_SOURCES: NewsSourceDefinition[] = [
  {
    id: "google-news-energy-majors",
    name: "Google News Energy Majors",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.68,
    sectorTags: ["energy", "oil_gas", "peers"],
    fetchConfig: {
      query: "\"Equinor\" OR \"Shell\" OR \"BP\" OR \"ExxonMobil\" OR \"Chevron\" OR \"TotalEnergies\" oil gas",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-us-shale",
    name: "Google News US Shale",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.7,
    sectorTags: ["energy", "oil_gas", "shale", "macro"],
    fetchConfig: {
      query: "\"US shale\" OR Permian OR Bakken OR \"Eagle Ford\" oil gas",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-upstream",
    name: "Google News Upstream Coverage",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.7,
    sectorTags: ["energy", "oil_gas", "offshore"],
    fetchConfig: {
      query: "site:upstreamonline.com Equinor OR Shell OR BP OR ExxonMobil OR Chevron OR offshore",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-bloomberg-energy",
    name: "Google News Bloomberg Energy",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.72,
    sectorTags: ["energy", "oil_gas", "markets", "macro"],
    fetchConfig: {
      query: "\"Bloomberg\" energy oil gas markets",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-ft-energy",
    name: "Google News Financial Times Energy",
    type: "search_rss",
    tier: "industry",
    country: "GB",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.72,
    sectorTags: ["energy", "oil_gas", "markets", "macro"],
    fetchConfig: {
      query: "\"Financial Times\" energy oil gas",
      language: "en",
      geography: "GB",
      edition: "GB:en",
    },
  },
  {
    id: "google-news-middle-east-energy",
    name: "Google News Middle East Energy",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.7,
    sectorTags: ["energy", "oil_gas", "geopolitics", "macro"],
    fetchConfig: {
      query: "\"Middle East\" oil shipping Hormuz energy market",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-ai-software",
    name: "Google News AI and Software",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.68,
    sectorTags: ["ai", "software", "technology"],
    fetchConfig: {
      query: "\"artificial intelligence\" OR datacenter OR chips OR \"enterprise software\"",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-semiconductors",
    name: "Google News Semiconductors",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.7,
    sectorTags: ["semiconductors", "chips", "hardware", "ai"],
    fetchConfig: {
      query: "semiconductor foundry memory chips ASML TSMC Nvidia",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-metals-mining",
    name: "Google News Metals and Mining",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.69,
    sectorTags: ["metals", "mining", "commodities"],
    fetchConfig: {
      query: "metals mining copper \"iron ore\" lithium aluminium",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-forestry-pulp-paper",
    name: "Google News Forestry, Pulp and Paper",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.67,
    sectorTags: ["forestry", "pulp_paper", "timber", "packaging"],
    fetchConfig: {
      query: "\"pulp and paper\" forestry timber packaging",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-agriculture-fertilizer",
    name: "Google News Agriculture and Fertilizer",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.69,
    sectorTags: ["agriculture", "fertilizer", "commodities"],
    fetchConfig: {
      query: "fertilizer ammonia potash grain agriculture",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-aquaculture-salmon",
    name: "Google News Aquaculture and Salmon",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.68,
    sectorTags: ["aquaculture", "seafood", "salmon"],
    fetchConfig: {
      query: "\"salmon farming\" aquaculture Norway Chile",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-robotics-automation",
    name: "Google News Robotics and Automation",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.67,
    sectorTags: ["robotics", "automation", "manufacturing"],
    fetchConfig: {
      query: "robotics automation \"industrial robots\" warehouse robotics",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-china-industrial-policy",
    name: "Google News China Industrial Policy",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.69,
    sectorTags: ["china", "macro", "geopolitics", "industry"],
    fetchConfig: {
      query: "China policy property industrial stimulus exports",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-defense-aerospace",
    name: "Google News Defense and Aerospace",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.7,
    sectorTags: ["defense", "aerospace", "geopolitics"],
    fetchConfig: {
      query: "defense aerospace missiles drones Europe",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-aviation-airports",
    name: "Google News Aviation and Airports",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.68,
    sectorTags: ["aviation", "airports", "travel", "infrastructure"],
    fetchConfig: {
      query: "airports airlines aviation travel demand aircraft",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-shipping-freight",
    name: "Google News Shipping and Freight",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.69,
    sectorTags: ["shipping", "freight", "trade", "logistics"],
    fetchConfig: {
      query: "shipping container tanker \"dry bulk\" freight rates",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-space",
    name: "Google News Space",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.68,
    sectorTags: ["space", "satellites", "aerospace"],
    fetchConfig: {
      query: "space launch satellite aerospace",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-healthcare-biotech",
    name: "Google News Healthcare and Biotech",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.69,
    sectorTags: ["healthcare", "biotech", "pharma", "medtech"],
    fetchConfig: {
      query: "healthcare pharma medtech hospitals biotech",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-construction-real-estate",
    name: "Google News Construction and Real Estate",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.68,
    sectorTags: ["construction", "real_estate", "housing", "building_materials"],
    fetchConfig: {
      query: "construction cement aggregates housing \"real estate\" property market",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-renewables-grid",
    name: "Google News Renewables and Grid",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.69,
    sectorTags: ["renewables", "power", "grid", "batteries"],
    fetchConfig: {
      query: "\"renewable energy\" wind solar battery grid power",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-recycling-circular-materials",
    name: "Google News Recycling and Circular Materials",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.67,
    sectorTags: ["recycling", "circular_economy", "materials"],
    fetchConfig: {
      query: "recycling circular economy scrap waste materials",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
  {
    id: "google-news-bank-insurance-capital-markets",
    name: "Google News Banking, Insurance and Capital Markets",
    type: "search_rss",
    tier: "industry",
    country: "US",
    language: "en",
    url: "https://news.google.com",
    enabled: true,
    defaultCredibilityScore: 0.7,
    sectorTags: ["banking", "insurance", "capital_markets", "credit"],
    fetchConfig: {
      query: "bank insurance \"capital markets\" IPO \"credit spreads\" underwriting",
      language: "en",
      geography: "US",
      edition: "US:en",
    },
  },
];

export const NEWS_SOURCE_REGISTRY: NewsSourceDefinition[] = [
  ...RSS_FEEDS.map((feed) => ({
    id: feed.id,
    name: feed.name,
    url: feed.url,
    enabled: true,
    fetchConfig: feed.id === "oslobors"
      ? {
          rssUrl: feed.url,
          newswebCompanyLimit: 40,
          newswebMessageLimit: 12,
          newswebConcurrency: 4,
          includeNewswebBody: false,
        }
      : { rssUrl: feed.url },
    ...classifyRssSource(feed.id),
  })),
  {
    id: "iea-news",
    name: "IEA News and Commentaries",
    type: "html_list",
    tier: "industry",
    country: "FR",
    language: "en",
    url: "https://www.iea.org/news?type=press-release",
    enabled: true,
    defaultCredibilityScore: 0.94,
    sectorTags: ["energy", "oil_gas", "macro"],
    fetchConfig: {
      listUrl: "https://www.iea.org/news?type=press-release",
      itemSelector: "a[href^='/news/']",
      maxItems: 12,
      detailBodySelector: "main p",
      titleSelector: "h1",
      dateSelector: "time",
      dateAttribute: "datetime",
    },
  },
  ...GOOGLE_TOPIC_SEARCH_SOURCES,
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
