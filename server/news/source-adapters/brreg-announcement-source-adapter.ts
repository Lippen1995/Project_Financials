import { BrregAnnouncementsProvider } from "@/integrations/brreg/brreg-announcements-provider";
import type { NewsSourceDefinition } from "@/server/news/news-source-registry";
import type { NewsSourceAdapter, SourceFetchResult, SourceFetchScope } from "@/server/news/source-adapters/types";

export class BrregAnnouncementSourceAdapter implements NewsSourceAdapter {
  sourceType = "brreg";

  constructor(private readonly provider = new BrregAnnouncementsProvider()) {}

  async fetch(source: NewsSourceDefinition, scope: SourceFetchScope = {}): Promise<SourceFetchResult> {
    const fetchedAt = new Date();
    const companyScopes = scope.companyScopes ?? [];
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
