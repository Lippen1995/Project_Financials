import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  RSS_FEEDS,
  fetchAndParseRssFeed,
  fetchGoogleNewsSearchFeed,
  type ParsedRssItem,
} from "@/integrations/news/rss-feed-provider";
import { extractNewsArticle } from "@/integrations/news/article-extraction-provider";
import { fetchNewswebCompanyMessages } from "@/integrations/news/newsweb-provider";
import env from "@/lib/env";
import {
  NEWS_ENGINE_VERSION,
  NEWS_FEATURE_VERSION,
  NEWS_RELEVANCE_THRESHOLD,
  NEWS_SCORE_VERSION,
  buildCompanyNewsContext,
  extractNewsFeatures,
  generateNewsCandidates,
  scoreNewsFeatures,
  type CompanyNewsContext,
} from "@/server/services/news-relevance-service";

type CompanyCandidate = { id: string; name: string; orgNumber: string };
const ON_DEMAND_NEWS_LOOKBACK_DAYS = 45;
const EXTERNAL_DISCOVERY_THRESHOLD = 0.16;
const NEWSWEB_DIRECT_SCORE = 0.99;
const NEWSWEB_LIST_SHARE = 0.25;
const MAX_EXTRACTED_TEXT_CHARS = 8_000;
const OIL_GAS_INDUSTRY_PREFIXES = new Set(["05", "06", "09", "19"]);
const ROUTINE_NEWSWEB_PATTERNS = [
  "ex date",
  "ex. utbytte",
  "ex. dividend",
  "meldepliktig handel",
  "notifiable trading",
  "managers transaction",
  "primærinnsidere",
  "primaerinnsidere",
  "voting rights",
  "stemmerettsendringer",
  "buy back",
  "buy-back",
  "tilbakekjop",
  "tilbakekjøp",
  "kjop av aksjer",
  "kjøp av aksjer",
  "share programme",
  "share programmes",
  "cash dividend",
  "kontantutbytte",
  "key information",
  "nokkellinformasjon",
  "nøkkelinformasjon",
  "annual general meeting",
  "ordinær generalforsamling",
  "ordinaer generalforsamling",
  "minutes",
  "protokoll",
  "innkalling",
  "notice of annual general meeting",
];
const HIGH_VALUE_NEWSWEB_PATTERNS = [
  "inside information",
  "innsideinformasjon",
  "annual report",
  "kvartalsrapport",
  "quarterly report",
  "contract",
  "kontrakt",
  "discovery",
  "funn",
  "field",
  "felt",
  "production",
  "produksjon",
  "acquisition",
  "oppkjop",
  "oppkjøp",
  "guidance",
  "strategy",
];
let cachedNewsEnginePersistenceAvailable: boolean | null = null;
let cachedNewsArticleExtractionSchemaAvailable: boolean | null = null;

export type NewsSyncResult = {
  feedsProcessed: number;
  articlesNew: number;
  articlesDuplicate: number;
  companyLinks: number;
  relevanceScored: number;
  candidatePairs: number;
  scoringRunId: string | null;
  errors: string[];
  newArticleIds: string[];
};

function isMissingNewsEngineSchemaError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2021" && error.code !== "P2022") {
    return false;
  }

  const table = typeof error.meta?.table === "string" ? error.meta.table : "";
  const column = typeof error.meta?.column === "string" ? error.meta.column : "";

  return (
    table.includes("NewsArticleFeatureSet") ||
    table.includes("NewsArticleExtraction") ||
    table.includes("NewsScoringRun") ||
    table.includes("NewsRelevanceFeedback") ||
    column.includes("NewsArticleRelevance.scoringRunId") ||
    column.includes("NewsArticleRelevance.candidateScore") ||
    column.includes("NewsArticleRelevance.confidenceScore") ||
    column.includes("NewsArticleRelevance.primaryType") ||
    column.includes("NewsArticleRelevance.reasons") ||
    column.includes("NewsArticleRelevance.evidence") ||
    column.includes("NewsArticleRelevance.engineVersion")
  );
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/\b(as|asa|ans|da|sa|ba|kf|sf|fkf|iks|stiftelse|konsern)\b/gi, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordBoundaryMatch(needle: string, haystack: string): boolean {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return false;
  const before = idx === 0 || !/\w/.test(haystack[idx - 1]);
  const after = idx + needle.length >= haystack.length || !/\w/.test(haystack[idx + needle.length]);
  return before && after;
}

function scoreMatch(companyName: string, articleText: string): number {
  const needle = normalizeForMatch(companyName);
  if (needle.length < 4) return 0;
  const haystack = normalizeForMatch(articleText);
  if (wordBoundaryMatch(needle, haystack)) return needle.length >= 8 ? 1.0 : 0.7;
  const words = needle.split(" ").filter((word) => word.length >= 6);
  if (words.length >= 2 && words.every((word) => wordBoundaryMatch(word, haystack))) return 0.6;
  return 0;
}

