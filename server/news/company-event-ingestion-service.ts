import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getNewsSourceDefinition,
  listEnabledNewsSources,
  type NewsSourceDefinition,
} from "@/server/news/news-source-registry";
import {
  createContentHash,
  createTitleFingerprint,
  canonicalizeUrl,
  inferExternalId,
} from "@/server/news/source-document-normalization";
import { BrregAnnouncementSourceAdapter } from "@/server/news/source-adapters/brreg-announcement-source-adapter";
import { InternalCompanyStatusSourceAdapter } from "@/server/news/source-adapters/internal-company-status-source-adapter";
import { InternalFinancialsSourceAdapter } from "@/server/news/source-adapters/internal-financials-source-adapter";
import { RssSourceAdapter } from "@/server/news/source-adapters/rss-source-adapter";
import type { NewsSourceAdapter, ParsedSourceDocument, SourceFetchScope } from "@/server/news/source-adapters/types";
import { upsertNewsSource, upsertSourceDocument } from "@/server/news/company-event-repository";

export type CompanyEventIngestionMetrics = {
  sourcesProcessed: number;
  sourcesFailed: number;
  documentsFetched: number;
  documentsCreated: number;
  documentsUpdated: number;
  documentsDuplicate: number;
  errors: string[];
};

export type SyncNewsSourcesOptions = SourceFetchScope & {
  sourceIds?: string[];
};

const rssAdapter = new RssSourceAdapter();
const adapters: NewsSourceAdapter[] = [
  rssAdapter,
  new BrregAnnouncementSourceAdapter(),
  new InternalFinancialsSourceAdapter(),
  new InternalCompanyStatusSourceAdapter(),
];

function emptyMetrics(): CompanyEventIngestionMetrics {
  return {
    sourcesProcessed: 0,
    sourcesFailed: 0,
    documentsFetched: 0,
    documentsCreated: 0,
    documentsUpdated: 0,
    documentsDuplicate: 0,
    errors: [],
  };
}

function adapterForSource(source: NewsSourceDefinition) {
  if (source.type === "brreg") return adapters.find((adapter) => adapter.sourceType === "brreg") ?? null;
  if (source.type === "financials") return adapters.find((adapter) => adapter.sourceType === "financials") ?? null;
  if (source.type === "internal") return adapters.find((adapter) => adapter.sourceType === "internal") ?? null;

  return rssAdapter;
}

function safeCanonicalizeUrl(url: string) {
  try {
    return canonicalizeUrl(url);
  } catch {
    return url.trim();
  }
}

