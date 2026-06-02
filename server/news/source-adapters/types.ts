import type { NewsSourceDefinition } from "@/server/news/news-source-registry";

export type SourceCompanyScope = {
  companyId: string;
  orgNumber: string;
  name: string;
};

export type SourceFetchScope = {
  companyScopes?: SourceCompanyScope[];
  limit?: number;
};

export type ParsedSourceDocument = {
  sourceId: string;
  externalId?: string | null;
  url: string;
  canonicalUrl?: string | null;
  title: string;
  summary?: string | null;
  bodyText?: string | null;
  language?: string | null;
  publishedAt?: Date | null;
  rawPayload?: unknown;
};

export type SourceFetchResult = {
  sourceId: string;
  documents: ParsedSourceDocument[];
  errors: string[];
  fetchedAt: Date;
};

export interface NewsSourceAdapter {
  sourceType: string;
  fetch(source: NewsSourceDefinition, scope?: SourceFetchScope): Promise<SourceFetchResult>;
}

export function emptySourceFetchResult(sourceId: string, fetchedAt = new Date()): SourceFetchResult {
  return {
    sourceId,
    documents: [],
    errors: [],
    fetchedAt,
  };
}
