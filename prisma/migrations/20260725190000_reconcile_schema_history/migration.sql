-- Reconcile models that existed only in db-push-era databases. Every create
-- is idempotent so those databases and clean migrate-deploy databases converge
-- on the same versioned schema.
DO $$ BEGIN
    CREATE TYPE "ShareholderRegisterImportStatus" AS ENUM ('UPLOADED', 'VALIDATING', 'IMPORTING', 'COMPLETED', 'PARTIAL', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "OwnershipRelationship" AS ENUM ('SUBSIDIARY', 'ASSOCIATED', 'MINORITY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "ChainSource" AS ENUM ('AUTO', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "ChainMatchMethod" AS ENUM ('NAME_PREFIX', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "RoleHolderType" AS ENUM ('PERSON', 'COMPANY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "AnnualReportReviewDecisionType" ADD VALUE IF NOT EXISTS 'REOPENED';

-- AlterTable
ALTER TABLE "BoardReportExtraction" ALTER COLUMN "pageRanges" DROP NOT NULL,
ALTER COLUMN "pageRanges" DROP DEFAULT;

-- AlterTable
ALTER TABLE "NewsArticleFeatureSet" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "NewsRelevanceFeedback" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "RegistrySubunit" (
    "id" TEXT NOT NULL,
    "orgNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentOrgNumber" TEXT,
    "organisationForm" TEXT,
    "naceCode" TEXT,
    "naceDescription" TEXT,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "employeeCount" INTEGER,
    "registeredAt" TIMESTAMP(3),
    "addressStreet" TEXT,
    "postalCode" TEXT,
    "postalPlace" TEXT,
    "municipality" TEXT,
    "municipalityNumber" TEXT,
    "countryCode" TEXT,
    "registerUpdatedAt" TIMESTAMP(3),
    "sourceSnapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrySubunit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RetailChain" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "naceCode" TEXT,
    "naceDescription" TEXT,
    "storeCount" INTEGER NOT NULL DEFAULT 0,
    "activeStoreCount" INTEGER NOT NULL DEFAULT 0,
    "operatorCount" INTEGER NOT NULL DEFAULT 0,
    "municipalityCount" INTEGER NOT NULL DEFAULT 0,
    "source" "ChainSource" NOT NULL DEFAULT 'AUTO',
    "confidence" DECIMAL(4,3),
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailChain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChainMembership" (
    "subunitOrgNumber" VARCHAR(9) NOT NULL,
    "chainId" TEXT NOT NULL,
    "operatorOrgNumber" VARCHAR(9),
    "matchMethod" "ChainMatchMethod" NOT NULL DEFAULT 'NAME_PREFIX',
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainMembership_pkey" PRIMARY KEY ("subunitOrgNumber")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MetricAlias" (
    "id" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "statementFamily" TEXT NOT NULL,
    "liabilitySection" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetricAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CanonicalKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "layoutGroup" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL DEFAULT 'line',
    "liabilitySection" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PresentationNode" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LINE',
    "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresentationNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PresentationNodeKey" (
    "metricKey" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "valueMode" TEXT NOT NULL DEFAULT 'NOMINAL',
    "operation" TEXT NOT NULL DEFAULT 'ADD',

    CONSTRAINT "PresentationNodeKey_pkey" PRIMARY KEY ("metricKey")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PresentationNodeLink" (
    "id" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "operation" TEXT NOT NULL DEFAULT 'ADD',

    CONSTRAINT "PresentationNodeLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ShareholderRegisterImport" (
    "id" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "sourceSystem" "ShareholdingSourceSystem" NOT NULL DEFAULT 'SKATTEETATEN_CSV',
    "sourceEntityType" TEXT NOT NULL DEFAULT 'shareholder_register_csv',
    "sourceId" TEXT,
    "sourceFileName" TEXT NOT NULL,
    "sourcePath" TEXT,
    "sourceChecksum" TEXT,
    "fileSizeBytes" BIGINT,
    "totalBytes" BIGINT,
    "processedBytes" BIGINT NOT NULL DEFAULT 0,
    "parsedRowCount" INTEGER NOT NULL DEFAULT 0,
    "importedRowCount" INTEGER NOT NULL DEFAULT 0,
    "skippedRowCount" INTEGER NOT NULL DEFAULT 0,
    "errorRowCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ShareholderRegisterImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "failureMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareholderRegisterImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ShareholderRegisterHolding" (
    "importId" TEXT NOT NULL,
    "sourceRowNumber" INTEGER NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "issuerOrgNumber" VARCHAR(9) NOT NULL,
    "issuerName" TEXT NOT NULL,
    "shareClass" TEXT,
    "shareholderName" TEXT NOT NULL,
    "shareholderIdentifierRaw" TEXT,
    "shareholderOrgNumber" VARCHAR(9),
    "shareholderBirthYear" INTEGER,
    "shareholderType" "ShareholderType" NOT NULL,
    "postalCode" VARCHAR(16),
    "postalPlace" TEXT,
    "countryCode" VARCHAR(8),
    "numberOfShares" BIGINT NOT NULL,
    "totalCompanyShares" BIGINT,
    "ownershipPercent" DECIMAL(20,8),
    "sourceSystem" "ShareholdingSourceSystem" NOT NULL DEFAULT 'SKATTEETATEN_CSV',
    "sourceEntityType" TEXT NOT NULL DEFAULT 'shareholder_register_row',
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareholderRegisterHolding_pkey" PRIMARY KEY ("importId","sourceRowNumber")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OwnershipEdge" (
    "taxYear" INTEGER NOT NULL,
    "issuerOrgNumber" VARCHAR(9) NOT NULL,
    "ownerOrgNumber" VARCHAR(9) NOT NULL,
    "issuerName" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "aggregatedShares" BIGINT NOT NULL,
    "totalIssuerShares" BIGINT,
    "ownershipPercent" DECIMAL(9,6),
    "relationship" "OwnershipRelationship" NOT NULL,
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnershipEdge_pkey" PRIMARY KEY ("taxYear","issuerOrgNumber","ownerOrgNumber")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RegistryPerson" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "birthDate" DATE,
    "isDeceased" BOOLEAN NOT NULL DEFAULT false,
    "sourceSnapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistryPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RegistryRoleAssignment" (
    "id" TEXT NOT NULL,
    "companyOrgNumber" TEXT NOT NULL,
    "holderType" "RoleHolderType" NOT NULL,
    "personIdentityKey" TEXT,
    "personName" TEXT,
    "personBirthDate" DATE,
    "holderOrgNumber" TEXT,
    "holderName" TEXT,
    "roleGroup" TEXT,
    "roleType" TEXT NOT NULL,
    "roleTypeLabel" TEXT,
    "isBoardRole" BOOLEAN NOT NULL DEFAULT false,
    "deregistered" BOOLEAN NOT NULL DEFAULT false,
    "orderIndex" INTEGER,
    "groupLastChanged" DATE,
    "sourceSnapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistryRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- Adopt db-push-era registry mirrors into the mandatory provenance contract.
ALTER TABLE "RegistryEntity"
    ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
    ADD COLUMN IF NOT EXISTS "sourceEntityType" TEXT,
    ADD COLUMN IF NOT EXISTS "sourceId" TEXT,
    ADD COLUMN IF NOT EXISTS "fetchedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "normalizedAt" TIMESTAMP(3);
UPDATE "RegistryEntity"
SET
    "sourceSystem" = COALESCE("sourceSystem", 'BRREG'),
    "sourceEntityType" = COALESCE("sourceEntityType", 'enhet'),
    "sourceId" = COALESCE("sourceId", "orgNumber"),
    "fetchedAt" = COALESCE("fetchedAt", "sourceSnapshotAt"),
    "normalizedAt" = COALESCE("normalizedAt", "sourceSnapshotAt");
ALTER TABLE "RegistryEntity"
    ALTER COLUMN "sourceSystem" SET NOT NULL,
    ALTER COLUMN "sourceEntityType" SET NOT NULL,
    ALTER COLUMN "sourceId" SET NOT NULL,
    ALTER COLUMN "fetchedAt" SET NOT NULL,
    ALTER COLUMN "normalizedAt" SET NOT NULL;

ALTER TABLE "RegistrySubunit"
    ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
    ADD COLUMN IF NOT EXISTS "sourceEntityType" TEXT,
    ADD COLUMN IF NOT EXISTS "sourceId" TEXT,
    ADD COLUMN IF NOT EXISTS "fetchedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "normalizedAt" TIMESTAMP(3);
UPDATE "RegistrySubunit"
SET
    "sourceSystem" = COALESCE("sourceSystem", 'BRREG'),
    "sourceEntityType" = COALESCE("sourceEntityType", 'underenhet'),
    "sourceId" = COALESCE("sourceId", "orgNumber"),
    "fetchedAt" = COALESCE("fetchedAt", "sourceSnapshotAt"),
    "normalizedAt" = COALESCE("normalizedAt", "sourceSnapshotAt");
ALTER TABLE "RegistrySubunit"
    ALTER COLUMN "sourceSystem" SET NOT NULL,
    ALTER COLUMN "sourceEntityType" SET NOT NULL,
    ALTER COLUMN "sourceId" SET NOT NULL,
    ALTER COLUMN "fetchedAt" SET NOT NULL,
    ALTER COLUMN "normalizedAt" SET NOT NULL;

ALTER TABLE "RegistryPerson"
    ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
    ADD COLUMN IF NOT EXISTS "sourceEntityType" TEXT,
    ADD COLUMN IF NOT EXISTS "sourceId" TEXT,
    ADD COLUMN IF NOT EXISTS "fetchedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "normalizedAt" TIMESTAMP(3);
UPDATE "RegistryPerson"
SET
    "sourceSystem" = COALESCE("sourceSystem", 'BRREG'),
    "sourceEntityType" = COALESCE("sourceEntityType", 'rolle-person'),
    "sourceId" = COALESCE("sourceId", "identityKey"),
    "fetchedAt" = COALESCE("fetchedAt", "sourceSnapshotAt"),
    "normalizedAt" = COALESCE("normalizedAt", "sourceSnapshotAt");
ALTER TABLE "RegistryPerson"
    ALTER COLUMN "sourceSystem" SET NOT NULL,
    ALTER COLUMN "sourceEntityType" SET NOT NULL,
    ALTER COLUMN "sourceId" SET NOT NULL,
    ALTER COLUMN "fetchedAt" SET NOT NULL,
    ALTER COLUMN "normalizedAt" SET NOT NULL;

ALTER TABLE "RegistryRoleAssignment"
    ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
    ADD COLUMN IF NOT EXISTS "sourceEntityType" TEXT,
    ADD COLUMN IF NOT EXISTS "sourceId" TEXT,
    ADD COLUMN IF NOT EXISTS "fetchedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "normalizedAt" TIMESTAMP(3);
UPDATE "RegistryRoleAssignment"
SET
    "sourceSystem" = COALESCE("sourceSystem", 'BRREG'),
    "sourceEntityType" = COALESCE("sourceEntityType", 'rolle'),
    "sourceId" = COALESCE("sourceId", "id"),
    "fetchedAt" = COALESCE("fetchedAt", "sourceSnapshotAt"),
    "normalizedAt" = COALESCE("normalizedAt", "sourceSnapshotAt");
ALTER TABLE "RegistryRoleAssignment"
    ALTER COLUMN "sourceSystem" SET NOT NULL,
    ALTER COLUMN "sourceEntityType" SET NOT NULL,
    ALTER COLUMN "sourceId" SET NOT NULL,
    ALTER COLUMN "fetchedAt" SET NOT NULL,
    ALTER COLUMN "normalizedAt" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RegistrySubunit_orgNumber_key" ON "RegistrySubunit"("orgNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegistrySubunit_name_idx" ON "RegistrySubunit"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegistrySubunit_parentOrgNumber_idx" ON "RegistrySubunit"("parentOrgNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegistrySubunit_naceCode_idx" ON "RegistrySubunit"("naceCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegistrySubunit_status_idx" ON "RegistrySubunit"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RetailChain_slug_key" ON "RetailChain"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RetailChain_nameKey_idx" ON "RetailChain"("nameKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RetailChain_naceCode_idx" ON "RetailChain"("naceCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChainMembership_chainId_idx" ON "ChainMembership"("chainId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChainMembership_operatorOrgNumber_idx" ON "ChainMembership"("operatorOrgNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MetricAlias_statementFamily_idx" ON "MetricAlias"("statementFamily");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MetricAlias_isActive_idx" ON "MetricAlias"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MetricAlias_metricKey_normalizedAlias_liabilitySection_key" ON "MetricAlias"("metricKey", "normalizedAlias", "liabilitySection");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CanonicalKey_key_key" ON "CanonicalKey"("key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CanonicalKey_sortOrder_idx" ON "CanonicalKey"("sortOrder");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CanonicalKey_isRequired_idx" ON "CanonicalKey"("isRequired");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PresentationNodeKey_nodeId_idx" ON "PresentationNodeKey"("nodeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PresentationNodeLink_targetNodeId_idx" ON "PresentationNodeLink"("targetNodeId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PresentationNodeLink_sourceNodeId_targetNodeId_key" ON "PresentationNodeLink"("sourceNodeId", "targetNodeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShareholderRegisterImport_taxYear_status_idx" ON "ShareholderRegisterImport"("taxYear", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShareholderRegisterImport_status_createdAt_idx" ON "ShareholderRegisterImport"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShareholderRegisterImport_sourceChecksum_idx" ON "ShareholderRegisterImport"("sourceChecksum");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShareholderRegisterHolding_taxYear_issuerOrgNumber_idx" ON "ShareholderRegisterHolding"("taxYear", "issuerOrgNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShareholderRegisterHolding_taxYear_shareholderOrgNumber_idx" ON "ShareholderRegisterHolding"("taxYear", "shareholderOrgNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShareholderRegisterHolding_taxYear_issuerOrgNumber_sharehol_idx" ON "ShareholderRegisterHolding"("taxYear", "issuerOrgNumber", "shareholderOrgNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShareholderRegisterHolding_issuerOrgNumber_idx" ON "ShareholderRegisterHolding"("issuerOrgNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShareholderRegisterHolding_shareholderOrgNumber_idx" ON "ShareholderRegisterHolding"("shareholderOrgNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShareholderRegisterHolding_taxYear_ownershipPercent_idx" ON "ShareholderRegisterHolding"("taxYear", "ownershipPercent");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "shr_top_holders" ON "ShareholderRegisterHolding"("taxYear", "issuerOrgNumber", "ownershipPercent" DESC, "numberOfShares" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OwnershipEdge_taxYear_ownerOrgNumber_idx" ON "OwnershipEdge"("taxYear", "ownerOrgNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OwnershipEdge_taxYear_issuerOrgNumber_idx" ON "OwnershipEdge"("taxYear", "issuerOrgNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OwnershipEdge_taxYear_ownerOrgNumber_relationship_idx" ON "OwnershipEdge"("taxYear", "ownerOrgNumber", "relationship");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RegistryPerson_identityKey_key" ON "RegistryPerson"("identityKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegistryPerson_fullName_idx" ON "RegistryPerson"("fullName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegistryPerson_lastName_firstName_idx" ON "RegistryPerson"("lastName", "firstName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegistryPerson_birthDate_idx" ON "RegistryPerson"("birthDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegistryRoleAssignment_companyOrgNumber_idx" ON "RegistryRoleAssignment"("companyOrgNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegistryRoleAssignment_personIdentityKey_idx" ON "RegistryRoleAssignment"("personIdentityKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegistryRoleAssignment_holderOrgNumber_idx" ON "RegistryRoleAssignment"("holderOrgNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegistryRoleAssignment_roleType_idx" ON "RegistryRoleAssignment"("roleType");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AnnualReportReviewedFact_reviewId_metricKey_statementScope__key" ON "AnnualReportReviewedFact"("reviewId", "metricKey", "statementScope", "fiscalYear", "rawLabel");

-- Drop the superseded guard only after the stricter replacement exists.
DROP INDEX IF EXISTS "AnnualReportReviewedFact_reviewId_metricKey_statementScope_key";

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChainMembership_chainId_fkey') THEN
        ALTER TABLE "ChainMembership" ADD CONSTRAINT "ChainMembership_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "RetailChain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PresentationNodeKey_nodeId_fkey') THEN
        ALTER TABLE "PresentationNodeKey" ADD CONSTRAINT "PresentationNodeKey_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "PresentationNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PresentationNodeLink_sourceNodeId_fkey') THEN
        ALTER TABLE "PresentationNodeLink" ADD CONSTRAINT "PresentationNodeLink_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "PresentationNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PresentationNodeLink_targetNodeId_fkey') THEN
        ALTER TABLE "PresentationNodeLink" ADD CONSTRAINT "PresentationNodeLink_targetNodeId_fkey" FOREIGN KEY ("targetNodeId") REFERENCES "PresentationNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ShareholderRegisterHolding_importId_fkey') THEN
        ALTER TABLE "ShareholderRegisterHolding" ADD CONSTRAINT "ShareholderRegisterHolding_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ShareholderRegisterImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

-- Converge raw PostgreSQL optimizations that are intentionally represented as
-- Unsupported fields or explicit indexes outside Prisma's model DSL.
CREATE INDEX IF NOT EXISTS "CompanySearchEvent_searchedAt_idx"
    ON "CompanySearchEvent"("searchedAt");

DO $$
DECLARE
    generated_state TEXT;
BEGIN
    SELECT is_generated
    INTO generated_state
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'KnowledgeChunk'
      AND column_name = 'searchVector';

    IF generated_state IS DISTINCT FROM 'ALWAYS' THEN
        DROP INDEX IF EXISTS "KnowledgeChunk_searchVector_idx";
        ALTER TABLE "KnowledgeChunk" DROP COLUMN IF EXISTS "searchVector";
        ALTER TABLE "KnowledgeChunk"
            ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
                to_tsvector(
                    'simple',
                    coalesce("provisionRef", '') || ' ' ||
                    coalesce("heading", '') || ' ' ||
                    "content"
                )
            ) STORED;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "KnowledgeChunk_searchVector_idx"
    ON "KnowledgeChunk" USING GIN ("searchVector");

DO $$
BEGIN
    IF to_regclass('"BoardReportExtraction_filingId_sourceDocumentHash_extractorVers"') IS NOT NULL
       AND to_regclass('"BoardReportExtraction_filingId_sourceDocumentHash_extractor_key"') IS NULL THEN
        ALTER INDEX "BoardReportExtraction_filingId_sourceDocumentHash_extractorVers" RENAME TO "BoardReportExtraction_filingId_sourceDocumentHash_extractor_key";
    END IF;
    IF to_regclass('"NewsIssuerIdentity_sourceSystem_isActive_lastMessagesFetchedAt_"') IS NOT NULL
       AND to_regclass('"NewsIssuerIdentity_sourceSystem_isActive_lastMessagesFetche_idx"') IS NULL THEN
        ALTER INDEX "NewsIssuerIdentity_sourceSystem_isActive_lastMessagesFetchedAt_" RENAME TO "NewsIssuerIdentity_sourceSystem_isActive_lastMessagesFetche_idx";
    END IF;
    IF to_regclass('"PublishedFinancialLineItem_companyId_fiscalYear_statementScope_"') IS NOT NULL
       AND to_regclass('"PublishedFinancialLineItem_companyId_fiscalYear_statementSc_idx"') IS NULL THEN
        ALTER INDEX "PublishedFinancialLineItem_companyId_fiscalYear_statementScope_" RENAME TO "PublishedFinancialLineItem_companyId_fiscalYear_statementSc_idx";
    END IF;
    IF to_regclass('"PublishedFinancialLineItem_companyId_fiscalYear_statementType_i"') IS NOT NULL
       AND to_regclass('"PublishedFinancialLineItem_companyId_fiscalYear_statementTy_idx"') IS NULL THEN
        ALTER INDEX "PublishedFinancialLineItem_companyId_fiscalYear_statementType_i" RENAME TO "PublishedFinancialLineItem_companyId_fiscalYear_statementTy_idx";
    END IF;
    IF to_regclass('"RoleInsiderTransactionAttribution_personIdentityKey_snapshotTax"') IS NOT NULL
       AND to_regclass('"RoleInsiderTransactionAttribution_personIdentityKey_snapsho_idx"') IS NULL THEN
        ALTER INDEX "RoleInsiderTransactionAttribution_personIdentityKey_snapshotTax" RENAME TO "RoleInsiderTransactionAttribution_personIdentityKey_snapsho_idx";
    END IF;
    IF to_regclass('"RoleInsiderTransactionAttribution_snapshotTaxYear_resolutionCon"') IS NOT NULL
       AND to_regclass('"RoleInsiderTransactionAttribution_snapshotTaxYear_resolutio_idx"') IS NULL THEN
        ALTER INDEX "RoleInsiderTransactionAttribution_snapshotTaxYear_resolutionCon" RENAME TO "RoleInsiderTransactionAttribution_snapshotTaxYear_resolutio_idx";
    END IF;
    IF to_regclass('"RoleInsiderTransactionAttribution_transactionId_personIdentityK"') IS NOT NULL
       AND to_regclass('"RoleInsiderTransactionAttribution_transactionId_personIdent_key"') IS NULL THEN
        ALTER INDEX "RoleInsiderTransactionAttribution_transactionId_personIdentityK" RENAME TO "RoleInsiderTransactionAttribution_transactionId_personIdent_key";
    END IF;
END
$$;
