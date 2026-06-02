import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type UpsertNewsSourceInput = {
  id: string;
  name: string;
  sourceType: string;
  baseUrl?: string | null;
  rssUrl?: string | null;
  apiUrl?: string | null;
  language?: string | null;
  country?: string | null;
  qualityScore?: number;
  status?: string;
  metadata?: Prisma.InputJsonValue | null;
};

export type UpsertSourceDocumentInput = {
  id?: string;
  sourceId: string;
  externalId?: string | null;
  canonicalUrl: string;
  originalUrl?: string | null;
  title: string;
  summary?: string | null;
  bodyText?: string | null;
  language?: string | null;
  publishedAt?: Date | null;
  fetchedAt?: Date;
  normalizedAt?: Date;
  contentHash?: string | null;
  documentFingerprint?: string | null;
  sourcePayload?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue | null;
};

export type CreateNewsSignalInput = {
  documentId: string;
  companyId?: string | null;
  signalType: string;
  subtype?: string | null;
  strength?: number;
  confidence?: number;
  valueScore?: number;
  direction?: string | null;
  horizon?: string | null;
  keywords?: string[];
  evidence?: Prisma.InputJsonValue | null;
  detectorVersion?: string;
};

export type UpsertCompanyEventInput = {
  companyId: string;
  eventFingerprint: string;
  eventType: string;
  title: string;
  summary?: string | null;
  eventDate?: Date | null;
  firstSeen?: Date;
  lastSeen?: Date;
  status?: string;
  investorValueScore?: number;
  confidenceScore?: number;
  noveltyScore?: number;
  severityScore?: number;
  engineVersion?: string;
  metadata?: Prisma.InputJsonValue | null;
};

export type AttachEventEvidenceInput = {
  eventId: string;
  documentId: string;
  evidenceType: string;
  relevanceScore?: number;
  confidenceScore?: number;
  excerpt?: string | null;
  reasons?: string[];
  featureSnapshot?: Prisma.InputJsonValue | null;
};

