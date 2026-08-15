import { BrregAnnouncementsProvider } from "@/integrations/brreg/brreg-announcements-provider";
import { prisma } from "@/lib/prisma";
import type { NewsSourceDefinition } from "@/server/news/news-source-registry";
import type { NewsSourceAdapter, SourceCompanyScope, SourceFetchResult, SourceFetchScope } from "@/server/news/source-adapters/types";

async function mapWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

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
        await mapWithConcurrency(result.announcements, 4, async (announcement) => {
          let detail = null;
          try {
            detail = await this.provider.getAnnouncementDetail(
              company.orgNumber,
              announcement.id,
              announcement.publishedAt,
            );
          } catch (error) {
            errors.push(
              `Brreg announcement detail failed for ${company.orgNumber}/${announcement.id}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }

          documents.push({
            sourceId: source.id,
            externalId: announcement.id,
            url: announcement.detailUrl,
            canonicalUrl: announcement.detailUrl,
            title: announcement.title,
            summary: `Kunngjøring fra Brønnøysundregistrene for ${company.name}.`,
            bodyText: detail?.contentHtml ?? null,
            language: "no",
            publishedAt: announcement.publishedAt,
            rawPayload: {
              ...(announcement.rawPayload && typeof announcement.rawPayload === "object" ? announcement.rawPayload : {}),
              companyId: company.companyId,
              orgNumber: company.orgNumber,
              sourceLabel: detail?.sourceLabel ?? null,
              contentHtml: detail?.contentHtml ?? null,
            },
          });
        });
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
