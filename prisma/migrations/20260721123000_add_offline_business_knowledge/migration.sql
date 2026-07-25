-- This migration is the adoption boundary for databases that received these
-- objects through the former db-push workflow. The migration had not been
-- successfully applied to those databases, so every DDL operation is safe to
-- replay while preserving their existing data.
DO $$ BEGIN
    CREATE TYPE "KnowledgeJurisdiction" AS ENUM ('NO', 'EU', 'EEA', 'INTERNATIONAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE TYPE "KnowledgeDomain" AS ENUM ('NORWEGIAN_LAW', 'ACCOUNTING', 'IFRS', 'EU_EEA_LAW', 'BUSINESS_POLICY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE TYPE "KnowledgeDocumentType" AS ENUM ('LAW', 'REGULATION', 'ACCOUNTING_STANDARD', 'BOOKKEEPING_STANDARD', 'IFRS_STANDARD', 'EU_ACT', 'EEA_DECISION', 'PROPOSITION', 'HEARING', 'BUDGET_MEASURE', 'PARLIAMENT_DECISION', 'OFFICIAL_GUIDANCE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE TYPE "KnowledgeLegalStatus" AS ENUM ('DRAFT', 'PROPOSED', 'HEARING', 'ADOPTED', 'IN_FORCE', 'REPEALED', 'SUPERSEDED', 'WITHDRAWN', 'LAPSED', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE TYPE "EeaIncorporationStatus" AS ENUM ('NOT_ASSESSED', 'NOT_RELEVANT', 'UNDER_SCRUTINY', 'PENDING', 'INCORPORATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE TYPE "NorwayImplementationStatus" AS ENUM ('NOT_ASSESSED', 'NOT_REQUIRED', 'PENDING', 'IMPLEMENTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "versionKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortTitle" TEXT,
    "description" TEXT,
    "authority" TEXT NOT NULL,
    "jurisdiction" "KnowledgeJurisdiction" NOT NULL,
    "domain" "KnowledgeDomain" NOT NULL,
    "documentType" "KnowledgeDocumentType" NOT NULL,
    "legalStatus" "KnowledgeLegalStatus" NOT NULL DEFAULT 'UNKNOWN',
    "language" TEXT NOT NULL DEFAULT 'nb',
    "sourceUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "adoptedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "eeaIncorporationStatus" "EeaIncorporationStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
    "eeaDecisionReference" TEXT,
    "eeaIncorporatedAt" TIMESTAMP(3),
    "eeaEffectiveFrom" TIMESTAMP(3),
    "norwayImplementationStatus" "NorwayImplementationStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
    "norwayImplementingReference" TEXT,
    "norwayImplementedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL,
    "checksum" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "heading" TEXT,
    "provisionRef" TEXT,
    "content" TEXT NOT NULL,
    "tokenEstimate" INTEGER NOT NULL,
    "searchVector" tsvector GENERATED ALWAYS AS (
      to_tsvector('simple', coalesce("provisionRef", '') || ' ' || coalesce("heading", '') || ' ' || "content")
    ) STORED,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeDocument_sourceSystem_sourceId_versionKey_key"
ON "KnowledgeDocument"("sourceSystem", "sourceId", "versionKey");
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_externalId_effectiveFrom_idx"
ON "KnowledgeDocument"("externalId", "effectiveFrom");
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_domain_jurisdiction_legalStatus_idx"
ON "KnowledgeDocument"("domain", "jurisdiction", "legalStatus");
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_effectiveFrom_effectiveTo_idx"
ON "KnowledgeDocument"("effectiveFrom", "effectiveTo");
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_lastVerifiedAt_idx"
ON "KnowledgeDocument"("lastVerifiedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeChunk_documentId_chunkIndex_key"
ON "KnowledgeChunk"("documentId", "chunkIndex");
CREATE INDEX IF NOT EXISTS "KnowledgeChunk_documentId_provisionRef_idx"
ON "KnowledgeChunk"("documentId", "provisionRef");
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'KnowledgeChunk'
          AND column_name = 'searchVector'
          AND is_generated = 'ALWAYS'
    ) THEN
        CREATE INDEX IF NOT EXISTS "KnowledgeChunk_searchVector_idx"
            ON "KnowledgeChunk" USING GIN ("searchVector");
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'KnowledgeChunk_documentId_fkey'
          AND conrelid = '"KnowledgeChunk"'::regclass
    ) THEN
        ALTER TABLE "KnowledgeChunk"
        ADD CONSTRAINT "KnowledgeChunk_documentId_fkey"
        FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;
