import {
  fetchNewswebCompanyMessages,
  fetchNewswebIssuerMessages,
  fetchNewswebLatestMessages,
  type NewswebArticle,
} from "@/integrations/news/newsweb-provider";
import { prisma } from "@/lib/prisma";
import type { NewsSourceDefinition } from "@/server/news/news-source-registry";
import { RssSourceAdapter } from "@/server/news/source-adapters/rss-source-adapter";
import type { NewsSourceAdapter, SourceCompanyScope, SourceFetchResult, SourceFetchScope } from "@/server/news/source-adapters/types";

type NewswebFetcher = (
  companyName: string,
  options?: { limit?: number; includeBody?: boolean },
) => Promise<NewswebArticle[]>;

type NewswebIssuerFetcher = (
  issuerId: number,
  options?: { limit?: number; includeBody?: boolean },
) => Promise<NewswebArticle[]>;

type NewswebLatestFetcher = (
  options?: { limit?: number; includeBody?: boolean },
) => Promise<NewswebArticle[]>;

const DEFAULT_COMPANY_SCOPE_LIMIT = 40;
const DEFAULT_MESSAGE_LIMIT = 12;
const DEFAULT_LATEST_MESSAGE_LIMIT = 50;
const DEFAULT_CONCURRENCY = 4;
const PROMINENT_COMPANY_MIN_EMPLOYEES = 250;
const PROMINENT_COMPANY_MIN_REVENUE = 100_000_000;

function toCompanyScopes(companies: Array<{ id: string; orgNumber: string; name: string }>): SourceCompanyScope[] {
  return companies.map((company) => ({
    companyId: company.id,
    orgNumber: company.orgNumber,
    name: company.name,
  }));
}

