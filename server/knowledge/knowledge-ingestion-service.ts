import { createHash } from "node:crypto";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  KNOWLEDGE_DOCUMENT_TYPES,
  KNOWLEDGE_DOMAINS,
  KNOWLEDGE_JURISDICTIONS,
  KNOWLEDGE_LEGAL_STATUSES,
  EEA_INCORPORATION_STATUSES,
  NORWAY_IMPLEMENTATION_STATUSES,
  assertKnowledgeSourceSystemMatchesUrl,
  chunkKnowledgeContent,
} from "./knowledge-domain";

export const OFFICIAL_KNOWLEDGE_SOURCE_SYSTEMS = [
  "LOVDATA_API",
  "EUR_LEX_ELI",
  "EEA_LEX",
  "STORTINGET_API",
  "REGJERINGEN",
  "NRS",
  "SKATTEETATEN",
  "FINANSTILSYNET",
  "BRREG",
] as const;

const nullableDate = z.string().datetime().nullable();

export const officialKnowledgeDocumentSchema = z.object({
  externalId: z.string().min(2).max(300),
  versionKey: z.string().min(1).max(200),
  title: z.string().min(2).max(1_000),
  shortTitle: z.string().max(300).nullable(),
  description: z.string().max(5_000).nullable(),
  authority: z.string().min(2).max(300),
  jurisdiction: z.enum(KNOWLEDGE_JURISDICTIONS),
  domain: z.enum(KNOWLEDGE_DOMAINS),
  documentType: z.enum(KNOWLEDGE_DOCUMENT_TYPES),
  legalStatus: z.enum(KNOWLEDGE_LEGAL_STATUSES),
  language: z.string().min(2).max(10),
  sourceUrl: z.string().url(),
  publishedAt: nullableDate,
  adoptedAt: nullableDate,
  effectiveFrom: nullableDate,
  effectiveTo: nullableDate,
  eeaIncorporationStatus: z.enum(EEA_INCORPORATION_STATUSES),
  eeaDecisionReference: z.string().max(300).nullable(),
  eeaIncorporatedAt: nullableDate,
  eeaEffectiveFrom: nullableDate,
  norwayImplementationStatus: z.enum(NORWAY_IMPLEMENTATION_STATUSES),
  norwayImplementingReference: z.string().max(300).nullable(),
  norwayImplementedAt: nullableDate,
  lastVerifiedAt: z.string().datetime(),
  sourceSystem: z.enum(OFFICIAL_KNOWLEDGE_SOURCE_SYSTEMS),
  sourceEntityType: z.string().min(2).max(200),
  sourceId: z.string().min(2).max(500),
  fetchedAt: z.string().datetime(),
  normalizedAt: z.string().datetime(),
  content: z.string().min(20),
}).strict().superRefine((document, context) => {
  const issue = (path: string, message: string) => context.addIssue({
    code: z.ZodIssueCode.custom,
    path: [path],
    message,
  });

  if (document.legalStatus === "IN_FORCE" && !document.effectiveFrom) {
    issue("effectiveFrom", "IN_FORCE krever dokumentert ikrafttredelsesdato.");
  }
  if (["REPEALED", "SUPERSEDED"].includes(document.legalStatus)) {
    if (!document.effectiveFrom) issue("effectiveFrom", `${document.legalStatus} krever startdato.`);
    if (!document.effectiveTo) issue("effectiveTo", `${document.legalStatus} krever sluttdato.`);
  }
  if (
    document.effectiveFrom
    && document.effectiveTo
    && new Date(document.effectiveTo) <= new Date(document.effectiveFrom)
  ) {
    issue("effectiveTo", "Sluttdato må være etter ikrafttredelsesdato.");
  }

  if (document.eeaIncorporationStatus === "INCORPORATED") {
    if (!document.eeaDecisionReference) issue("eeaDecisionReference", "INCORPORATED krever EØS-komitéreferanse.");
    if (!document.eeaIncorporatedAt) issue("eeaIncorporatedAt", "INCORPORATED krever innlemmelsesdato.");
    if (!document.eeaEffectiveFrom) issue("eeaEffectiveFrom", "INCORPORATED krever EØS-ikrafttredelsesdato.");
  }
  if (
    document.eeaIncorporationStatus === "NOT_RELEVANT"
    && (document.eeaDecisionReference || document.eeaIncorporatedAt || document.eeaEffectiveFrom)
  ) {
    issue("eeaIncorporationStatus", "NOT_RELEVANT kan ikke ha EØS-innlemmelsesdata.");
  }
  if (document.norwayImplementationStatus === "IMPLEMENTED") {
    if (!document.norwayImplementingReference) {
      issue("norwayImplementingReference", "IMPLEMENTED krever norsk gjennomføringsreferanse.");
    }
    if (!document.norwayImplementedAt) issue("norwayImplementedAt", "IMPLEMENTED krever gjennomføringsdato.");
  }
  if (
    document.norwayImplementationStatus === "NOT_REQUIRED"
    && (document.norwayImplementingReference || document.norwayImplementedAt)
  ) {
    issue("norwayImplementationStatus", "NOT_REQUIRED kan ikke ha gjennomføringsdata.");
  }
});