export type UpsertCompanyEventExposureInput = {
  eventId: string;
  companyId: string;
  exposureType: string;
  exposureScore?: number;
  confidenceScore?: number;
  rationale?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

export type CreateCompanyEventFeedbackInput = {
  eventId: string;
  userId: string;
  workspaceId?: string | null;
  label: "RELEVANT" | "NOT_RELEVANT" | "WEAK_RELEVANT";
  action?: string;
  previousValue?: Prisma.InputJsonValue | null;
  correctedValue?: Prisma.InputJsonValue | null;
  notes?: string | null;
  reviewedAt?: Date;
};

export type ListCompanyEventsOptions = {
  limit?: number;
  minInvestorValueScore?: number;
  eventType?: string;
  status?: string;
  includeEvidence?: boolean;
  includeExposures?: boolean;
};

export type ListSourceDocumentsForCompanyOptions = {
  limit?: number;
  sourceId?: string;
  since?: Date;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(limit: number | undefined) {
  if (!limit || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function stripUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
}

function nullableJson(value: Prisma.InputJsonValue | null | undefined) {
  return value === null ? Prisma.DbNull : value;
}

function toSourceDocumentCreateInput(input: UpsertSourceDocumentInput) {
  return stripUndefined({
    id: input.id,
    sourceId: input.sourceId,
    externalId: input.externalId,
    canonicalUrl: input.canonicalUrl,
    originalUrl: input.originalUrl,
    title: input.title,
    summary: input.summary,
    bodyText: input.bodyText,
    language: input.language,
    publishedAt: input.publishedAt,
    fetchedAt: input.fetchedAt,
    normalizedAt: input.normalizedAt,
    contentHash: input.contentHash,
    documentFingerprint: input.documentFingerprint,
    sourcePayload: nullableJson(input.sourcePayload),
    metadata: nullableJson(input.metadata),
  });
}

function toSourceDocumentUpdateInput(input: UpsertSourceDocumentInput) {
  const { id: _id, sourceId: _sourceId, externalId: _externalId, ...updateInput } =
    toSourceDocumentCreateInput(input);
  return updateInput;
}

export async function upsertNewsSource(input: UpsertNewsSourceInput) {
  const data = stripUndefined({
    name: input.name,
    sourceType: input.sourceType,
    baseUrl: input.baseUrl,
    rssUrl: input.rssUrl,
    apiUrl: input.apiUrl,
    language: input.language,
    country: input.country,
    qualityScore: input.qualityScore,
    status: input.status,
    metadata: nullableJson(input.metadata),
  });

  return prisma.newsSource.upsert({
    where: { id: input.id },
    update: data,
    create: {
      id: input.id,
      ...data,
    },
  });
}

export async function upsertSourceDocument(input: UpsertSourceDocumentInput) {
  const create = toSourceDocumentCreateInput(input);
  const update = toSourceDocumentUpdateInput(input);

  if (input.id) {
    return prisma.sourceDocument.update({
      where: { id: input.id },
      data: update,
    });
  }

  if (input.externalId) {
    return prisma.sourceDocument.upsert({
      where: {
        sourceId_externalId: {
          sourceId: input.sourceId,
          externalId: input.externalId,
        },
      },
      update,
      create,
    });
  }

  const existing = await prisma.sourceDocument.findFirst({
    where: {
      sourceId: input.sourceId,
      OR: [
        { canonicalUrl: input.canonicalUrl },
        ...(input.documentFingerprint ? [{ documentFingerprint: input.documentFingerprint }] : []),
        ...(input.contentHash ? [{ contentHash: input.contentHash }] : []),
      ],
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.sourceDocument.update({
      where: { id: existing.id },
      data: update,
    });
  }

  return prisma.sourceDocument.create({ data: create });
}

export async function createNewsSignal(input: CreateNewsSignalInput) {
  return prisma.newsSignal.create({
    data: stripUndefined({
      documentId: input.documentId,
      companyId: input.companyId,
      signalType: input.signalType,
      subtype: input.subtype,
      strength: input.strength,
      confidence: input.confidence,
      valueScore: input.valueScore,
      direction: input.direction,
      horizon: input.horizon,
      keywords: input.keywords,
      evidence: nullableJson(input.evidence),
      detectorVersion: input.detectorVersion,
    }),
  });
}

export async function upsertCompanyEvent(input: UpsertCompanyEventInput) {
  const mutableData = stripUndefined({
    eventType: input.eventType,
    title: input.title,
    summary: input.summary,
    eventDate: input.eventDate,
    firstSeen: input.firstSeen,
    lastSeen: input.lastSeen,
    status: input.status,
    investorValueScore: input.investorValueScore,
    confidenceScore: input.confidenceScore,
    noveltyScore: input.noveltyScore,
    severityScore: input.severityScore,
    engineVersion: input.engineVersion,
    metadata: nullableJson(input.metadata),
  });

  return prisma.companyEvent.upsert({
    where: {
      companyId_eventFingerprint: {
        companyId: input.companyId,
        eventFingerprint: input.eventFingerprint,
      },
    },
    update: mutableData,
    create: {
      companyId: input.companyId,
      eventFingerprint: input.eventFingerprint,
      ...mutableData,
    },
  });
}

export async function attachEventEvidence(input: AttachEventEvidenceInput) {
  const data = stripUndefined({
    evidenceType: input.evidenceType,
    relevanceScore: input.relevanceScore,
    confidenceScore: input.confidenceScore,
    excerpt: input.excerpt,
    reasons: input.reasons,
    featureSnapshot: nullableJson(input.featureSnapshot),
  });

  return prisma.companyEventEvidence.upsert({
    where: {
      eventId_documentId: {
        eventId: input.eventId,
        documentId: input.documentId,
      },
    },
    update: data,
    create: {
      eventId: input.eventId,
      documentId: input.documentId,
      ...data,
    },
  });
}

export async function upsertCompanyEventExposure(input: UpsertCompanyEventExposureInput) {
  const data = stripUndefined({
    exposureScore: input.exposureScore,
    confidenceScore: input.confidenceScore,
    rationale: input.rationale,
    metadata: nullableJson(input.metadata),
  });

  return prisma.companyEventExposure.upsert({
    where: {
      eventId_companyId_exposureType: {
        eventId: input.eventId,
        companyId: input.companyId,
        exposureType: input.exposureType,
      },
    },
    update: data,
    create: {
      eventId: input.eventId,
      companyId: input.companyId,
      exposureType: input.exposureType,
      ...data,
    },
  });
}

export async function createCompanyEventFeedback(input: CreateCompanyEventFeedbackInput) {
  return prisma.companyEventFeedback.create({
    data: stripUndefined({
      eventId: input.eventId,
      userId: input.userId,
      workspaceId: input.workspaceId,
      label: input.label,
      action: input.action,
      previousValue: nullableJson(input.previousValue),
      correctedValue: nullableJson(input.correctedValue),
      notes: input.notes,
      reviewedAt: input.reviewedAt,
    }),
  });
}

export async function listCompanyEvents(companyId: string, options: ListCompanyEventsOptions = {}) {
  return prisma.companyEvent.findMany({
    where: stripUndefined({
      companyId,
      eventType: options.eventType,
      status: options.status,
      investorValueScore:
        options.minInvestorValueScore === undefined ? undefined : { gte: options.minInvestorValueScore },
    }),
    include: {
      evidence: options.includeEvidence
        ? {
            include: {
              document: {
                include: { source: true },
              },
            },
            orderBy: { relevanceScore: "desc" },
          }
        : false,
      exposures: options.includeExposures
        ? {
            orderBy: { exposureScore: "desc" },
          }
        : false,
    },
    orderBy: [{ investorValueScore: "desc" }, { lastSeen: "desc" }],
    take: clampLimit(options.limit),
  });
}

export async function listCompanyEventEvidence(eventId: string) {
  return prisma.companyEventEvidence.findMany({
    where: { eventId },
    include: {
      document: {
        include: { source: true },
      },
    },
    orderBy: [{ relevanceScore: "desc" }, { createdAt: "desc" }],
  });
}

export async function listSourceDocumentsForCompany(
  companyId: string,
  options: ListSourceDocumentsForCompanyOptions = {},
) {
  return prisma.sourceDocument.findMany({
    where: stripUndefined({
      sourceId: options.sourceId,
      publishedAt: options.since ? { gte: options.since } : undefined,
      OR: [
        {
          signals: {
            some: { companyId },
          },
        },
        {
          eventEvidence: {
            some: {
              event: { companyId },
            },
          },
        },
      ],
    }),
    include: {
      source: true,
    },
    orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
    take: clampLimit(options.limit),
  });
}
