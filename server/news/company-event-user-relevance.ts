import { prisma } from "@/lib/prisma";
import type { EventClassification } from "@/server/news/company-event-taxonomy";

type SourceLike = {
  id: string;
  sourceType?: string | null;
  metadata?: unknown;
};

export type CompanyEventUserRelevanceContext = {
  companyId: string;
  companyName: string;
  orgNumber: string | null;
  industryCode: string | null;
  industryPrefixes: string[];
  sectorTags: string[];
  isPetroleumCompany: boolean;
  activeWatchCount: number;
};

export type CompanyEventUserRelevance = {
  userRelevanceScore: number;
  sectorFitScore: number;
  watchlistIntensity: number;
  sourceTopicScore: number;
  sourceSectorMismatch: boolean;
  sourceSectorTags: string[];
  companySectorTags: string[];
};

const contextCache = new Map<string, Promise<CompanyEventUserRelevanceContext | null>>();

const EVENT_BASE_RELEVANCE: Record<string, number> = {
  buyback: 0.32,
  dividend: 0.3,
  capital_raise: 0.32,
  insider_transaction: 0.24,
  annual_report: 0.28,
  financial_statement: 0.28,
  earnings: 0.2,
  board_change: 0.18,
  contract: 0.2,
  discovery: 0.24,
  production_update: 0.24,
  license_award: 0.24,
  regulatory_change: 0.22,
  regulatory_approval: 0.2,
  investigation: 0.22,
  commodity_price_exposure: 0.18,
  interest_rate: 0.18,
  interest_rate_exposure: 0.18,
  sector_news: 0.16,
  macro_news: 0.16,
  low_signal_mention: 0.04,
};

const AMBIGUOUS_COMPANY_NAME_TOKENS = new Set([
  "quantum",
  "commerce",
  "next",
  "wise",
  "marine",
  "solid",
  "earth",
  "ocean",
  "fresh",
]);

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function unique(items: string[]) {
  return Array.from(new Set(items.map(normalizeToken).filter(Boolean)));
}

function companyCoreNameTokens(name: string) {
  return unique(
    name
      .split(/\s+/)
      .map((token) => normalizeToken(token))
      .filter(
        (token) =>
          token.length >= 3 &&
          !["as", "asa", "ans", "da", "sa", "spv", "the", "og", "and"].includes(token),
      ),
  );
}

function hasAnyTag(tags: Iterable<string>, candidates: string[]) {
  const set = new Set(tags);
  return candidates.some((candidate) => set.has(candidate));
}

function getIndustryPrefixes(code: string | null) {
  if (!code) return [] as string[];
  const cleaned = code.replace(/\D/g, "");
  return Array.from(new Set([cleaned.slice(0, 2), cleaned.slice(0, 4), cleaned.slice(0, 5)].filter((value) => value.length >= 2)));
}

