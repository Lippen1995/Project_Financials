import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { classifyCompanyEvent } from "@/server/news/company-event-classifier";
import { clusterEventDocuments } from "@/server/news/company-event-clustering";
import { createCompanyEventFingerprint } from "@/server/news/company-event-fingerprinting";
import { createDirectCompanyEventExposure } from "@/server/news/company-event-read-across";
import { attachEventEvidence, upsertCompanyEvent } from "@/server/news/company-event-repository";
import { buildScoreExplanation } from "@/server/news/company-event-score-explanation";
import { scoreCompanyEvent } from "@/server/news/company-event-scoring";
import {
  buildCompanyEventUserRelevanceContext,
  computeCompanyEventUserRelevance,
} from "@/server/news/company-event-user-relevance";

export type ExtractCompanyEventsFromDocumentOptions = {
  minEntityConfidence?: number;
};

export type CompanyEventExtractionResult = {
  documentsProcessed: number;
  eventsUpserted: number;
  evidenceAttached: number;
};

type DocumentWithSignals = Prisma.SourceDocumentGetPayload<{
  include: {
    source: true;
    signals: true;
  };
}>;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function sourceSpecificId(document: DocumentWithSignals) {
  const payload = asObject(document.sourcePayload);
  const filingId = typeof payload.filingId === "string" ? payload.filingId : null;
  const announcementId = typeof payload.id === "string" ? payload.id : null;
  return document.externalId ?? filingId ?? announcementId ?? null;
}

function eventTitle(document: DocumentWithSignals) {
  return document.title;
}

function eventSummary(document: DocumentWithSignals) {
  return document.summary ?? document.bodyText?.slice(0, 280) ?? null;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function extractCompanyEventsFromDocument(
  document: DocumentWithSignals,
  options: ExtractCompanyEventsFromDocumentOptions = {},
) {
  const minEntityConfidence = options.minEntityConfidence ?? 0.55;
  const companySignals = document.signals.filter(
    (signal) =>
      signal.signalType === "company_mention" &&
      signal.companyId &&
      (signal.confidence ?? 0) >= minEntityConfidence,
  );
  const classification = classifyCompanyEvent({
    title: document.title,
    summary: document.summary,
    bodyText: document.bodyText,
    source: {
      id: document.source.id,
      sourceType: document.source.sourceType,
      qualityScore: document.source.qualityScore,
      metadata: document.source.metadata,
    },
    sourcePayload: document.sourcePayload,
  });

  let eventsUpserted = 0;
  let evidenceAttached = 0;

  for (const signal of companySignals) {
    const eventFingerprint = createCompanyEventFingerprint({
      companyId: signal.companyId!,
      eventType: classification.eventType,
      title: document.title,
      eventDate: document.publishedAt,
      sourceSpecificId: sourceSpecificId(document),
    });

    const entityConfidence = signal.confidence ?? 0;
    const userRelevanceContext = await buildCompanyEventUserRelevanceContext(signal.companyId!);
    const userRelevance = computeCompanyEventUserRelevance({
      context: userRelevanceContext,
      source: {
        id: document.source.id,
        sourceType: document.source.sourceType,
        metadata: document.source.metadata,
      },
      classification,
      title: document.title,
      summary: document.summary,
    });
    const cluster = clusterEventDocuments([
      {
        id: document.id,
        title: document.title,
        publishedAt: document.publishedAt,
        sourceId: document.sourceId,
        contentHash: document.contentHash,
        documentFingerprint: document.documentFingerprint,
      },
    ]);
    const score = scoreCompanyEvent({
      companyId: signal.companyId!,
      eventDate: document.publishedAt,
      source: {
        id: document.source.id,
        sourceType: document.source.sourceType,
        qualityScore: document.source.qualityScore,
        metadata: document.source.metadata,
      },
      classification,
      entityConfidence,
      mentionContext: signal.subtype,
      userRelevanceScore: userRelevance.userRelevanceScore,
      sourceSectorMismatch: userRelevance.sourceSectorMismatch,
      evidenceCount: 1,
      duplicateCount: cluster.duplicateCount,
    });
    const scoreExplanation = buildScoreExplanation({
      eventType: classification.eventType,
      direction: classification.direction,
      confidenceLevel: classification.confidenceLevel,
      components: score,
      sourceId: document.source.id,
      sourceType: document.source.sourceType,
    });

    const event = await upsertCompanyEvent({
      companyId: signal.companyId!,
      eventFingerprint,
      eventType: classification.eventType,
      title: eventTitle(document),
      summary: eventSummary(document),
      eventDate: document.publishedAt,
      investorValueScore: score.investorValueScore,
      confidenceScore: Math.min(1, (entityConfidence + classification.eventTypeScore + score.evidenceStrengthScore) / 3),
      noveltyScore: score.noveltyScore,
      severityScore: Math.max(classification.riskImpactScore, classification.materialityScore),
      engineVersion: "company-event-v1",
      metadata: json({
        direction: classification.direction,
        impactHorizon: classification.impactHorizon,
        confidenceLevel: classification.confidenceLevel,
        classification,
        scoreComponents: score,
        scoreExplanation,
        userRelevance,
        duplicateCluster: cluster,
      }),
    });
    eventsUpserted += 1;

    await attachEventEvidence({
      eventId: event.id,
      documentId: document.id,
      evidenceType: "company_mention",
      relevanceScore: entityConfidence,
      confidenceScore: Math.min(1, (entityConfidence + classification.eventTypeScore + score.evidenceStrengthScore) / 3),
      excerpt: signal.evidence ? JSON.stringify(signal.evidence).slice(0, 500) : document.summary,
      reasons: [classification.eventType, signal.subtype ?? "company_mention"],
      featureSnapshot: json({
        signalId: signal.id,
        classification,
        score,
        userRelevance,
      }),
    });
    evidenceAttached += 1;

    await createDirectCompanyEventExposure({
      eventId: event.id,
      companyId: signal.companyId!,
      exposureScore: Math.max(0.9, entityConfidence),
      confidenceScore: Math.min(1, (entityConfidence + classification.eventTypeScore + score.evidenceStrengthScore) / 3),
      metadata: {
        signalId: signal.id,
        documentId: document.id,
        sourceId: document.source.id,
        sourceType: document.source.sourceType,
      },
    });
  }

  return { eventsUpserted, evidenceAttached };
}

export async function extractCompanyEventsFromRecentDocuments(options: {
  limit?: number;
  minEntityConfidence?: number;
} = {}): Promise<CompanyEventExtractionResult> {
  const documents = await prisma.sourceDocument.findMany({
    include: {
      source: true,
      signals: true,
    },
    where: {
      signals: {
        some: {
          signalType: "company_mention",
        },
      },
    },
    orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
    take: options.limit ?? 100,
  });

  const result: CompanyEventExtractionResult = {
    documentsProcessed: 0,
    eventsUpserted: 0,
    evidenceAttached: 0,
  };

  for (const document of documents) {
    result.documentsProcessed += 1;
    const documentResult = await extractCompanyEventsFromDocument(document, {
      minEntityConfidence: options.minEntityConfidence,
    });
    result.eventsUpserted += documentResult.eventsUpserted;
    result.evidenceAttached += documentResult.evidenceAttached;
  }

  return result;
}
