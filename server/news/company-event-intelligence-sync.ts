import { prisma } from "@/lib/prisma";
import { resolveCompanyEntitiesForRecentDocuments } from "@/server/news/company-entity-resolution";
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
  readAcross: {
    eventsProcessed: number;
    companiesEvaluated: number;
    exposuresCreated: number;
  };
};

function documentWindowSize(ingestion: Awaited<ReturnType<typeof syncNewsSources>>) {
  const changedDocuments =
    ingestion.documentsCreated + ingestion.documentsUpdated + ingestion.documentsDuplicate;
  return Math.min(Math.max(changedDocuments, 50), 2500);
}

async function clearRecentCompanyMentionSignals(limit: number) {
  const recentDocumentIds = await prisma.sourceDocument.findMany({
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

export async function syncCompanyEventIntelligence(
  options: SyncNewsSourcesOptions = {},
): Promise<CompanyEventIntelligenceSyncResult> {
  const ingestion = await syncNewsSources(options);
  const limit = documentWindowSize(ingestion);

  await clearRecentCompanyMentionSignals(limit);

  const entityResolution = await resolveCompanyEntitiesForRecentDocuments({
    limit,
  });
  const extraction = await extractCompanyEventsFromRecentDocuments({
    limit,
  });
  const readAcross = await createReadAcrossExposuresForRecentEvents({
    limit: Math.min(Math.max(Math.ceil(extraction.eventsUpserted / 2), 30), 120),
  });

  return {
    ingestion,
    entityResolution,
    extraction,
    readAcross,
  };
}
