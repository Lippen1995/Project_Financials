import { BrregAnnouncementsProvider } from "@/integrations/brreg/brreg-announcements-provider";
import { prisma } from "@/lib/prisma";
import type { NewsSourceDefinition } from "@/server/news/news-source-registry";
import type { NewsSourceAdapter, SourceCompanyScope, SourceFetchResult, SourceFetchScope } from "@/server/news/source-adapters/types";

async function defaultCompanyScopes(limit: number): Promise<SourceCompanyScope[]> {
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

  return companies.map((company) => ({
    companyId: company.id,
    orgNumber: company.orgNumber,
    name: company.name,
  }));
}

export class BrregAnnouncementSourceAdapter implements NewsSourceAdapter {
  sourceType = "brreg";

  constructor(private readonly provider = new BrregAnnouncementsProvider()) {}

  async fetch(source: NewsSourceDefinition, scope: SourceFetchScope = {}): Promise<SourceFetchResult> {
    const fetchedAt = new Date();
    const companyScopes = scope.companyScopes ?? (await defaultCompanyScopes(scope.limit ?? 100));
    const documents: SourceFetchResult["documents"] = [];
    const errors: string[] = [];

    for (const company of companyScopes) {
      try {
        const result = await this.provider.getAnnouncements(company.orgNumber);
        documents.push(
          ...result.announcements.map((announcement) => ({
            sourceId: source.id,
            externalId: announcement.id,
            url: announcement.detailUrl,
            canonicalUrl: announcement.detailUrl,
            title: announcement.title,
            summary: `Kunngjøring fra Brønnøysundregistrene for ${company.name}.`,
            language: "no",
            publishedAt: announcement.publishedAt,
            rawPayload: {
              ...(announcement.rawPayload && typeof announcement.rawPayload === "object" ? announcement.rawPayload : {}),
              companyId: company.companyId,
              orgNumber: company.orgNumber,
            },
          })),
        );
      } catch (error) {
        errors.push(
          `Brreg announcements failed for ${company.orgNumber}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return {
      sourceId: source.id,
      documents,
      errors,
      fetchedAt,
    };
  }
}
