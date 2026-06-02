import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { classifyCompanyEvent } from "@/server/news/company-event-classifier";
import { createCompanyEventFingerprint } from "@/server/news/company-event-fingerprinting";
import { createDirectCompanyEventExposure } from "@/server/news/company-event-read-across";
import {
  attachEventEvidence,
  upsertCompanyEvent,
  upsertNewsSource,
  upsertSourceDocument,
} from "@/server/news/company-event-repository";
import { buildScoreExplanation } from "@/server/news/company-event-score-explanation";
import { scoreCompanyEvent } from "@/server/news/company-event-scoring";

export type BackfillLegacyNewsOptions = {
  limit?: number;
  dryRun?: boolean;
};

export type BackfillLegacyNewsResult = {
  articlesScanned: number;
  sourceDocumentsUpserted: number;
  signalsCreated: number;
  signalsExisting: number;
  eventsUpserted: number;
  evidenceAttached: number;
  exposuresUpserted: number;
};

type LegacyArticle = Prisma.NewsArticleGetPayload<{
  include: {
    extraction: true;
    companies: {
      include: {
        company: true;
      };
    };
    relevanceScores: true;
  };
}>;

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sourceName(sourceId: string) {
  return sourceId
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function bodyText(article: LegacyArticle) {
  return article.extraction?.mainText ?? article.summary ?? article.category ?? null;
}

function summary(article: LegacyArticle) {
  return article.extraction?.lead ?? article.summary ?? article.category ?? null;
}

function legacySourceId(article: LegacyArticle) {
  return article.source || "legacy-news";
}

function emptyResult(): BackfillLegacyNewsResult {
  return {
    articlesScanned: 0,
    sourceDocumentsUpserted: 0,
    signalsCreated: 0,
    signalsExisting: 0,
    eventsUpserted: 0,
    evidenceAttached: 0,
    exposuresUpserted: 0,
  };
}

async function ensureLegacySignal(input: {
  documentId: string;
  companyId: string;
  matchScore: number;
  articleId: string;
  dryRun?: boolean;
}) {
  const existing = await prisma.newsSignal.findFirst({
    where: {
      documentId: input.documentId,
      companyId: input.companyId,
      signalType: "legacy_news_article_company",
      detectorVersion: "legacy-news-backfill-v1",
    },
    select: { id: true },
  });

  if (existing || input.dryRun) {
    return { created: false, id: existing?.id ?? "dry-run-signal" };
  }

  const signal = await prisma.newsSignal.create({
    data: {
      documentId: input.documentId,
      companyId: input.companyId,
      signalType: "legacy_news_article_company",
      subtype: "legacy_company_link",
      strength: Math.min(Math.max(input.matchScore, 0), 1),
      confidence: Math.min(Math.max(input.matchScore, 0), 1),
      valueScore: Math.min(Math.max(input.matchScore, 0), 1),
      keywords: [],
      evidence: {
        legacyNewsArticleId: input.articleId,
        matchScore: input.matchScore,
      },
      detectorVersion: "legacy-news-backfill-v1",
    },
  });

  return { created: true, id: signal.id };
}

export async function backfillLegacyNewsArticlesToCompanyEvents(
  options: BackfillLegacyNewsOptions = {},
): Promise<BackfillLegacyNewsResult> {
  const result = emptyResult();
  const limit = Math.min(Math.max(options.limit ?? 500, 1), 5000);
  const articles = await prisma.newsArticle.findMany({
    include: {
      extraction: true,
      companies: {
        include: {
          company: true,
        },
      },
      relevanceScores: true,
    },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });

  for (const article of articles) {
    result.articlesScanned += 1;
    if (article.companies.length === 0) {
      continue;
    }

    const sourceId = legacySourceId(article);
    if (!options.dryRun) {
      await upsertNewsSource({
        id: sourceId,
        name: sourceName(sourceId),
        sourceType: sourceId === "newsweb" ? "newsweb" : "legacy_news",
        language: article.extraction?.language ?? null,
        qualityScore: sourceId === "newsweb" ? 0.9 : 0.55,
        metadata: json({
          tier: sourceId === "newsweb" ? "primary" : "legacy",
          migratedFrom: "NewsArticle",
        }),
      });
    }

    const document = options.dryRun
      ? { id: `dry-run-document-${article.id}` }
      : await upsertSourceDocument({
          sourceId,
          externalId: article.guid,
          canonicalUrl: article.url,
          originalUrl: article.url,
          title: article.extraction?.title ?? article.title,
          summary: summary(article),
          bodyText: bodyText(article),
          language: article.extraction?.language ?? null,
          publishedAt: article.publishedAt,
          fetchedAt: article.createdAt,
          normalizedAt: article.createdAt,
          sourcePayload: json({
            legacyNewsArticleId: article.id,
            guid: article.guid,
            category: article.category,
          }),
          metadata: json({
            migratedFrom: "NewsArticle",
            migrationConfidence: "medium",
          }),
        });
    result.sourceDocumentsUpserted += 1;

    const classification = classifyCompanyEvent({
      title: article.title,
      summary: summary(article),
      bodyText: bodyText(article),
      source: {
        id: sourceId,
        sourceType: sourceId === "newsweb" ? "newsweb" : "legacy_news",
        qualityScore: sourceId === "newsweb" ? 0.9 : 0.55,
      },
      sourcePayload: {
        category: article.category,
      },
    });

    for (const link of article.companies) {
      const matchScore = Math.min(Math.max(link.matchScore, 0), 1);
      const signal = await ensureLegacySignal({
        documentId: document.id,
        companyId: link.companyId,
        matchScore,
        articleId: article.id,
        dryRun: options.dryRun,
      });
      if (signal.created) {
        result.signalsCreated += 1;
      } else {
        result.signalsExisting += 1;
      }

      const score = scoreCompanyEvent({
        companyId: link.companyId,
        eventDate: article.publishedAt,
        source: {
          id: sourceId,
          sourceType: sourceId === "newsweb" ? "newsweb" : "legacy_news",
          qualityScore: sourceId === "newsweb" ? 0.9 : 0.55,
        },
        classification,
        entityConfidence: matchScore,
        mentionContext: "legacy_company_link",
        evidenceCount: 1,
        duplicateCount: 1,
      });
      const scoreExplanation = buildScoreExplanation({
        eventType: classification.eventType,
        direction: classification.direction,
        confidenceLevel: classification.confidenceLevel,
        components: score,
        sourceId,
        sourceType: sourceId === "newsweb" ? "newsweb" : "legacy_news",
      });

      const eventFingerprint = createCompanyEventFingerprint({
        companyId: link.companyId,
        eventType: classification.eventType,
        title: article.title,
        eventDate: article.publishedAt,
        sourceSpecificId: article.guid,
      });

      if (options.dryRun) {
        result.eventsUpserted += 1;
        result.evidenceAttached += 1;
        result.exposuresUpserted += 1;
        continue;
      }

      const event = await upsertCompanyEvent({
        companyId: link.companyId,
        eventFingerprint,
        eventType: classification.eventType,
        title: article.title,
        summary: summary(article),
        eventDate: article.publishedAt,
        investorValueScore: Math.min(score.investorValueScore, 65),
        confidenceScore: Math.min(0.72, (matchScore + classification.eventTypeScore + score.evidenceStrengthScore) / 3),
        noveltyScore: score.noveltyScore,
        severityScore: Math.max(classification.riskImpactScore, classification.materialityScore),
        engineVersion: "company-event-v1",
        metadata: json({
          migratedFrom: "NewsArticle",
          legacyNewsArticleId: article.id,
          legacyMatchScore: link.matchScore,
          classification,
          scoreComponents: score,
          scoreExplanation,
        }),
      });
      result.eventsUpserted += 1;

      await attachEventEvidence({
        eventId: event.id,
        documentId: document.id,
        evidenceType: "legacy_news_article_company",
        relevanceScore: matchScore,
        confidenceScore: Math.min(0.72, matchScore),
        excerpt: summary(article),
        reasons: ["legacy_news_article_company", "medium_confidence_backfill"],
        featureSnapshot: json({
          signalId: signal.id,
          legacyNewsArticleId: article.id,
          legacyMatchScore: link.matchScore,
          classification,
          score,
        }),
      });
      result.evidenceAttached += 1;

      await createDirectCompanyEventExposure({
        eventId: event.id,
        companyId: link.companyId,
        exposureScore: Math.max(0.65, matchScore),
        confidenceScore: Math.min(0.72, matchScore),
        rationale: "Direkte legacy-eksponering fra tidligere NewsArticle-kobling.",
        metadata: {
          migratedFrom: "NewsArticle",
          legacyNewsArticleId: article.id,
          signalId: signal.id,
        },
      });
      result.exposuresUpserted += 1;
    }
  }

  return result;
}
