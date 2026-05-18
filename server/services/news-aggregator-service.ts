import { prisma } from "@/lib/prisma";
import {
  RSS_FEEDS,
  fetchAndParseRssFeed,
  type ParsedRssItem,
} from "@/integrations/news/rss-feed-provider";

type CompanyCandidate = { id: string; name: string; orgNumber: string };

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
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
  // Require at least 4 chars to avoid matching common 3-char words (e.g. "lie", "mad", "sel")
  if (needle.length < 4) return 0;
  const haystack = normalizeForMatch(articleText);
  // Whole-word match only — prevents "selg" matching "selger", "endre" matching "endring" etc.
  if (wordBoundaryMatch(needle, haystack)) return needle.length >= 8 ? 1.0 : 0.7;
  // Multi-word names: all words must be long enough to be distinctive (avoids "alle", "for", "en")
  const words = needle.split(" ").filter((w) => w.length >= 6);
  if (words.length >= 2 && words.every((w) => wordBoundaryMatch(w, haystack))) return 0.6;
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
  errors: string[];
};

export async function syncNewsFeeds(): Promise<NewsSyncResult> {
  const result: NewsSyncResult = {
    feedsProcessed: 0,
    articlesNew: 0,
    articlesDuplicate: 0,
    companyLinks: 0,
    errors: [],
  };

  // Load company candidates once
  const companies = await prisma.company.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, orgNumber: true },
    take: 5000,
  });

  for (const feed of RSS_FEEDS) {
    try {
      const items = await fetchAndParseRssFeed(feed);
      result.feedsProcessed++;

      for (const item of items) {
        // Dedup by guid
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
    } catch (err) {
      result.errors.push(`${feed.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
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
