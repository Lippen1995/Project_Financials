-- Preserve the percentage-only ownership graph and add a separately published semantic
-- projection. Public-administration ownership of AS/ASA companies can consequently be
-- represented as financial positions without rewriting the Skatteetaten evidence.

ALTER TABLE "RegistryEntity"
  ADD COLUMN "institutionalSectorCode" TEXT,
  ADD COLUMN "institutionalSectorDescription" TEXT;

CREATE INDEX "RegistryEntity_institutionalSectorCode_idx"
  ON "RegistryEntity"("institutionalSectorCode");

CREATE TYPE "GroupOwnerCategory" AS ENUM (
  'PUBLIC_NON_COMMERCIAL',
  'OTHER_ORGANISATION',
  'UNKNOWN'
);

CREATE TYPE "GroupRelationshipKind" AS ENUM (
  'GROUP_SUBSIDIARY',
  'GROUP_ASSOCIATE',
  'FINANCIAL_POSITION',
  'MINORITY_POSITION',
  'UNKNOWN',
  'CONFLICT'
);

CREATE TABLE "GroupRelationshipSnapshot" (
  "buildId" UUID NOT NULL,
  "taxYear" INTEGER NOT NULL,
  "issuerOrgNumber" VARCHAR(9) NOT NULL,
  "ownerOrgNumber" VARCHAR(9) NOT NULL,
  "issuerName" TEXT NOT NULL,
  "ownerName" TEXT NOT NULL,
  "ownershipPercent" DECIMAL(9,6),
  "ownershipBand" "OwnershipRelationship" NOT NULL,
  "relationship" "GroupRelationshipKind" NOT NULL,
  "ownerCategory" "GroupOwnerCategory" NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "ruleVersion" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "sourceEntityType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "normalizedAt" TIMESTAMP(3) NOT NULL,
  "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GroupRelationshipSnapshot_pkey"
    PRIMARY KEY ("buildId", "taxYear", "issuerOrgNumber", "ownerOrgNumber")
);

CREATE INDEX "grp_rel_by_issuer"
  ON "GroupRelationshipSnapshot"("buildId", "taxYear", "issuerOrgNumber", "relationship");
CREATE INDEX "grp_rel_by_owner"
  ON "GroupRelationshipSnapshot"("buildId", "taxYear", "ownerOrgNumber", "relationship");
CREATE INDEX "GroupRelationshipSnapshot_taxYear_relationship_idx"
  ON "GroupRelationshipSnapshot"("taxYear", "relationship");

CREATE TABLE "GroupRelationshipPublication" (
  "taxYear" INTEGER NOT NULL,
  "buildId" UUID NOT NULL,
  "ruleVersion" TEXT NOT NULL,
  "relationshipCount" INTEGER NOT NULL,
  "financialPositionCount" INTEGER NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "sourceEntityType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "normalizedAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GroupRelationshipPublication_pkey" PRIMARY KEY ("taxYear")
);

CREATE UNIQUE INDEX "GroupRelationshipPublication_buildId_key"
  ON "GroupRelationshipPublication"("buildId");
