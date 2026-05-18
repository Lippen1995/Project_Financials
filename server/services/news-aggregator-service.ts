import { prisma } from "@/lib/prisma";
import {
  RSS_FEEDS,
  fetchAndParseRssFeed,
  type ParsedRssItem,
} from "@/integrations/news/rss-feed-provider";
import { scoreArticlesForCompany } from "@/server/services/news-relevance-service";

type CompanyCandidate = { id: string; name: string; orgNumber: string };

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b(as|asa|ans|da|sa|ba|kf|sf|fkf|iks|stiftelse|konsern)\b/gi, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreMatch(companyName: string, articleText: string): number {
  const needle = normalizeForMatch(companyName);
  if (needle.length < 3) return 0;
  const haystack = normalizeForMatch(articleText);
  if (haystack.includes(needle)) return needle.length >= 8 ? 1.0 : 0.7;
  const words = needle.split(" ").filter((w) => w.length >= 4);
  if (words.length >= 2 && words.every((w) => haystack.includes(w))) return 0.6;
  return 0;
}

async function findMatchingCompanies(
  item: ParsedRssItem,
  candidates: CompanyCandidate[],
): Promise<{ companyId: string; matchScore: number }[]> {
  const articleText = `${item.title} ${item.summary ?? ""}`;
  return candidates
    .map((c) => ({ companyId: c.id, matchScore: scoreMatch(c.name, articleText) }))
    .filter((m) => m.matchScore >= 0.6);
}

export type NewsSyncResult = {
  feedsProcessed: number;
  articlesNew: number;
  articlesDuplicate: number;
  companyLinks: number;
  relevanceScored: number;
  errors: string[];
  newArticleIds: string[];
};

export async function syncNewsFeeds(): Promise<NewsSyncResult> {
  const result: NewsSyncResult = {
    feedsProcessed: 0,
    articlesNew: 0,
    articlesDuplicate: 0,
    companyLinks: 0,
    relevanceScored: 0,
    errors: [],
    newArticleIds: [],
  };

  const companies = await prisma.company.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, orgNumber: true },
    take: 5000,
  });

  // Fetch all feeds in parallel
  const feedResults = await Promise.allSettled(
    RSS_FEEDS.map((feed) => fetchAndParseRssFeed(feed).then((items) => ({ feed, items }))),
  );

  for (const settled of feedResults) {
    if (settled.status === "rejected") {
      result.errors.push(String(settled.reason));
      continue;
    }
    const { feed, items } = settled.value;
    result.feedsProcessed++;

    for (const item of items) {
      const exists = await prisma.newsArticle.findUnique({
        where: { guid: item.guid },
        select: { id: true },
      });

      if (exists) {
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
          data: matches.map((m) => ({
            newsArticleId: article.id,
            companyId: m.companyId,
            matchScore: m.matchScore,
          })),
          skipDuplicates: true,
        });
        result.companyLinks += matches.length;
      }
    }

    void feed; // suppress unused warning
  }

  return result;
}

export async function scoreNewArticlesForTopCompanies(
  newArticleIds: string[],
  topN = 200,
): Promise<number> {
  if (newArticleIds.length === 0) return 0;

  const articles = await prisma.newsArticle.findMany({
    where: { id: { in: newArticleIds } },
  });

  const topCompanies = await prisma.company.findMany({
    where: { status: "ACTIVE" },
    orderBy: { workspaceWatches: { _count: "desc" } },
    take: topN,
    include: { industryCode: true },
  });

  let scored = 0;
  for (const company of topCompanies) {
    try {
      const scores = await scoreArticlesForCompany(articles, company);
      if (scores.length === 0) continue;

      await prisma.newsArticleRelevance.createMany({
        data: scores.map((s) => ({
          newsArticleId: s.newsArticleId,
          companyId: company.id,
          totalScore: s.totalScore,
          directScore: s.directScore,
          sectorScore: s.sectorScore,
          macroScore: s.macroScore,
          competitorScore: s.competitorScore,
          reasoning: s.reasoning,
          tags: s.tags,
          scoredBy: s.scoredBy,
        })),
        skipDuplicates: true,
      });
      scored += scores.length;
    } catch {
      // Non-fatal: skip this company
    }
  }

  return scored;
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
        },
      },
    },
  });

  return links.map((l) => ({ ...l.newsArticle, matchScore: l.matchScore }));
}

export async function getCompanyNewsWithRelevance(
  companyId: string,
  limit = 30,
  after?: Date,
) {
  const relevantArticles = await prisma.newsArticleRelevance.findMany({
    where: {
      companyId,
      totalScore: { gte: 0.35 },
      ...(after && { newsArticle: { publishedAt: { gt: after } } }),
    },
    orderBy: { newsArticle: { publishedAt: "desc" } },
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
    return relevantArticles.map((r) => ({
      ...r.newsArticle,
      relevance: {
        totalScore: r.totalScore,
        type: deriveRelevanceType(r),
        tags: r.tags,
        reasoning: r.reasoning,
        scoredBy: r.scoredBy,
      },
    }));
  }

  // Fallback to direct name-match for companies without relevance scores
  const fallback = await getCompanyNews(companyId, limit);
  return fallback.map((a) => ({ ...a, relevance: null }));
}

function deriveRelevanceType(r: {
  directScore: number;
  sectorScore: number;
  macroScore: number;
  competitorScore: number;
}): "direct" | "sector" | "macro" | "competitor" {
  const max = Math.max(r.directScore, r.sectorScore, r.macroScore, r.competitorScore);
  if (max === r.directScore) return "direct";
  if (max === r.sectorScore) return "sector";
  if (max === r.macroScore) return "macro";
  return "competitor";
}