function sectorTagsFromIndustry(industryCode: string | null) {
  const prefixes = getIndustryPrefixes(industryCode);
  const tags = new Set<string>();

  for (const prefix of prefixes) {
    if (["05", "06", "09", "19"].includes(prefix.slice(0, 2))) {
      ["energy", "oil_gas", "offshore", "petroleum"].forEach((tag) => tags.add(tag));
    }
    if (["35"].includes(prefix.slice(0, 2))) {
      ["power", "renewables", "grid", "utilities"].forEach((tag) => tags.add(tag));
    }
    if (["58", "62", "63"].includes(prefix.slice(0, 2))) {
      ["technology"].forEach((tag) => tags.add(tag));
    }
    if (prefix === "5829" || prefix === "58290" || prefix === "62" || prefix === "63") {
      ["software", "technology"].forEach((tag) => tags.add(tag));
    }
    if (prefix.slice(0, 2) === "58") {
      ["publishing", "media"].forEach((tag) => tags.add(tag));
    }
    if (["26"].includes(prefix.slice(0, 2))) {
      ["semiconductors", "electronics", "hardware"].forEach((tag) => tags.add(tag));
    }
    if (["24", "07", "08"].includes(prefix.slice(0, 2))) {
      ["metals", "mining", "materials"].forEach((tag) => tags.add(tag));
    }
    if (["02", "16", "17"].includes(prefix.slice(0, 2))) {
      ["forestry", "timber", "pulp_paper", "packaging"].forEach((tag) => tags.add(tag));
    }
    if (["01", "10", "20"].includes(prefix.slice(0, 2))) {
      ["agriculture", "food", "fertilizer"].forEach((tag) => tags.add(tag));
    }
    if (["03"].includes(prefix.slice(0, 2))) {
      ["aquaculture", "salmon", "seafood"].forEach((tag) => tags.add(tag));
    }
    if (["25", "28", "29"].includes(prefix.slice(0, 2))) {
      ["industrial", "robotics", "automation", "manufacturing"].forEach((tag) => tags.add(tag));
    }
    if (["30", "50", "52"].includes(prefix.slice(0, 2))) {
      ["shipping", "maritime", "logistics", "freight"].forEach((tag) => tags.add(tag));
    }
    if (["51"].includes(prefix.slice(0, 2))) {
      ["aviation", "airports", "aerospace"].forEach((tag) => tags.add(tag));
    }
    if (["21", "86"].includes(prefix.slice(0, 2))) {
      ["healthcare", "biotech", "pharma", "medtech"].forEach((tag) => tags.add(tag));
    }
    if (["41", "42", "43", "68"].includes(prefix.slice(0, 2))) {
      ["construction", "real_estate", "housing", "building_materials"].forEach((tag) => tags.add(tag));
    }
    if (["70"].includes(prefix.slice(0, 2))) {
      ["consulting", "professional_services"].forEach((tag) => tags.add(tag));
    }
    if (["85"].includes(prefix.slice(0, 2))) {
      ["education"].forEach((tag) => tags.add(tag));
    }
    if (["93"].includes(prefix.slice(0, 2))) {
      ["sports", "leisure"].forEach((tag) => tags.add(tag));
    }
    if (["96"].includes(prefix.slice(0, 2))) {
      ["personal_services", "consumer_services"].forEach((tag) => tags.add(tag));
    }
    if (["38"].includes(prefix.slice(0, 2))) {
      ["recycling", "circular_economy", "materials"].forEach((tag) => tags.add(tag));
    }
    if (["64"].includes(prefix.slice(0, 2))) {
      ["banking", "capital_markets", "finance"].forEach((tag) => tags.add(tag));
    }
    if (["65"].includes(prefix.slice(0, 2))) {
      ["insurance", "finance"].forEach((tag) => tags.add(tag));
    }
    if (["66"].includes(prefix.slice(0, 2))) {
      ["capital_markets", "finance"].forEach((tag) => tags.add(tag));
    }
  }

  return unique([...tags]);
}

function sectorTagsFromCompanyName(name: string, industryCode: string | null) {
  if (industryCode && industryCode !== "00.000") return [] as string[];
  const normalized = normalizeToken(name);
  const tags = new Set<string>();

  if (normalized.includes("ai")) ["ai", "software", "technology"].forEach((tag) => tags.add(tag));
  if (normalized.includes("quantum")) ["ai", "technology"].forEach((tag) => tags.add(tag));
  if (normalized.includes("marine") || normalized.includes("shipping")) ["shipping", "maritime"].forEach((tag) => tags.add(tag));
  if (normalized.includes("energy") || normalized.includes("oil") || normalized.includes("gas")) ["energy", "oil_gas"].forEach((tag) => tags.add(tag));
  if (normalized.includes("salmon") || normalized.includes("fish")) ["aquaculture", "seafood", "salmon"].forEach((tag) => tags.add(tag));
  if (normalized.includes("bank")) ["banking", "finance"].forEach((tag) => tags.add(tag));
  if (normalized.includes("insurance")) ["insurance", "finance"].forEach((tag) => tags.add(tag));
  if (normalized.includes("health") || normalized.includes("bio") || normalized.includes("med")) ["healthcare", "biotech"].forEach((tag) => tags.add(tag));
  if (normalized.includes("robot")) ["robotics", "automation"].forEach((tag) => tags.add(tag));
  if (normalized.includes("space")) ["space", "aerospace"].forEach((tag) => tags.add(tag));

  return unique([...tags]);
}

function extractSourceSectorTags(source: SourceLike | null | undefined) {
  const metadata = asObject(source?.metadata);
  return unique(stringArray(metadata.sectorTags));
}