async function findMatchingCompanies(
  item: ParsedRssItem,
  candidates: CompanyCandidate[],
): Promise<{ companyId: string; matchScore: number }[]> {
  const articleText = `${item.title} ${item.summary ?? ""}`;
  return candidates
    .map((candidate) => ({ companyId: candidate.id, matchScore: scoreMatch(candidate.name, articleText) }))
    .filter((match) => match.matchScore >= 0.6);
}

function toArticleInput(article: {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  publishedAt: Date;
  source: string;
  category: string | null;
}) {
  return {
    id: article.id,
    title: article.title,
    summary: article.summary,
    url: article.url,
    publishedAt: article.publishedAt,
    source: article.source,
    category: article.category,
  };
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function mergeArticleText(summary: string | null, extraction: { lead: string | null; mainText: string | null } | null) {
  if (!extraction?.mainText && !extraction?.lead) {
    return summary;
  }

  return uniqueStrings([
    summary,
    extraction.lead,
    extraction.mainText?.slice(0, MAX_EXTRACTED_TEXT_CHARS),
  ]).join("\n\n");
}

function sortNewsByRelevanceAndFreshness<T extends { publishedAt: Date; relevance?: { totalScore?: number } | null }>(
  articles: T[],
) {
  return [...articles].sort((left, right) => {
    const scoreDelta = (right.relevance?.totalScore ?? 0) - (left.relevance?.totalScore ?? 0);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return right.publishedAt.getTime() - left.publishedAt.getTime();
  });
}

function normalizeNewsTitleForDedupe(article: { source: string; title: string }) {
  const title = article.source.startsWith("google-news-")
    ? article.title.replace(/\s[-–]\s[^-–]+$/u, "")
    : article.title;

  return normalizeForMatch(title)
    .replace(/\b(equinor|asa|bp|shell|exxonmobil|exxon|chevron|totalenergies|conocophillips)\b/g, " ")
    .replace(/\b(announces|announcement|melding|for|of|the|and|og|av|til)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeNewsItems<T extends { id: string; source: string; title: string; url: string; publishedAt: Date }>(articles: T[]) {
  const seen = new Set<string>();
  const seenTitles = new Set<string>();
  return articles.filter((article) => {
    const key = article.url || `${normalizeForMatch(article.title)}:${article.publishedAt.toISOString().slice(0, 10)}`;
    const titleKey = normalizeNewsTitleForDedupe(article);
    if (seen.has(key)) {
      return false;
    }

    const compactTitleKey = titleKey.replace(/\s+/g, "");
    const nearDuplicate = Array.from(seenTitles).some((seenTitle) => {
      if (titleKey.length < 16 || seenTitle.length < 16) return false;
      const shorter = titleKey.length < seenTitle.length ? titleKey : seenTitle;
      const longer = titleKey.length < seenTitle.length ? seenTitle : titleKey;
      return longer.includes(shorter) || compactTitleKey.includes(seenTitle.replace(/\s+/g, ""));
    });

    if (titleKey.length >= 16 && (seenTitles.has(titleKey) || nearDuplicate)) {
      return false;
    }

    seen.add(key);
    seenTitles.add(titleKey);
    return true;
  });
}

function diversifyNewsItems<T extends { source: string; publishedAt: Date; relevance?: { totalScore?: number } | null }>(
  articles: T[],
  limit: number,
) {
  const sorted = sortNewsByRelevanceAndFreshness(articles);
  const direct = sorted.filter((article) => article.source === "newsweb");
  const contextual = sorted.filter((article) => article.source !== "newsweb");

  if (direct.length === 0 || contextual.length === 0) {
    return sorted.slice(0, limit);
  }

  const blended: T[] = [];
  let directIndex = 0;
  let contextualIndex = 0;

  while (blended.length < limit && (directIndex < direct.length || contextualIndex < contextual.length)) {
    for (let i = 0; i < 2 && directIndex < direct.length && blended.length < limit; i += 1) {
      blended.push(direct[directIndex]);
      directIndex += 1;
    }

    if (contextualIndex < contextual.length && blended.length < limit) {
      blended.push(contextual[contextualIndex]);
      contextualIndex += 1;
    }
  }

  return blended;
}

function getWebsiteHost(website: string | null | undefined) {
  if (!website) return null;

  const normalizedWebsite = website.startsWith("http://") || website.startsWith("https://")
    ? website
    : `https://${website}`;

  try {
    const host = new URL(normalizedWebsite).hostname.replace(/^www\./i, "").trim();
    return host || null;
  } catch {
    return null;
  }
}

function extractBrandSupportTerms(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object") {
    return ["bedrift", "bedrifter", "forvalt", "kreditt", "naeringsliv", "selskaper"];
  }

  const payload = rawPayload as Record<string, unknown>;
  const values = [
    ...(Array.isArray(payload.aktivitet) ? payload.aktivitet.map((value) => String(value)) : []),
    ...(Array.isArray(payload.vedtektsfestetFormaal) ? payload.vedtektsfestetFormaal.map((value) => String(value)) : []),
  ];

  const normalizedTokens = values
    .flatMap((value) => normalizeForMatch(value).split(" "))
    .filter((token) => token.length >= 4);

  return uniqueStrings([
    ...normalizedTokens,
    "bedrift",
    "bedrifter",
    "forvalt",
    "kreditt",
    "leverandor",
    "leverandorer",
    "naeringsliv",
    "selskaper",
  ]).slice(0, 20);
}

function isExternalDiscoveryMatch(
  article: ParsedRssItem,
  context: CompanyNewsContext,
  companyName: string,
  websiteHost: string | null,
  supportTerms: string[],
) {
  const haystack = normalizeForMatch(`${article.title} ${article.summary ?? ""} ${article.url}`);
  const normalizedName = normalizeForMatch(companyName);
  const normalizedHost = websiteHost ? normalizeForMatch(websiteHost) : null;
  const normalizedWebsiteAliases = context.websiteAliases.map((alias) => normalizeForMatch(alias));
  const normalizedAliases = context.aliases.map((alias) => normalizeForMatch(alias));

  if (normalizedName && wordBoundaryMatch(normalizedName, haystack)) {
    return true;
  }

  if (
    normalizedHost &&
    (haystack.includes(normalizedHost) || normalizedWebsiteAliases.some((alias) => alias && haystack.includes(alias)))
  ) {
    return true;
  }

  const shortAliasHit = normalizedAliases.some((alias) => alias.length >= 4 && wordBoundaryMatch(alias, haystack));
  const supportHit = supportTerms.some((term) => term.length >= 4 && wordBoundaryMatch(term, haystack));
  const oilGasHit = isOilGasContext(context) && hasOilGasStrategicSignal(haystack);

  return (shortAliasHit && supportHit) || oilGasHit;
}

function isOilGasContext(context: CompanyNewsContext) {
  return context.industryPrefixes.some((prefix) => OIL_GAS_INDUSTRY_PREFIXES.has(prefix));
}

function hasOilGasStrategicSignal(text: string) {
  return [
    "bp",
    "shell",
    "exxon",
    "exxonmobil",
    "chevron",
    "totalenergies",
    "conocophillips",
    "us shale",
    "shale",
    "permian",
    "eia",
    "iea",
    "upstream",
    "opec",
    "brent",
    "lng",
    "natural gas",
    "crude oil",
    "offshore",
  ].some((term) => wordBoundaryMatch(term, text));
}

function isLowValueMarketDisclosureTitle(title: string, category: string | null = null) {
  const text = normalizeForMatch(`${title} ${category ?? ""}`);
  const highValue = HIGH_VALUE_NEWSWEB_PATTERNS.some((pattern) => text.includes(normalizeForMatch(pattern)));
  if (highValue) return false;
  return ROUTINE_NEWSWEB_PATTERNS.some((pattern) => text.includes(normalizeForMatch(pattern)));
}

async function getExternallyDiscoveredCompanyNews(companyId: string, limit: number, after?: Date) {
  const [company, context] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        website: true,
        rawPayload: true,
      },
    }),
    buildCompanyNewsContext(companyId),
  ]);

  if (!company || !context) {
    return [];
  }

  const websiteHost = getWebsiteHost(company.website);
  const supportTerms = uniqueStrings([
    ...context.brandSupportTokens,
    ...extractBrandSupportTerms(company.rawPayload),
  ]);

  const searchQueries = uniqueStrings([
    websiteHost ? `"${company.name}" OR "${websiteHost}"` : `"${company.name}"`,
    websiteHost ? `"${websiteHost}" AND (${supportTerms.slice(0, 6).join(" OR ")})` : null,
    ...(isOilGasContext(context)
      ? [
          `"${company.name}" OR BP OR Shell OR ExxonMobil OR Chevron OR TotalEnergies oil gas`,
          `"US shale" OR Permian OR "EIA" OR "IEA" oil gas`,
          `"Norwegian offshore" OR "North Sea" OR "Sokkeldirektoratet" petroleum`,
          `site:upstreamonline.com Equinor OR Shell OR BP OR Chevron OR ExxonMobil`,
        ]
      : []),
  ]);

  const queryResults = await Promise.allSettled(
    searchQueries.map((query, index) =>
      fetchGoogleNewsSearchFeed(query, {
        feedId: isOilGasContext(context) && index >= 2
          ? `google-news-oil-gas-${companyId}-${index + 1}`
          : `google-news-company-${companyId}-${index + 1}`,
        language: index >= 2 ? "en" : "no",
        geography: index >= 2 ? "US" : "NO",
        edition: index >= 2 ? "US:en" : "NO:no",
      }),
    ),
  );

  const articles = Array.from(
    new Map(
      queryResults.flatMap((result) =>
        result.status === "fulfilled" ? result.value.map((article) => [article.guid, article] as const) : [],
      ),
    ).values(),
  );

  const filteredArticles = articles.filter((article) =>
    isExternalDiscoveryMatch(article, context, company.name, websiteHost, supportTerms),
  );

  const publishedAfter = after ?? new Date(Date.now() - ON_DEMAND_NEWS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const scoredArticles = filteredArticles.flatMap((article) => {
    if (article.publishedAt <= publishedAfter) {
      return [];
    }

    if (article.source.startsWith("google-news-") && isLowValueMarketDisclosureTitle(article.title)) {
      return [];
    }

    const articleInput = {
      id: article.guid,
      title: article.title,
      summary: article.summary,
      url: article.url,
      publishedAt: article.publishedAt,
      source: article.source,
      category: null,
    };

    const candidate = generateNewsCandidates(articleInput, [context]).find((item) => item.companyId === companyId);
    if (!candidate) {
      return [];
    }

    const featureSet = extractNewsFeatures(articleInput, context, candidate);
    const score = scoreNewsFeatures(article.guid, companyId, featureSet);
    if (score.totalScore < EXTERNAL_DISCOVERY_THRESHOLD) {
      return [];
    }

    return [
      {
        id: article.guid,
        title: article.title,
        summary: article.summary,
        url: article.url,
        publishedAt: article.publishedAt,
        source: article.source,
        category: null,
        relevance: {
          totalScore: score.totalScore,
          candidateScore: score.candidateScore,
          confidence: score.confidenceScore,
          primaryType: score.primaryType,
          type: score.primaryType,
          tags: score.tags,
          reasons: score.reasons,
          reasoning: score.reasoning,
          scoredBy: `${score.scoredBy}-external-search`,
        },
      },
    ];
  });

  return scoredArticles
    .sort((left, right) => {
      if ((right.relevance?.totalScore ?? 0) !== (left.relevance?.totalScore ?? 0)) {
        return (right.relevance?.totalScore ?? 0) - (left.relevance?.totalScore ?? 0);
      }

      return right.publishedAt.getTime() - left.publishedAt.getTime();
    })
    .slice(0, limit);
}

