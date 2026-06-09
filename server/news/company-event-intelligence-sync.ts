import { prisma } from "@/lib/prisma";
import { resolveCompanyEntitiesForRecentDocuments } from "@/server/news/company-entity-resolution";
import { classifyCompanyEvent } from "@/server/news/company-event-classifier";
import { extractCompanyEventsFromRecentDocuments } from "@/server/news/company-event-extractor";
import { syncNewsSources, type SyncNewsSourcesOptions } from "@/server/news/company-event-ingestion-service";
import { createReadAcrossExposuresForRecentEvents } from "@/server/news/company-event-read-across";

export type CompanyEventIntelligenceSyncResult = {
  ingestion: Awaited<ReturnType<typeof syncNewsSources>>;
  entityResolution: {
    documentsProcessed: number;
    signalsCreated: number;
  };
  extraction: {
    documentsProcessed: number;
    eventsUpserted: number;
    evidenceAttached: number;
  };
  reconciliation: {
    evidenceRemoved: number;
    eventsDeactivated: number;
  };
  readAcross: {
    eventsProcessed: number;
    companiesEvaluated: number;
    exposuresCreated: number;
    exposuresRemoved: number;
  };
};

export type CompanyEventIntelligenceSyncStage =
  | "ingestion"
  | "entity_resolution"
  | "evidence_reconciliation"
  | "event_extraction"
  | "read_across";

export type CompanyEventIntelligenceSyncOptions = SyncNewsSourcesOptions & {
  fullReprocess?: boolean;
  onProgress?: (stage: CompanyEventIntelligenceSyncStage, detail: Record<string, number>) => void;
};

function documentWindowSize(
  ingestion: Awaited<ReturnType<typeof syncNewsSources>>,
  requestedLimit?: number,
) {
  const changedDocuments =
    ingestion.documentsCreated + ingestion.documentsUpdated + ingestion.documentsDuplicate;
  if (changedDocuments === 0) return 0;
  return Math.min(Math.max(changedDocuments, requestedLimit ?? 0, 50), 2500);
}

async function clearRecentCompanyMentionSignals(limit: number, sourceIds?: string[]) {
  const recentDocumentIds = await prisma.sourceDocument.findMany({
    where: sourceIds?.length ? { sourceId: { in: sourceIds } } : undefined,
    orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
    take: limit,
    select: { id: true },
  });

  if (recentDocumentIds.length === 0) {
    return 0;
  }

  const result = await prisma.newsSignal.deleteMany({
    where: {
      signalType: "company_mention",
      documentId: {
        in: recentDocumentIds.map((document) => document.id),
      },
    },
  });

  return result.count;
}

async function reconcileEventEvidenceWithCompanySignals(limit: number, sourceIds?: string[]) {
  const documents = await prisma.sourceDocument.findMany({
    where: {
      ...(sourceIds?.length ? { sourceId: { in: sourceIds } } : {}),
      OR: [
        {
          signals: {
            some: {
              signalType: "company_mention",
              companyId: { not: null },
            },
          },
        },
        { eventEvidence: { some: {} } },
      ],
    },
    orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      title: true,
      summary: true,
      bodyText: true,
      sourcePayload: true,
      source: {
        select: {
          id: true,
          sourceType: true,
          qualityScore: true,
          metadata: true,
        },
      },
      signals: {
        where: {
          signalType: "company_mention",
          companyId: { not: null },
        },
        select: { companyId: true },
      },
      eventEvidence: {
        select: {
          id: true,
          eventId: true,
          event: {
            select: {
              companyId: true,
              eventType: true,
            },
          },
        },
      },
    },
  });

  const invalidEvidenceIds: string[] = [];
  const affectedEventIds = new Set<string>();

  for (const document of documents) {
    const classification = classifyCompanyEvent(document);
    const validCompanyIds = new Set(
      document.signals
        .map((signal) => signal.companyId)
        .filter((companyId): companyId is string => Boolean(companyId)),
    );

    for (const evidence of document.eventEvidence) {
      const validCompany =
        validCompanyIds.has(evidence.event.companyId);
      const validClassification =
        classification.eventType !== "low_signal_mention" &&
        classification.eventType === evidence.event.eventType;
      if (validCompany && validClassification) continue;
      invalidEvidenceIds.push(evidence.id);
      affectedEventIds.add(evidence.eventId);
    }
  }

  if (invalidEvidenceIds.length > 0) {
    await prisma.companyEventEvidence.deleteMany({
      where: { id: { in: invalidEvidenceIds } },
    });
  }

  const orphanedEvents = affectedEventIds.size === 0
    ? []
    : await prisma.companyEvent.findMany({
        where: {
          id: { in: [...affectedEventIds] },
          evidence: { none: {} },
        },
        select: { id: true },
      });

  if (orphanedEvents.length > 0) {
    await prisma.companyEvent.updateMany({
      where: { id: { in: orphanedEvents.map((event) => event.id) } },
      data: { status: "INACTIVE" },
    });
  }

  return {
    evidenceRemoved: invalidEvidenceIds.length,
    eventsDeactivated: orphanedEvents.length,
  };
}