function extractSourceTier(source: SourceLike | null | undefined) {
  const tier = asObject(source?.metadata).tier;
  return typeof tier === "string" ? tier : null;
}

function keywordCount(text: string, keywords: string[]) {
  return keywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0);
}

function computeSourceTopicScore(input: {
  sourceId: string;
  title?: string | null;
  summary?: string | null;
}) {
  const text = normalizeToken([input.title ?? "", input.summary ?? ""].join(" "));

  if (!text) return 0.3;

  if (input.sourceId === "google-news-ai-software") {
    const strong = keywordCount(text, [
      "artificial_intelligence",
      "openai",
      "nvidia",
      "intel",
      "amd",
      "tsmc",
      "semiconductor",
      "chipmaker",
      "gpu",
      "cpu",
      "datacenter",
      "software",
      "cloud",
      "llm",
      "model",
      "oracle",
      "ai",
    ]);
    const weak = keywordCount(text, ["chip", "chips", "technology", "tech"]);
    const noisy = keywordCount(text, ["doritos", "pickles", "fantasypros", "trade_chips", "baseball", "hot_sauce", "tortilla"]);
    if (strong >= 2) return 0.95;
    if (strong >= 1) return 0.82;
    if (weak >= 1 && noisy === 0) return 0.42;
    return noisy > 0 ? 0.08 : 0.16;
  }

  if (input.sourceId === "google-news-upstream") {
    const hits = keywordCount(text, [
      "offshore",
      "north_sea",
      "drilling",
      "rig",
      "field",
      "discovery",
      "well",
      "equinor",
      "shell",
      "bp",
      "exxon",
      "chevron",
      "orsted",
    ]);
    return hits >= 2 ? 0.92 : hits === 1 ? 0.72 : 0.16;
  }

  if (input.sourceId === "google-news-us-shale") {
    const hits = keywordCount(text, ["permian", "shale", "bakken", "eagle_ford", "royalty", "oil", "gas", "basin"]);
    return hits >= 2 ? 0.92 : hits === 1 ? 0.7 : 0.14;
  }

  if (input.sourceId === "marinelink") {
    const hits = keywordCount(text, ["vessel", "ship", "shipping", "container", "port", "tanker", "bulk", "maiden_call"]);
    return hits >= 2 ? 0.9 : hits === 1 ? 0.68 : 0.2;
  }

  if (input.sourceId === "scmp-business") {
    const hits = keywordCount(text, ["china", "ai", "technology", "semiconductor", "policy", "economy", "industry", "quantum"]);
    return hits >= 2 ? 0.86 : hits === 1 ? 0.62 : 0.2;
  }

  return 0.72;
}

function computeSectorFitScore(params: {
  companySectorTags: string[];
  sourceSectorTags: string[];
  classification: EventClassification;
  isPetroleumCompany: boolean;
}) {
  const companyTags = new Set(params.companySectorTags);
  const sourceTags = new Set(params.sourceSectorTags);
  const overlap = [...sourceTags].filter((tag) => companyTags.has(tag));

  let score = 0.14;
  if (overlap.length > 0) {
    score = Math.min(1, 0.48 + (overlap.length - 1) * 0.12);
  } else if (sourceTags.size === 0) {
    score = 0.24;
  } else if (hasAnyTag(sourceTags, ["macro", "statistics"])) {
    score = params.companySectorTags.length > 0 ? 0.34 : 0.24;
  }

  if (
    params.isPetroleumCompany &&
    hasAnyTag(sourceTags, ["energy", "oil_gas", "offshore", "shipping", "freight", "maritime", "power", "renewables"])
  ) {
    score = Math.max(score, 0.72);
  }

  if (["interest_rate", "interest_rate_exposure", "commodity_price_exposure", "macro_news", "regulatory_change"].includes(params.classification.eventType)) {
    score = Math.max(score, params.companySectorTags.length > 0 ? 0.4 : 0.26);
  }

  const sourceSectorMismatch =
    sourceTags.size > 0 &&
    params.companySectorTags.length > 0 &&
    overlap.length === 0 &&
    !(hasAnyTag(sourceTags, ["macro", "statistics"]) &&
      ["interest_rate", "interest_rate_exposure", "commodity_price_exposure", "macro_news", "regulatory_change"].includes(
        params.classification.eventType,
      ));

  return {
    sectorFitScore: clamp01(score),
    sourceSectorMismatch,
  };
}

