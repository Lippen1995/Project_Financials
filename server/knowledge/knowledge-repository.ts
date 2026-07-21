import { prisma } from "@/lib/prisma";
import { isRuleEffectiveAt } from "./knowledge-domain";
import type {
  KnowledgeRuleStatusResult,
  KnowledgeSearchInput,
  KnowledgeSearchResult,
} from "./knowledge-types";

type KnowledgeSearchRow = {
  chunkId: string;
  documentId: string;
  externalId: string;
  versionKey: string;
  title: string;
  authority: string;
  jurisdiction: KnowledgeSearchResult["jurisdiction"];
  domain: KnowledgeSearchResult["domain"];
  documentType: KnowledgeSearchResult["documentType"];
  legalStatus: KnowledgeSearchResult["legalStatus"];
  provisionRef: string | null;
  heading: string | null;
  content: string;
  sourceUrl: string;
  publishedAt: Date | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  eeaIncorporationStatus: KnowledgeSearchResult["eeaStatus"]["incorporationStatus"];
  eeaDecisionReference: string | null;
  eeaIncorporatedAt: Date | null;
  eeaEffectiveFrom: Date | null;
  norwayImplementationStatus: KnowledgeSearchResult["norwayImplementation"]["status"];
  norwayImplementingReference: string | null;
  norwayImplementedAt: Date | null;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
  relevanceScore: number;
};

function toIso(value: Date | null) {
  return value?.toISOString() ?? null;
}

function mapRow(row: KnowledgeSearchRow, asOf: Date): KnowledgeSearchResult {
  return {
    citationId: `knowledge:${row.documentId}:${row.chunkId}`,
    documentId: row.documentId,
    externalId: row.externalId,
    title: row.title,
    authority: row.authority,
    jurisdiction: row.jurisdiction,
    domain: row.domain,
    documentType: row.documentType,
    legalStatus: row.legalStatus,
    provisionRef: row.provisionRef,
    heading: row.heading,
    excerpt: row.content.slice(0, 3_200),
    sourceUrl: row.sourceUrl,
    publishedAt: toIso(row.publishedAt),
    effectiveFrom: toIso(row.effectiveFrom),
    effectiveTo: toIso(row.effectiveTo),
    eeaStatus: {
      incorporationStatus: row.eeaIncorporationStatus,
      decisionReference: row.eeaDecisionReference,
      incorporatedAt: toIso(row.eeaIncorporatedAt),
      effectiveFrom: toIso(row.eeaEffectiveFrom),
    },
    norwayImplementation: {
      status: row.norwayImplementationStatus,
      implementingReference: row.norwayImplementingReference,
      implementedAt: toIso(row.norwayImplementedAt),
    },
    effectiveAtDate: isRuleEffectiveAt(row, asOf),
    relevanceScore: Number(row.relevanceScore),
    provenance: {
      sourceSystem: row.sourceSystem,
      sourceEntityType: row.sourceEntityType,
      sourceId: `${row.sourceId}:${row.versionKey}`,
      fetchedAt: row.fetchedAt.toISOString(),
      normalizedAt: row.normalizedAt.toISOString(),
    },
  };
}