async function getNewswebCompanyNews(companyId: string, limit: number, after?: Date) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });

  if (!company) {
    return [];
  }

  let articles;
  try {
    articles = await fetchNewswebCompanyMessages(company.name, {
      limit,
      includeBody: false,
    });
  } catch {
    return [];
  }

  return articles
    .filter((article) => !after || article.publishedAt > after)
    .map((article) => {
      const valueScore = scoreNewswebDisclosureValue(article.title, article.category);
      return {
        id: article.guid,
        title: article.title,
        summary: article.summary,
        url: article.url,
        publishedAt: article.publishedAt,
        source: article.source,
        category: article.category,
        relevance: {
          totalScore: valueScore,
          candidateScore: NEWSWEB_DIRECT_SCORE,
          confidence: valueScore >= 0.75 ? 0.98 : 0.78,
          primaryType: "direct",
          type: "direct",
          tags: uniqueStrings(["Borsmelding", article.category, article.issuerSign]),
          reasons: uniqueStrings([
            valueScore < 0.65 ? "Rutinemelding fra NewsWeb" : "Direkte NewsWeb-melding",
            article.issuerSign ? `Ticker: ${article.issuerSign}` : null,
            article.category,
          ]).slice(0, 3),
          reasoning:
            valueScore < 0.65
              ? "Offisiell borsemelding, men vurdert som lavere verdi fordi den ligner en rutinemelding."
              : "Offisiell borsemelding publisert via NewsWeb for selskapets issuer.",
          scoredBy: "newsweb-direct-value-ranked",
        },
      };
    })
    .filter((article) => (article.relevance?.totalScore ?? 0) >= 0.48)
    .sort((left, right) => {
      const scoreDelta = (right.relevance?.totalScore ?? 0) - (left.relevance?.totalScore ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      return right.publishedAt.getTime() - left.publishedAt.getTime();
    })
    .slice(0, limit);
}