export type OfficialKnowledgeDocumentInput = z.infer<typeof officialKnowledgeDocumentSchema>;

function asDate(value: string | null) {
  return value ? new Date(value) : null;
}

export async function ingestOfficialKnowledgeDocument(input: OfficialKnowledgeDocumentInput) {
  const validated = officialKnowledgeDocumentSchema.parse(input);
  assertKnowledgeSourceSystemMatchesUrl(validated.sourceSystem, validated.sourceUrl);
  const checksum = createHash("sha256").update(input.content, "utf8").digest("hex");
  const unique = {
    sourceSystem: input.sourceSystem,
    sourceId: input.sourceId,
    versionKey: input.versionKey,
  };
  const existing = await prisma.knowledgeDocument.findUnique({
    where: { sourceSystem_sourceId_versionKey: unique },
    select: { id: true, checksum: true },
  });

  if (existing?.checksum === checksum) {
    await prisma.knowledgeDocument.update({
      where: { id: existing.id },
      data: {
        lastVerifiedAt: new Date(input.lastVerifiedAt),
        fetchedAt: new Date(input.fetchedAt),
        normalizedAt: new Date(input.normalizedAt),
      },
    });
    return { documentId: existing.id, status: "UNCHANGED" as const, chunkCount: null };
  }

  if (existing) {
    throw new Error(
      `Kildedokumentet ${input.sourceSystem}/${input.sourceId} har endret innhold uten ny versionKey. Historikk overskrives ikke.`,
    );
  }

  const chunks = chunkKnowledgeContent(input.content);
  return prisma.$transaction(async (tx) => {
    const document = await tx.knowledgeDocument.create({
      data: {
        ...unique,
        externalId: input.externalId,
        title: input.title,
        shortTitle: input.shortTitle,
        description: input.description,
        authority: input.authority,
        jurisdiction: input.jurisdiction,
        domain: input.domain,
        documentType: input.documentType,
        legalStatus: input.legalStatus,
        language: input.language,
        sourceUrl: input.sourceUrl,
        publishedAt: asDate(input.publishedAt),
        adoptedAt: asDate(input.adoptedAt),
        effectiveFrom: asDate(input.effectiveFrom),
        effectiveTo: asDate(input.effectiveTo),
        eeaIncorporationStatus: input.eeaIncorporationStatus,
        eeaDecisionReference: input.eeaDecisionReference,
        eeaIncorporatedAt: asDate(input.eeaIncorporatedAt),
        eeaEffectiveFrom: asDate(input.eeaEffectiveFrom),
        norwayImplementationStatus: input.norwayImplementationStatus,
        norwayImplementingReference: input.norwayImplementingReference,
        norwayImplementedAt: asDate(input.norwayImplementedAt),
        lastVerifiedAt: new Date(input.lastVerifiedAt),
        checksum,
        sourceEntityType: input.sourceEntityType,
        fetchedAt: new Date(input.fetchedAt),
        normalizedAt: new Date(input.normalizedAt),
      },
    });
    await tx.knowledgeChunk.createMany({
      data: chunks.map((chunk) => ({ ...chunk, documentId: document.id })),
    });
    return {
      documentId: document.id,
      status: "CREATED" as const,
      chunkCount: chunks.length,
    };
  });
}