async function watchedCompanyScopes(limit: number): Promise<SourceCompanyScope[]> {
  const companies = await prisma.company.findMany({
    where: {
      orgNumber: { not: "" },
      workspaceWatches: {
        some: {
          status: "ACTIVE",
          watchAnnouncements: true,
        },
      },
    },
    select: {
      id: true,
      orgNumber: true,
      name: true,
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return toCompanyScopes(companies);
}

async function registeredIssuerScopes(
  limit: number,
  excludedCompanyIds: string[] = [],
): Promise<SourceCompanyScope[]> {
  const identities = await prisma.newsIssuerIdentity.findMany({
    where: {
      sourceSystem: "NEWSWEB",
      isActive: true,
      companyId: {
        not: null,
        ...(excludedCompanyIds.length > 0 ? { notIn: excludedCompanyIds } : {}),
      },
      company: {
        status: "ACTIVE",
      },
    },
    select: {
      sourceIssuerId: true,
      issuerSign: true,
      issuerName: true,
      company: {
        select: {
          id: true,
          orgNumber: true,
          name: true,
        },
      },
    },
    orderBy: [
      { lastMessagesFetchedAt: { sort: "asc", nulls: "first" } },
      { updatedAt: "asc" },
    ],
    take: limit,
  });

  return identities.flatMap((identity) =>
    identity.company
      ? [{
          companyId: identity.company.id,
          orgNumber: identity.company.orgNumber,
          name: identity.company.name,
          sourceIssuerId: identity.sourceIssuerId,
          issuerSign: identity.issuerSign,
          issuerName: identity.issuerName,
        }]
      : [],
  );
}

async function prominentCompanyScopes(limit: number): Promise<SourceCompanyScope[]> {
  const companies = await prisma.company.findMany({
    where: {
      status: "ACTIVE",
      orgNumber: { not: "" },
      OR: [
        { employeeCount: { gte: PROMINENT_COMPANY_MIN_EMPLOYEES } },
        { revenue: { gte: PROMINENT_COMPANY_MIN_REVENUE } },
        {
          companyEvents: {
            some: {
              status: "ACTIVE",
              investorValueScore: { gte: 35 },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      orgNumber: true,
      name: true,
    },
    orderBy: [{ revenue: "desc" }, { employeeCount: "desc" }, { updatedAt: "desc" }],
    take: limit,
  });

  return toCompanyScopes(companies);
}

async function defaultCompanyScopes(limit: number): Promise<SourceCompanyScope[]> {
  const watchedCompanies = await watchedCompanyScopes(limit);
  const registeredCompanies = await registeredIssuerScopes(
    Math.max(0, limit - watchedCompanies.length),
    watchedCompanies.map((company) => company.companyId),
  );
  if (watchedCompanies.length + registeredCompanies.length > 0) {
    return [...watchedCompanies, ...registeredCompanies].slice(0, limit);
  }
  return prominentCompanyScopes(limit);
}

function numericConfig(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function booleanConfig(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function boundedIntegerConfig(value: unknown, fallback: number, min: number, max: number) {
  const numeric = numericConfig(value, fallback);
  return Math.min(Math.max(Math.round(numeric), min), max);
}

async function forEachWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  });

  await Promise.all(workers);
}

export class NewswebSourceAdapter implements NewsSourceAdapter {
  sourceType = "newsweb";

  constructor(
    private readonly fetcher: NewswebFetcher = fetchNewswebCompanyMessages,
    private readonly rssFallback: NewsSourceAdapter = new RssSourceAdapter(),
    private readonly issuerFetcher: NewswebIssuerFetcher = fetchNewswebIssuerMessages,
    private readonly latestFetcher: NewswebLatestFetcher = fetchNewswebLatestMessages,
  ) {}

  async fetch(source: NewsSourceDefinition, scope: SourceFetchScope = {}): Promise<SourceFetchResult> {
    const fetchedAt = new Date();
    const explicitCompanyScopes = scope.companyScopes !== undefined;
    const companyScopeLimit = scope.limit ?? boundedIntegerConfig(
      source.fetchConfig?.newswebCompanyLimit,
      DEFAULT_COMPANY_SCOPE_LIMIT,
      1,
      200,
    );
    const companyScopes = scope.companyScopes ?? (await defaultCompanyScopes(companyScopeLimit));

    if (companyScopes.length === 0 && explicitCompanyScopes) {
      return { sourceId: source.id, documents: [], errors: [], fetchedAt };
    }

    const messageLimit = boundedIntegerConfig(source.fetchConfig?.newswebMessageLimit, DEFAULT_MESSAGE_LIMIT, 1, 50);
    const includeBody = booleanConfig(source.fetchConfig?.includeNewswebBody, false);
    const concurrency = boundedIntegerConfig(source.fetchConfig?.newswebConcurrency, DEFAULT_CONCURRENCY, 1, 8);
    const documentsByExternalId = new Map<string, SourceFetchResult["documents"][number]>();
    const errors: string[] = [];

    if (!explicitCompanyScopes) {
      try {
        const latestArticles = await this.latestFetcher({
          limit: DEFAULT_LATEST_MESSAGE_LIMIT,
          includeBody,
        });
        for (const article of latestArticles) {
          documentsByExternalId.set(article.guid, {
            sourceId: source.id,
            externalId: article.guid,
            url: article.url,
            canonicalUrl: article.url,
            title: article.title,
            summary: article.summary,
            language: source.language ?? "no",
            publishedAt: article.publishedAt,
            rawPayload: {
              ...article,
              category: article.category,
              categories: article.category ? [article.category] : [],
              issuerId: article.issuerId,
              issuerSign: article.issuerSign,
              issuerName: article.issuerName,
            },
          });
        }
      } catch (error) {
        errors.push(
          `NewsWeb latest feed failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    await forEachWithConcurrency(companyScopes, concurrency, async (company) => {
      try {
        const numericIssuerId = company.sourceIssuerId ? Number(company.sourceIssuerId) : null;
        const articles =
          numericIssuerId && Number.isInteger(numericIssuerId)
            ? await this.issuerFetcher(numericIssuerId, {
                limit: messageLimit,
                includeBody,
              })
            : await this.fetcher(company.name, {
                limit: messageLimit,
                includeBody,
              });

        for (const article of articles) {
          documentsByExternalId.set(article.guid, {
            sourceId: source.id,
            externalId: article.guid,
            url: article.url,
            canonicalUrl: article.url,
            title: article.title,
            summary: article.summary,
            language: source.language ?? "no",
            publishedAt: article.publishedAt,
            rawPayload: {
              ...article,
              category: article.category,
              categories: article.category ? [article.category] : [],
              companyId: company.companyId,
              orgNumber: company.orgNumber,
              companyName: company.name,
              issuerSign: article.issuerSign ?? company.issuerSign ?? null,
              issuerName: article.issuerName ?? company.issuerName ?? null,
            },
          });
        }

        if (company.sourceIssuerId) {
          await prisma.newsIssuerIdentity.updateMany({
            where: {
              sourceSystem: "NEWSWEB",
              sourceIssuerId: company.sourceIssuerId,
            },
            data: {
              lastMessagesFetchedAt: fetchedAt,
            },
          });
        }
      } catch (error) {
        errors.push(`NewsWeb failed for ${company.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    if (companyScopes.length === 0 && documentsByExternalId.size === 0) {
      const fallback = await this.rssFallback.fetch(source, scope);
      return {
        ...fallback,
        errors: [...errors, ...fallback.errors],
      };
    }

    return {
      sourceId: source.id,
      documents: [...documentsByExternalId.values()],
      errors,
      fetchedAt,
    };
  }
}