function safeJson(value: unknown): Prisma.InputJsonValue | null {
  if (value == null) return null;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function documentHash(document: ParsedSourceDocument) {
  return createContentHash([document.title, document.summary, document.bodyText].filter(Boolean).join("\n"));
}

async function findExistingDocumentCandidate(input: {
  sourceId: string;
  externalId: string | null;
  canonicalUrl: string;
  titleFingerprint: string;
  contentHash: string;
  publishedAt: Date | null | undefined;
}) {
  if (input.externalId) {
    const byExternalId = await prisma.sourceDocument.findUnique({
      where: {
        sourceId_externalId: {
          sourceId: input.sourceId,
          externalId: input.externalId,
        },
      },
      select: { id: true },
    });
    if (byExternalId) return { id: byExternalId.id, duplicateKind: "externalId" };
  }

  const byCanonicalUrl = await prisma.sourceDocument.findFirst({
    where: {
      sourceId: input.sourceId,
      canonicalUrl: input.canonicalUrl,
    },
    select: { id: true },
  });
  if (byCanonicalUrl) return { id: byCanonicalUrl.id, duplicateKind: "canonicalUrl" };

  const byContentHash = await prisma.sourceDocument.findFirst({
    where: {
      contentHash: input.contentHash,
    },
    select: { id: true },
  });
  if (byContentHash) return { id: byContentHash.id, duplicateKind: "contentHash" };

  if (input.publishedAt) {
    const start = new Date(input.publishedAt);
    start.setDate(start.getDate() - 1);
    const end = new Date(input.publishedAt);
    end.setDate(end.getDate() + 1);

    const byTitleWindow = await prisma.sourceDocument.findFirst({
      where: {
        documentFingerprint: input.titleFingerprint,
        publishedAt: {
          gte: start,
          lte: end,
        },
      },
      select: { id: true },
    });
    if (byTitleWindow) return { id: byTitleWindow.id, duplicateKind: "titleWindow" };
  }

  return null;
}

export async function upsertSourceDocuments(documents: ParsedSourceDocument[]) {
  const metrics = {
    fetched: documents.length,
    created: 0,
    updated: 0,
    duplicate: 0,
  };

  for (const document of documents) {
    const canonicalUrl = safeCanonicalizeUrl(document.canonicalUrl ?? document.url);
    const titleFingerprint = createTitleFingerprint(document.title);
    const contentHash = documentHash(document);
    const externalId = inferExternalId({
      sourceId: document.sourceId,
      externalId: document.externalId,
      url: canonicalUrl,
      title: document.title,
      publishedAt: document.publishedAt,
    });
    const existing = await findExistingDocumentCandidate({
      sourceId: document.sourceId,
      externalId,
      canonicalUrl,
      titleFingerprint,
      contentHash,
      publishedAt: document.publishedAt,
    });

    await upsertSourceDocument({
      id: existing?.id,
      sourceId: document.sourceId,
      externalId,
      canonicalUrl,
      originalUrl: document.url,
      title: document.title,
      summary: document.summary,
      bodyText: document.bodyText,
      language: document.language,
      publishedAt: document.publishedAt,
      contentHash,
      documentFingerprint: titleFingerprint,
      sourcePayload: safeJson(document.rawPayload),
      metadata: existing ? { duplicateKind: existing.duplicateKind } : null,
    });

    if (existing) {
      metrics.updated += 1;
      if (existing.duplicateKind !== "externalId" && existing.duplicateKind !== "canonicalUrl") {
        metrics.duplicate += 1;
      }
    } else {
      metrics.created += 1;
    }
  }

  return metrics;
}

export async function syncSource(sourceId: string, scope: SourceFetchScope = {}): Promise<CompanyEventIngestionMetrics> {
  const source = getNewsSourceDefinition(sourceId);
  if (!source || !source.enabled) {
    return {
      ...emptyMetrics(),
      sourcesFailed: 1,
      errors: [`Source ${sourceId} is not configured or not enabled.`],
    };
  }

  const adapter = adapterForSource(source);
  if (!adapter) {
    return {
      ...emptyMetrics(),
      sourcesFailed: 1,
      errors: [`No adapter configured for source type ${source.type}.`],
    };
  }

  await upsertNewsSource({
    id: source.id,
    name: source.name,
    sourceType: source.type,
    baseUrl: source.url,
    rssUrl: source.type === "rss" || source.type === "atom" ? source.url : null,
    language: source.language,
    country: source.country,
    qualityScore: source.defaultCredibilityScore,
    status: source.enabled ? "ACTIVE" : "DISABLED",
    metadata: safeJson({
      tier: source.tier,
      sectorTags: source.sectorTags ?? [],
      fetchConfig: source.fetchConfig ?? {},
    }),
  });

  const result = await adapter.fetch(source, scope);
  const documentMetrics = await upsertSourceDocuments(result.documents);

  return {
    sourcesProcessed: 1,
    sourcesFailed: result.errors.length > 0 ? 1 : 0,
    documentsFetched: documentMetrics.fetched,
    documentsCreated: documentMetrics.created,
    documentsUpdated: documentMetrics.updated,
    documentsDuplicate: documentMetrics.duplicate,
    errors: result.errors,
  };
}

export async function syncNewsSources(options: SyncNewsSourcesOptions = {}): Promise<CompanyEventIngestionMetrics> {
  const metrics = emptyMetrics();
  const sources = (options.sourceIds?.length ? options.sourceIds.map(getNewsSourceDefinition) : listEnabledNewsSources()).filter(
    (source): source is NewsSourceDefinition => Boolean(source?.enabled),
  );

  for (const source of sources) {
    const sourceMetrics = await syncSource(source.id, options);
    metrics.sourcesProcessed += sourceMetrics.sourcesProcessed;
    metrics.sourcesFailed += sourceMetrics.sourcesFailed;
    metrics.documentsFetched += sourceMetrics.documentsFetched;
    metrics.documentsCreated += sourceMetrics.documentsCreated;
    metrics.documentsUpdated += sourceMetrics.documentsUpdated;
    metrics.documentsDuplicate += sourceMetrics.documentsDuplicate;
    metrics.errors.push(...sourceMetrics.errors);
  }

  return metrics;
}