export async function searchBusinessKnowledge(
  input: KnowledgeSearchInput,
): Promise<KnowledgeSearchResult[]> {
  const rows = await prisma.$queryRawUnsafe<KnowledgeSearchRow[]>(
    `SELECT
       c."id" AS "chunkId", d."id" AS "documentId", d."externalId", d."versionKey",
       d."title", d."authority", d."jurisdiction", d."domain", d."documentType",
       d."legalStatus", c."provisionRef", c."heading", c."content", d."sourceUrl",
       d."publishedAt", d."effectiveFrom", d."effectiveTo", d."eeaIncorporationStatus",
       d."eeaDecisionReference", d."eeaIncorporatedAt", d."eeaEffectiveFrom",
       d."norwayImplementationStatus", d."norwayImplementingReference", d."norwayImplementedAt", d."sourceSystem",
       d."sourceEntityType", d."sourceId", d."fetchedAt", d."normalizedAt",
       (
         ts_rank_cd(
           coalesce(
             c."searchVector",
             to_tsvector('simple', coalesce(c."provisionRef", '') || ' ' || coalesce(c."heading", '') || ' ' || c."content")
           ),
           websearch_to_tsquery('simple', $1)
         )
         + CASE WHEN lower(d."externalId") = lower($1) THEN 2.0 ELSE 0 END
         + CASE WHEN lower(coalesce(c."provisionRef", '')) = lower($1) THEN 1.5 ELSE 0 END
         + CASE WHEN lower(d."title") LIKE '%' || lower($1) || '%' THEN 0.5 ELSE 0 END
         + CASE WHEN lower(c."content") LIKE '%' || lower($1) || '%' THEN 0.25 ELSE 0 END
       )::float8 AS "relevanceScore"
     FROM "KnowledgeChunk" c
     JOIN "KnowledgeDocument" d ON d."id" = c."documentId"
     WHERE d."domain"::text = ANY($2::text[])
       AND ($3::text[] IS NULL OR d."jurisdiction"::text = ANY($3::text[]))
       AND (
         coalesce(
           c."searchVector",
           to_tsvector('simple', coalesce(c."provisionRef", '') || ' ' || coalesce(c."heading", '') || ' ' || c."content")
         ) @@ websearch_to_tsquery('simple', $1)
         OR lower(d."externalId") LIKE '%' || lower($1) || '%'
         OR lower(d."title") LIKE '%' || lower($1) || '%'
         OR lower(coalesce(c."provisionRef", '')) LIKE '%' || lower($1) || '%'
         OR lower(c."content") LIKE '%' || lower($1) || '%'
       )
       AND (
         (d."legalStatus" IN ('DRAFT', 'PROPOSED', 'HEARING', 'ADOPTED', 'WITHDRAWN', 'LAPSED')
          AND coalesce(d."publishedAt", d."fetchedAt") <= $4)
         OR (d."effectiveFrom" IS NULL OR d."effectiveFrom" <= $4)
       )
       AND (
         d."legalStatus" IN ('DRAFT', 'PROPOSED', 'HEARING', 'ADOPTED', 'WITHDRAWN', 'LAPSED')
         OR d."effectiveTo" IS NULL OR d."effectiveTo" > $4
       )
     ORDER BY "relevanceScore" DESC, d."lastVerifiedAt" DESC, c."chunkIndex" ASC
     LIMIT $5`,
    input.query,
    input.domains,
    input.jurisdictions?.length ? input.jurisdictions : null,
    input.asOf,
    input.limit,
  );
  return rows.map((row) => mapRow(row, input.asOf));
}

export async function getKnowledgeRuleStatus(input: {
  reference: string;
  asOf: Date;
  limit: number;
}): Promise<KnowledgeRuleStatusResult> {
  const rows = await prisma.$queryRawUnsafe<KnowledgeSearchRow[]>(
    `SELECT
       c."id" AS "chunkId", d."id" AS "documentId", d."externalId", d."versionKey",
       d."title", d."authority", d."jurisdiction", d."domain", d."documentType",
       d."legalStatus", c."provisionRef", c."heading", c."content", d."sourceUrl",
       d."publishedAt", d."effectiveFrom", d."effectiveTo", d."eeaIncorporationStatus",
       d."eeaDecisionReference", d."eeaIncorporatedAt", d."eeaEffectiveFrom",
       d."norwayImplementationStatus", d."norwayImplementingReference", d."norwayImplementedAt", d."sourceSystem",
       d."sourceEntityType", d."sourceId", d."fetchedAt", d."normalizedAt",
       (CASE WHEN lower(d."externalId") = lower($1) THEN 3.0 ELSE 1.0 END)::float8 AS "relevanceScore"
     FROM "KnowledgeDocument" d
     JOIN LATERAL (
       SELECT c.* FROM "KnowledgeChunk" c
       WHERE c."documentId" = d."id"
       ORDER BY
         CASE WHEN lower(coalesce(c."provisionRef", '')) LIKE '%' || lower($1) || '%' THEN 0 ELSE 1 END,
         c."chunkIndex"
       LIMIT 1
     ) c ON true
     WHERE lower(d."externalId") LIKE '%' || lower($1) || '%'
        OR lower(d."sourceId") LIKE '%' || lower($1) || '%'
        OR lower(d."title") LIKE '%' || lower($1) || '%'
        OR lower(coalesce(c."provisionRef", '')) LIKE '%' || lower($1) || '%'
     ORDER BY "relevanceScore" DESC, d."effectiveFrom" DESC NULLS LAST, d."publishedAt" DESC NULLS LAST
     LIMIT $2`,
    input.reference,
    input.limit,
  );
  return {
    asOf: input.asOf.toISOString(),
    matched: rows.length > 0,
    candidates: rows.map((row) => mapRow(row, input.asOf)),
  };
}