function scoreNewswebDisclosureValue(title: string, category: string | null) {
  const text = normalizeForMatch(`${title} ${category ?? ""}`);
  const highValue = HIGH_VALUE_NEWSWEB_PATTERNS.some((pattern) => text.includes(normalizeForMatch(pattern)));
  const routine = isLowValueMarketDisclosureTitle(title, category);

  if (highValue) return 0.92;
  if (routine) return 0.56;
  if (text.includes("dividend") || text.includes("utbytte")) return 0.68;
  return NEWSWEB_DIRECT_SCORE;
}

async function resolveScoringCompanyIds(newArticleIds: string[], topN: number) {
  const watchedCompanies = await prisma.company.findMany({
    where: {
      status: "ACTIVE",
      workspaceWatches: {
        some: {
          status: "ACTIVE",
        },
      },
    },
    orderBy: { workspaceWatches: { _count: "desc" } },
    select: { id: true },
    take: topN,
  });
  if (watchedCompanies.length > 0) {
    return watchedCompanies.map((company) => company.id);
  }

  const directlyMatchedCompanies = await prisma.newsArticleCompany.findMany({
    where: { newsArticleId: { in: newArticleIds } },
    distinct: ["companyId"],
    select: { companyId: true },
    take: topN,
  });
  if (directlyMatchedCompanies.length > 0) {
    return directlyMatchedCompanies.map((company) => company.companyId);
  }

  const recentCompanies = await prisma.company.findMany({
    where: { status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
    take: Math.min(topN, 100),
  });
  return recentCompanies.map((company) => company.id);
}

async function getOnDemandRelevantNews(companyId: string, limit: number, after?: Date) {
  const context = await buildCompanyNewsContext(companyId);
  if (!context) {
    return [];
  }

  const publishedAfter =
    after ??
    new Date(Date.now() - ON_DEMAND_NEWS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const recentArticles = await prisma.newsArticle.findMany({
    where: {
      publishedAt: { gt: publishedAfter },
    },
    orderBy: { publishedAt: "desc" },
    take: 1000,
  });

  const scoredArticles = recentArticles.flatMap((article) => {
    const articleInput = toArticleInput(article);
    const candidate = generateNewsCandidates(articleInput, [context]).find(
      (item) => item.companyId === companyId,
    );
    if (!candidate) {
      return [];
    }

    const featureSet = extractNewsFeatures(articleInput, context, candidate);
    const score = scoreNewsFeatures(article.id, companyId, featureSet);
    if (score.totalScore < NEWS_RELEVANCE_THRESHOLD) {
      return [];
    }

    return [
      {
        id: article.id,
        title: article.title,
        summary: article.summary,
        url: article.url,
        publishedAt: article.publishedAt,
        source: article.source,
        category: article.category,
        relevance: {
          totalScore: score.totalScore,
          candidateScore: score.candidateScore,
          confidence: score.confidenceScore,
          primaryType: score.primaryType,
          type: score.primaryType,
          tags: score.tags,
          reasons: score.reasons,
          reasoning: score.reasoning,
          scoredBy: `${score.scoredBy}-ondemand`,
        },
      },
    ];
  });

  return scoredArticles
    .sort((left, right) => {
      if ((right.relevance?.totalScore ?? 0) !== (left.relevance?.totalScore ?? 0)) {
        return (right.relevance?.totalScore ?? 0) - (left.relevance?.totalScore ?? 0);
      }

      return right.publishedAt.getTime() - left.publishedAt.getTime();
    })
    .slice(0, limit);
}

async function hasNewsEnginePersistenceSchema() {
  if (cachedNewsEnginePersistenceAvailable !== null) {
    return cachedNewsEnginePersistenceAvailable;
  }

  const requiredTables = [
    "NewsScoringRun",
    "NewsArticleFeatureSet",
    "NewsRelevanceFeedback",
  ];
  const requiredColumns = [
    "scoringRunId",
    "candidateScore",
    "confidenceScore",
    "primaryType",
    "reasons",
    "evidence",
    "engineVersion",
  ];

  const tableRows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (${Prisma.join(requiredTables)})
  `;

  const columnRows = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'NewsArticleRelevance'
      AND column_name IN (${Prisma.join(requiredColumns)})
  `;

  cachedNewsEnginePersistenceAvailable =
    tableRows.length === requiredTables.length && columnRows.length === requiredColumns.length;

  return cachedNewsEnginePersistenceAvailable;
}

async function hasNewsArticleExtractionSchema() {
  if (cachedNewsArticleExtractionSchemaAvailable !== null) {
    return cachedNewsArticleExtractionSchemaAvailable;
  }

  const tableRows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'NewsArticleExtraction'
  `;

  cachedNewsArticleExtractionSchemaAvailable = tableRows.length === 1;
  return cachedNewsArticleExtractionSchemaAvailable;
}

async function getPersistedArticleExtraction(article: {
  id: string;
  url: string;
  title: string;
}) {
  if (!(await hasNewsArticleExtractionSchema())) {
    return null;
  }

  try {
    const existing = await prisma.newsArticleExtraction.findUnique({
      where: { newsArticleId: article.id },
      select: {
        extractionStatus: true,
        lead: true,
        mainText: true,
        title: true,
        language: true,
        sourceDomain: true,
      },
    });

    if (existing?.extractionStatus === "SUCCESS") {
      return existing;
    }

    if (existing?.extractionStatus === "FAILED") {
      return null;
    }

    const extracted = await extractNewsArticle(article.url);
    if (!extracted?.mainText && !extracted?.lead) {
      return null;
    }

    const now = new Date();
    const saved = await prisma.newsArticleExtraction.upsert({
      where: { newsArticleId: article.id },
      update: {
        extractor: extracted.extractor,
        extractionStatus: "SUCCESS",
        title: extracted.title,
        lead: extracted.lead,
        mainText: extracted.mainText,
        language: extracted.language,
        authors: extracted.authors,
        imageUrl: extracted.imageUrl,
        sourceDomain: extracted.sourceDomain,
        publishedAt: extracted.publishedAt,
        errorCode: null,
        errorMessage: null,
        fetchedAt: now,
        normalizedAt: now,
        rawPayload: extracted as never,
      },
      create: {
        newsArticleId: article.id,
        extractor: extracted.extractor,
        extractionStatus: "SUCCESS",
        title: extracted.title,
        lead: extracted.lead,
        mainText: extracted.mainText,
        language: extracted.language,
        authors: extracted.authors,
        imageUrl: extracted.imageUrl,
        sourceDomain: extracted.sourceDomain,
        publishedAt: extracted.publishedAt,
        sourceSystem: "news-please",
        sourceEntityType: "newsArticle",
        sourceId: article.url,
        fetchedAt: now,
        normalizedAt: now,
        rawPayload: extracted as never,
      },
      select: {
        extractionStatus: true,
        lead: true,
        mainText: true,
        title: true,
        language: true,
        sourceDomain: true,
      },
    });

    return saved.extractionStatus === "SUCCESS" ? saved : null;
  } catch (error) {
    if (isMissingNewsEngineSchemaError(error)) {
      cachedNewsArticleExtractionSchemaAvailable = false;
      return null;
    }

    throw error;
  }
}

async function buildArticleInputForScoring(
  article: {
    id: string;
    title: string;
    summary: string | null;
    url: string;
    publishedAt: Date;
    source: string;
    category: string | null;
  },
  extractionBudget?: { remaining: number },
) {
  const baseInput = toArticleInput(article);
  if (!extractionBudget || extractionBudget.remaining <= 0) {
    return baseInput;
  }

  extractionBudget.remaining -= 1;
  const extraction = await getPersistedArticleExtraction(article);
  if (!extraction) {
    return baseInput;
  }

  return {
    ...baseInput,
    title: extraction.title ?? baseInput.title,
    summary: mergeArticleText(baseInput.summary, extraction),
  };
}

export async function syncNewsFeeds(): Promise<NewsSyncResult> {
  const result: NewsSyncResult = {
    feedsProcessed: 0,
    articlesNew: 0,
    articlesDuplicate: 0,
    companyLinks: 0,
    relevanceScored: 0,
    candidatePairs: 0,
    scoringRunId: null,
    errors: [],
    newArticleIds: [],
  };

  const companies = await prisma.company.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, orgNumber: true },
    take: 5000,
  });

  const feedResults = await Promise.allSettled(
    RSS_FEEDS.map((feed) => fetchAndParseRssFeed(feed).then((items) => ({ feed, items }))),
  );

  for (const settled of feedResults) {
    if (settled.status === "rejected") {
      result.errors.push(String(settled.reason));
      continue;
    }

    const { items } = settled.value;
    result.feedsProcessed++;

    for (const item of items) {
      const existing = await prisma.newsArticle.findUnique({
        where: { guid: item.guid },
        select: { id: true },
      });

      if (existing) {
        result.articlesDuplicate++;
        continue;
      }

      const article = await prisma.newsArticle.create({
        data: {
          guid: item.guid,
          title: item.title,
          summary: item.summary,
          url: item.url,
          publishedAt: item.publishedAt,
          source: item.source,
        },
        select: { id: true },
      });

      result.articlesNew++;
      result.newArticleIds.push(article.id);

      const matches = await findMatchingCompanies(item, companies);
      if (matches.length > 0) {
        await prisma.newsArticleCompany.createMany({
          data: matches.map((match) => ({
            newsArticleId: article.id,
            companyId: match.companyId,
            matchScore: match.matchScore,
          })),
          skipDuplicates: true,
        });
        result.companyLinks += matches.length;
      }
    }
  }

  return result;
}

export async function syncAndScoreNewsFeeds(
  triggerSource: "manual" | "scheduled" = "manual",
  topN = 200,
): Promise<NewsSyncResult> {
  const syncResult = await syncNewsFeeds();
  const scoringResult = await scoreNewArticlesForTopCompanies(syncResult.newArticleIds, topN, triggerSource);
  return {
    ...syncResult,
    relevanceScored: scoringResult.relevanceScored,
    candidatePairs: scoringResult.candidatePairs,
    scoringRunId: scoringResult.scoringRunId,
  };
}

export async function scoreNewArticlesForTopCompanies(
  newArticleIds: string[],
  topN = 200,
  triggerSource: "manual" | "scheduled" = "scheduled",
): Promise<{ relevanceScored: number; candidatePairs: number; scoringRunId: string | null }> {
  if (newArticleIds.length === 0) {
    return { relevanceScored: 0, candidatePairs: 0, scoringRunId: null };
  }

  const articles = await prisma.newsArticle.findMany({
    where: { id: { in: newArticleIds } },
    orderBy: { publishedAt: "desc" },
  });
  if (articles.length === 0) {
    return { relevanceScored: 0, candidatePairs: 0, scoringRunId: null };
  }

  const scoringCompanyIds = await resolveScoringCompanyIds(newArticleIds, topN);
  if (scoringCompanyIds.length === 0) {
    return { relevanceScored: 0, candidatePairs: 0, scoringRunId: null };
  }

  let scoringRun: { id: string } | null = null;
  let persistLearningArtifacts = await hasNewsEnginePersistenceSchema();
  if (persistLearningArtifacts) {
    try {
      scoringRun = await prisma.newsScoringRun.create({
        data: {
          triggerSource,
          engineVersion: NEWS_ENGINE_VERSION,
          featureVersion: NEWS_FEATURE_VERSION,
          scoreVersion: NEWS_SCORE_VERSION,
          articlesConsidered: articles.length,
        },
        select: { id: true },
      });
    } catch (error) {
      if (isMissingNewsEngineSchemaError(error)) {
        persistLearningArtifacts = false;
        scoringRun = null;
        cachedNewsEnginePersistenceAvailable = false;
      } else {
        throw error;
      }
    }
  }

  const contexts = (
    await buildContextsInBatches(
      scoringCompanyIds,
      8,
    )
  ).filter((context): context is CompanyNewsContext => Boolean(context));

  let candidatePairs = 0;
  let relevantPairs = 0;
  const extractionBudget = {
    remaining: Math.max(0, env.newsArticleExtractionMaxPerSync),
  };

  for (const article of articles) {
    const articleInput = await buildArticleInputForScoring(article, extractionBudget);
    const candidates = generateNewsCandidates(articleInput, contexts);

    candidatePairs += candidates.length;
    if (candidates.length === 0) {
      continue;
    }

    for (const candidate of candidates) {
      const context = contexts.find((item) => item.companyId === candidate.companyId);
      if (!context) continue;

      const featureSet = extractNewsFeatures(articleInput, context, candidate);

      const score = scoreNewsFeatures(article.id, context.companyId, featureSet);
      if (score.totalScore >= NEWS_RELEVANCE_THRESHOLD) {
        relevantPairs += 1;
      }

      if (persistLearningArtifacts && scoringRun) {
        try {
          await prisma.newsArticleFeatureSet.upsert({
            where: {
              newsArticleId_companyId: {
                newsArticleId: article.id,
                companyId: context.companyId,
              },
            },
            update: {
              scoringRunId: scoringRun.id,
              candidateReasons: featureSet.candidateReasons,
              candidateScore: featureSet.candidateScore,
              directMentionScore: featureSet.directMentionScore,
              aliasMentionScore: featureSet.aliasMentionScore,
              groupScore: featureSet.groupScore,
              peerScore: featureSet.peerScore,
              industryScore: featureSet.industryScore,
              macroScore: featureSet.macroScore,
              ipScore: featureSet.ipScore,
              sourceQualityScore: featureSet.sourceQualityScore,
              titleWeight: featureSet.titleWeight,
              summaryWeight: featureSet.summaryWeight,
              freshnessScore: featureSet.freshnessScore,
              ambiguityPenalty: featureSet.ambiguityPenalty,
              confidenceScore: featureSet.confidenceScore,
              evidence: featureSet.evidence as never,
              engineVersion: score.engineVersion,
              featureVersion: score.featureVersion,
              scoreVersion: score.scoreVersion,
            },
            create: {
              newsArticleId: article.id,
              companyId: context.companyId,
              scoringRunId: scoringRun.id,
              candidateReasons: featureSet.candidateReasons,
              candidateScore: featureSet.candidateScore,
              directMentionScore: featureSet.directMentionScore,
              aliasMentionScore: featureSet.aliasMentionScore,
              groupScore: featureSet.groupScore,
              peerScore: featureSet.peerScore,
              industryScore: featureSet.industryScore,
              macroScore: featureSet.macroScore,
              ipScore: featureSet.ipScore,
              sourceQualityScore: featureSet.sourceQualityScore,
              titleWeight: featureSet.titleWeight,
              summaryWeight: featureSet.summaryWeight,
              freshnessScore: featureSet.freshnessScore,
              ambiguityPenalty: featureSet.ambiguityPenalty,
              confidenceScore: featureSet.confidenceScore,
              evidence: featureSet.evidence as never,
              engineVersion: score.engineVersion,
              featureVersion: score.featureVersion,
              scoreVersion: score.scoreVersion,
            },
          });

          await prisma.newsArticleRelevance.upsert({
            where: {
              newsArticleId_companyId: {
                newsArticleId: article.id,
                companyId: context.companyId,
              },
            },
            update: {
              scoringRunId: scoringRun.id,
              totalScore: score.totalScore,
              candidateScore: score.candidateScore,
              confidenceScore: score.confidenceScore,
              directScore: score.directScore,
              sectorScore: score.sectorScore,
              macroScore: score.macroScore,
              competitorScore: score.competitorScore,
              primaryType: score.primaryType,
              reasons: score.reasons,
              evidence: score.evidence as never,
              engineVersion: score.engineVersion,
              featureVersion: score.featureVersion,
              scoreVersion: score.scoreVersion,
              reasoning: score.reasoning,
              tags: score.tags,
              scoredBy: score.scoredBy,
              scoredAt: new Date(),
            },
            create: {
              newsArticleId: article.id,
              companyId: context.companyId,
              scoringRunId: scoringRun.id,
              totalScore: score.totalScore,
              candidateScore: score.candidateScore,
              confidenceScore: score.confidenceScore,
              directScore: score.directScore,
              sectorScore: score.sectorScore,
              macroScore: score.macroScore,
              competitorScore: score.competitorScore,
              primaryType: score.primaryType,
              reasons: score.reasons,
              evidence: score.evidence as never,
              engineVersion: score.engineVersion,
              featureVersion: score.featureVersion,
              scoreVersion: score.scoreVersion,
              reasoning: score.reasoning,
              tags: score.tags,
              scoredBy: score.scoredBy,
            },
          });
        } catch (error) {
          if (isMissingNewsEngineSchemaError(error)) {
            persistLearningArtifacts = false;
            cachedNewsEnginePersistenceAvailable = false;
          } else {
            throw error;
          }
        }
      }

      try {
        await prisma.newsArticleCompany.upsert({
          where: {
            newsArticleId_companyId: {
              newsArticleId: article.id,
              companyId: context.companyId,
            },
          },
          update: {
            matchScore: Math.max(candidate.candidateScore, score.totalScore),
          },
          create: {
            newsArticleId: article.id,
            companyId: context.companyId,
            matchScore: Math.max(candidate.candidateScore, score.totalScore),
          },
        });
      } catch (error) {
        if (isMissingNewsEngineSchemaError(error)) {
          persistLearningArtifacts = false;
          cachedNewsEnginePersistenceAvailable = false;
        } else {
          throw error;
        }
      }
    }
  }

  if (persistLearningArtifacts && scoringRun) {
    try {
      await prisma.newsScoringRun.update({
        where: { id: scoringRun.id },
        data: {
          candidatePairs,
          scoredPairs: candidatePairs,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      if (isMissingNewsEngineSchemaError(error)) {
        persistLearningArtifacts = false;
        cachedNewsEnginePersistenceAvailable = false;
      } else {
        throw error;
      }
    }
  }

  return {
    relevanceScored: relevantPairs,
    candidatePairs,
    scoringRunId: persistLearningArtifacts ? scoringRun?.id ?? null : null,
  };
}

async function buildContextsInBatches(companyIds: string[], batchSize: number) {
  const contexts: Array<CompanyNewsContext | null> = [];
  for (let i = 0; i < companyIds.length; i += batchSize) {
    const batch = companyIds.slice(i, i + batchSize);
    const built = await Promise.all(batch.map((companyId) => buildCompanyNewsContext(companyId)));
    contexts.push(...built);
  }
  return contexts;
}

export async function getCompanyNews(companyId: string, limit = 20) {
  const links = await prisma.newsArticleCompany.findMany({
    where: { companyId },
    orderBy: { newsArticle: { publishedAt: "desc" } },
    take: limit,
    select: {
      matchScore: true,
      newsArticle: {
        select: {
          id: true,
          title: true,
          summary: true,
          url: true,
          publishedAt: true,
          source: true,
          category: true,
        },
      },
    },
  });

  return links.map((link) => ({ ...link.newsArticle, matchScore: link.matchScore }));
}

export async function getCompanyNewsWithRelevance(companyId: string, limit = 30, after?: Date) {
  const collectedArticles = [];
  const newswebLimit = Math.max(3, Math.min(8, Math.min(limit, Math.ceil(limit * NEWSWEB_LIST_SHARE))));

  if (await hasNewsEnginePersistenceSchema()) {
    try {
      const relevantArticles = await prisma.newsArticleRelevance.findMany({
        where: {
          companyId,
          totalScore: { gte: NEWS_RELEVANCE_THRESHOLD },
          ...(after && { newsArticle: { publishedAt: { gt: after } } }),
        },
        orderBy: [
          { totalScore: "desc" },
          { newsArticle: { publishedAt: "desc" } },
        ],
        take: limit,
        include: {
          newsArticle: {
            select: {
              id: true,
              title: true,
              summary: true,
              url: true,
              publishedAt: true,
              source: true,
              category: true,
            },
          },
        },
      });

      if (relevantArticles.length > 0) {
        collectedArticles.push(...relevantArticles.map((relevance) => ({
          ...relevance.newsArticle,
          relevance: {
            totalScore: relevance.totalScore,
            candidateScore: relevance.candidateScore,
            confidence: relevance.confidenceScore,
            primaryType: relevance.primaryType,
            type: relevance.primaryType,
            tags: relevance.tags,
            reasons: relevance.reasons,
            reasoning: relevance.reasoning,
            scoredBy: relevance.scoredBy,
          },
        })));
      }
    } catch (error) {
      if (!isMissingNewsEngineSchemaError(error)) {
        throw error;
      }

      cachedNewsEnginePersistenceAvailable = false;
    }
  }

  const newswebNews = await getNewswebCompanyNews(companyId, newswebLimit, after);
  collectedArticles.push(...newswebNews);

  const onDemandRelevantNews = await getOnDemandRelevantNews(companyId, limit, after);
  collectedArticles.push(...onDemandRelevantNews);

  const externallyDiscoveredNews = await getExternallyDiscoveredCompanyNews(companyId, limit, after);
  collectedArticles.push(...externallyDiscoveredNews);

  if (collectedArticles.length > 0) {
    return diversifyNewsItems(dedupeNewsItems(collectedArticles), limit);
  }

  const fallback = await getCompanyNews(companyId, limit);
  return fallback.map((article) => ({ ...article, relevance: null }));
}
