import { prisma } from "@/lib/prisma";
import type { NewsSourceDefinition } from "@/server/news/news-source-registry";
import type { NewsSourceAdapter, SourceFetchResult, SourceFetchScope } from "@/server/news/source-adapters/types";

export class InternalFinancialsSourceAdapter implements NewsSourceAdapter {
  sourceType = "financials";

  async fetch(source: NewsSourceDefinition, scope: SourceFetchScope = {}): Promise<SourceFetchResult> {
    const fetchedAt = new Date();
    const companyIds = scope.companyScopes?.map((company) => company.companyId) ?? [];
    const filings = await prisma.annualReportFiling.findMany({
      where: {
        ...(companyIds.length > 0 ? { companyId: { in: companyIds } } : {}),
        status: { in: ["PUBLISHED", "MANUAL_REVIEW"] },
      },
      include: {
        company: {
          select: { id: true, name: true, orgNumber: true },
        },
      },
      orderBy: [{ publishedSnapshotAt: "desc" }, { discoveredAt: "desc" }],
      take: scope.limit ?? 100,
    });

    return {
      sourceId: source.id,
      documents: filings.map((filing) => ({
        sourceId: source.id,
        externalId: `annual-report-filing:${filing.id}`,
        url: filing.sourceUrl,
        canonicalUrl: filing.sourceUrl,
        title: `${filing.company.name}: årsrapport ${filing.fiscalYear}`,
        summary: `Årsrapport/regnskapsdokument er registrert for ${filing.company.name}.`,
        language: "no",
        publishedAt: filing.publishedSnapshotAt ?? filing.discoveredAt,
        rawPayload: {
          filingId: filing.id,
          companyId: filing.companyId,
          orgNumber: filing.company.orgNumber,
          fiscalYear: filing.fiscalYear,
          status: filing.status,
          sourceDocumentHash: filing.sourceDocumentHash,
        },
      })),
      errors: [],
      fetchedAt,
    };
  }
}