export async function buildCompanyEventUserRelevanceContext(companyId: string): Promise<CompanyEventUserRelevanceContext | null> {
  if (!contextCache.has(companyId)) {
    contextCache.set(
      companyId,
      (async () => {
        const [company, activeWatchCount] = await Promise.all([
          prisma.company.findUnique({
            where: { id: companyId },
            select: {
              id: true,
              name: true,
              orgNumber: true,
              industryCode: {
                select: {
                  code: true,
                },
              },
              petroleumExposureSnapshot: {
                select: {
                  id: true,
                },
              },
            },
          }),
          prisma.workspaceWatch.count({
            where: {
              companyId,
              status: "ACTIVE",
            },
          }),
        ]);

        if (!company) return null;

        const industryCode = company.industryCode?.code ?? null;
        const sectorTags = unique([
          ...sectorTagsFromIndustry(industryCode),
          ...sectorTagsFromCompanyName(company.name, industryCode),
        ]);

        return {
          companyId: company.id,
          companyName: company.name,
          orgNumber: company.orgNumber ?? null,
          industryCode,
          industryPrefixes: getIndustryPrefixes(industryCode),
          sectorTags,
          isPetroleumCompany: Boolean(company.petroleumExposureSnapshot),
          activeWatchCount,
        };
      })(),
    );
  }

  return contextCache.get(companyId) ?? null;
}

export function clearCompanyEventUserRelevanceContextCache() {
  contextCache.clear();
}

export function computeCompanyEventUserRelevance(input: {
  context: CompanyEventUserRelevanceContext | null;
  source: SourceLike | null | undefined;
  classification: EventClassification;
  title?: string | null;
  summary?: string | null;
}) : CompanyEventUserRelevance {
  const companySectorTags = input.context?.sectorTags ?? [];
  const sourceSectorTags = extractSourceSectorTags(input.source);
  const sourceTier = extractSourceTier(input.source);
  const watchlistIntensity = clamp01((input.context?.activeWatchCount ?? 0) / 5);
  const sourceTopicScore = computeSourceTopicScore({
    sourceId: input.source?.id ?? "",
    title: input.title,
    summary: input.summary,
  });
  const sectorFit = computeSectorFitScore({
    companySectorTags,
    sourceSectorTags,
    classification: input.classification,
    isPetroleumCompany: input.context?.isPetroleumCompany ?? false,
  });

  const eventBase = EVENT_BASE_RELEVANCE[input.classification.eventType] ?? 0.08;
  let score = eventBase + sectorFit.sectorFitScore * 0.5 + watchlistIntensity * 0.14 + sourceTopicScore * 0.16;

  if (hasAnyTag(sourceSectorTags, ["macro", "statistics"])) {
    score += 0.05;
  }

  if ((input.context?.isPetroleumCompany ?? false) && hasAnyTag(sourceSectorTags, ["energy", "oil_gas", "offshore"])) {
    score += 0.08;
  }

  if ((input.source?.sourceType ?? "") === "search_rss" && sourceTopicScore < 0.25) {
    score = Math.min(score, 0.12);
  }

  if (sectorFit.sourceSectorMismatch) {
    score = Math.min(score, eventBase * 0.25 + 0.08);
  }

  const coreNameTokens = input.context ? companyCoreNameTokens(input.context.companyName) : [];
  const hasAmbiguousCoreName =
    coreNameTokens.length > 0 && coreNameTokens.every((token) => AMBIGUOUS_COMPANY_NAME_TOKENS.has(token));
  if (((input.source?.sourceType ?? "") === "search_rss" || sourceTier === "industry") && hasAmbiguousCoreName) {
    score = Math.min(score, 0.12);
  }

  return {
    userRelevanceScore: clamp01(score),
    sectorFitScore: sectorFit.sectorFitScore,
    watchlistIntensity,
    sourceTopicScore,
    sourceSectorMismatch: sectorFit.sourceSectorMismatch,
    sourceSectorTags,
    companySectorTags,
  };
}