export async function syncCompanyEventIntelligence(
  options: CompanyEventIntelligenceSyncOptions = {},
): Promise<CompanyEventIntelligenceSyncResult> {
  const ingestion = await syncNewsSources(options);
  options.onProgress?.("ingestion", {
    documentsFetched: ingestion.documentsFetched,
    documentsCreated: ingestion.documentsCreated,
    documentsUpdated: ingestion.documentsUpdated,
    sourcesFailed: ingestion.sourcesFailed,
  });
  const limit = options.fullReprocess
    ? await prisma.sourceDocument.count({
        where: options.sourceIds?.length
          ? { sourceId: { in: options.sourceIds } }
          : undefined,
      })
    : documentWindowSize(ingestion, options.limit);
  if (limit === 0) {
    return {
      ingestion,
      entityResolution: {
        documentsProcessed: 0,
        signalsCreated: 0,
      },
      extraction: {
        documentsProcessed: 0,
        eventsUpserted: 0,
        evidenceAttached: 0,
      },
      reconciliation: {
        evidenceRemoved: 0,
        eventsDeactivated: 0,
      },
      readAcross: {
        eventsProcessed: 0,
        companiesEvaluated: 0,
        exposuresCreated: 0,
        exposuresRemoved: 0,
      },
    };
  }

  await clearRecentCompanyMentionSignals(limit, options.sourceIds);

  const entityResolution = await resolveCompanyEntitiesForRecentDocuments({
    limit,
    sourceIds: options.sourceIds,
  });
  options.onProgress?.("entity_resolution", {
    documentsProcessed: entityResolution.documentsProcessed,
    signalsCreated: entityResolution.signalsCreated,
  });
  const reconciliation = await reconcileEventEvidenceWithCompanySignals(limit, options.sourceIds);
  options.onProgress?.("evidence_reconciliation", reconciliation);
  const extraction = await extractCompanyEventsFromRecentDocuments({
    limit,
    sourceIds: options.sourceIds,
  });
  options.onProgress?.("event_extraction", {
    documentsProcessed: extraction.documentsProcessed,
    eventsUpserted: extraction.eventsUpserted,
    evidenceAttached: extraction.evidenceAttached,
  });
  const readAcrossResult = await createReadAcrossExposuresForRecentEvents({
    limit: Math.min(Math.max(Math.ceil(extraction.eventsUpserted / 2), 30), 120),
  });
  const readAcross = {
    ...readAcrossResult,
    exposuresRemoved: readAcrossResult.exposuresRemoved ?? 0,
  };
  options.onProgress?.("read_across", {
    eventsProcessed: readAcross.eventsProcessed,
    companiesEvaluated: readAcross.companiesEvaluated,
    exposuresCreated: readAcross.exposuresCreated,
    exposuresRemoved: readAcross.exposuresRemoved,
  });

  return {
    ingestion,
    entityResolution,
    extraction,
    reconciliation,
    readAcross,
  };
}
