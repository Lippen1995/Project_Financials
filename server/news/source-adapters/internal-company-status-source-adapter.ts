import { prisma } from "@/lib/prisma";
import type { NewsSourceDefinition } from "@/server/news/news-source-registry";
import type { NewsSourceAdapter, SourceFetchResult, SourceFetchScope } from "@/server/news/source-adapters/types";

export class InternalCompanyStatusSourceAdapter implements NewsSourceAdapter {
  sourceType = "internal";

  async fetch(source: NewsSourceDefinition, scope: SourceFetchScope = {}): Promise<SourceFetchResult> {
    const fetchedAt = new Date();
    const companyIds = scope.companyScopes?.map((company) => company.companyId) ?? [];
    const companies = await prisma.company.findMany({
      where: {
        ...(companyIds.length > 0 ? { id: { in: companyIds } } : {}),
        statusObservedAt: { not: null },
      },
      select: {
        id: true,
        slug: true,
        orgNumber: true,
        name: true,
        status: true,
        statusObservedAt: true,
        sourceSystem: true,
        sourceId: true,
      },
      orderBy: { statusObservedAt: "desc" },
      take: scope.limit ?? 100,
    });

    return {
      sourceId: source.id,
      documents: companies.map((company) => ({
        sourceId: source.id,
        externalId: `company-status:${company.id}:${company.status}:${company.statusObservedAt?.toISOString()}`,
        url: `fjord-insight://company-status/${company.id}`,
        canonicalUrl: `fjord-insight://company-status/${company.id}`,
        title: `${company.name}: status ${company.status}`,
        summary: `Registrert selskapsstatus for ${company.name} er ${company.status}.`,
        language: "no",
        publishedAt: company.statusObservedAt,
        rawPayload: {
          companyId: company.id,
          orgNumber: company.orgNumber,
          slug: company.slug,
          status: company.status,
          sourceSystem: company.sourceSystem,
          sourceId: company.sourceId,
        },
      })),
      errors: [],
      fetchedAt,
    };
  }
}
