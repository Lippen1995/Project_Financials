CREATE TYPE "OfficialAddressDatasetStatus" AS ENUM ('INGESTING', 'READY', 'FAILED');
CREATE TYPE "CompanyMapBuildStatus" AS ENUM ('BUILDING', 'READY', 'PUBLISHED', 'FAILED');
CREATE TYPE "CompanyMapAddressResolutionStatus" AS ENUM (
  'MATCHED',
  'NO_BUSINESS_ADDRESS',
  'INCOMPLETE_OR_INVALID',
  'NON_GEOGRAPHIC_ADDRESS',
  'NO_EXACT_MATCH',
  'AMBIGUOUS_EXACT_MATCH',
  'OUTSIDE_NORWAY',
  'PRIVACY_WITHHELD',
  'PENDING',
  'PROVIDER_FAILURE'
);

ALTER TABLE "RegistryEntity"
  ADD COLUMN "businessAddressNormalizedName" TEXT,
  ADD COLUMN "businessAddressHouseNumber" INTEGER,
  ADD COLUMN "businessAddressHouseLetter" TEXT,
  ADD COLUMN "businessAddressUnitNumber" TEXT;

CREATE INDEX "registry_entity_exact_address"
  ON "RegistryEntity"("municipalityNumber", "businessAddressNormalizedName", "businessAddressHouseNumber");

CREATE TABLE "OfficialAddressDataset" (
  "id" UUID NOT NULL,
  "datasetVersion" TEXT NOT NULL,
  "status" "OfficialAddressDatasetStatus" NOT NULL DEFAULT 'INGESTING',
  "sourceUrl" TEXT NOT NULL,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "coordinateSystem" TEXT NOT NULL,
  "isComplete" BOOLEAN NOT NULL DEFAULT false,
  "addressCount" INTEGER NOT NULL DEFAULT 0,
  "failureReason" TEXT,
  "sourceSystem" TEXT NOT NULL,
  "sourceEntityType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "normalizedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readyAt" TIMESTAMP(3),
  CONSTRAINT "OfficialAddressDataset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfficialAddress" (
  "datasetId" UUID NOT NULL,
  "officialAddressId" TEXT NOT NULL,
  "municipalityNumber" VARCHAR(4) NOT NULL,
  "addressType" TEXT NOT NULL,
  "addressName" TEXT NOT NULL,
  "normalizedAddressName" TEXT NOT NULL,
  "houseNumber" INTEGER NOT NULL,
  "houseLetter" TEXT,
  "unitNumber" TEXT,
  "postalCode" TEXT,
  "postalPlace" TEXT,
  "latitude" DECIMAL(10,7) NOT NULL,
  "longitude" DECIMAL(10,7) NOT NULL,
  "sourceUpdatedAt" TIMESTAMP(3),
  "dataExtractedAt" TIMESTAMP(3) NOT NULL,
  "normalizedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OfficialAddress_pkey" PRIMARY KEY ("datasetId", "officialAddressId")
);

CREATE TABLE "CompanyMapBuild" (
  "id" UUID NOT NULL,
  "status" "CompanyMapBuildStatus" NOT NULL DEFAULT 'BUILDING',
  "addressDatasetId" UUID NOT NULL,
  "matcherVersion" TEXT NOT NULL,
  "registrySnapshotAt" TIMESTAMP(3) NOT NULL,
  "groupBuildId" UUID,
  "groupTaxYear" INTEGER,
  "financialDatasetVersion" TEXT NOT NULL,
  "entityCount" INTEGER NOT NULL DEFAULT 0,
  "plottedCount" INTEGER NOT NULL DEFAULT 0,
  "omittedCount" INTEGER NOT NULL DEFAULT 0,
  "failureReason" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "sourceSystem" TEXT NOT NULL,
  "sourceEntityType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "normalizedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyMapBuild_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyMapPublication" (
  "channel" TEXT NOT NULL DEFAULT 'public',
  "buildId" UUID NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyMapPublication_pkey" PRIMARY KEY ("channel")
);

CREATE TABLE "CompanyMapEntitySnapshot" (
  "buildId" UUID NOT NULL,
  "orgNumber" VARCHAR(9) NOT NULL,
  "name" TEXT NOT NULL,
  "organisationForm" TEXT,
  "companyStatus" "CompanyStatus" NOT NULL,
  "employeeCount" INTEGER,
  "addressStreet" TEXT,
  "postalCode" TEXT,
  "postalPlace" TEXT,
  "municipality" TEXT,
  "municipalityNumber" TEXT,
  "countryCode" TEXT,
  "resolutionStatus" "CompanyMapAddressResolutionStatus" NOT NULL,
  "officialAddressId" TEXT,
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "groupRootOrgNumber" VARCHAR(9),
  "groupRootName" TEXT,
  "groupMembershipStatus" "GroupMembershipStatus",
  "groupTaxYear" INTEGER,
  "registerUpdatedAt" TIMESTAMP(3),
  "registrySourceSystem" TEXT NOT NULL,
  "registrySourceEntityType" TEXT NOT NULL,
  "registrySourceId" TEXT NOT NULL,
  "registryFetchedAt" TIMESTAMP(3) NOT NULL,
  "registryNormalizedAt" TIMESTAMP(3) NOT NULL,
  "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyMapEntitySnapshot_pkey" PRIMARY KEY ("buildId", "orgNumber")
);

CREATE TABLE "CompanyMapFinancialSnapshot" (
  "buildId" UUID NOT NULL,
  "orgNumber" VARCHAR(9) NOT NULL,
  "statementScope" "StatementScope" NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "revenue" BIGINT,
  "ebit" BIGINT,
  "preTaxProfit" BIGINT,
  "netIncome" BIGINT,
  "equity" BIGINT,
  "totalAssets" BIGINT,
  "valueOrigin" TEXT NOT NULL,
  "financialDatasetVersion" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "sourceEntityType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "normalizedAt" TIMESTAMP(3) NOT NULL,
  "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyMapFinancialSnapshot_pkey" PRIMARY KEY ("buildId", "orgNumber", "statementScope"),
  CONSTRAINT "CompanyMapFinancialSnapshot_reported_only" CHECK ("valueOrigin" = 'reported')
);

CREATE UNIQUE INDEX "OfficialAddressDataset_datasetVersion_key" ON "OfficialAddressDataset"("datasetVersion");
CREATE INDEX "OfficialAddressDataset_status_sourceUpdatedAt_idx" ON "OfficialAddressDataset"("status", "sourceUpdatedAt");
CREATE INDEX "official_address_exact_match" ON "OfficialAddress"("datasetId", "municipalityNumber", "normalizedAddressName", "houseNumber", "houseLetter", "unitNumber");
CREATE INDEX "CompanyMapBuild_status_completedAt_idx" ON "CompanyMapBuild"("status", "completedAt");
CREATE INDEX "CompanyMapBuild_addressDatasetId_idx" ON "CompanyMapBuild"("addressDatasetId");
CREATE UNIQUE INDEX "CompanyMapPublication_buildId_key" ON "CompanyMapPublication"("buildId");
CREATE INDEX "company_map_coverage" ON "CompanyMapEntitySnapshot"("buildId", "organisationForm", "companyStatus", "resolutionStatus");
CREATE INDEX "CompanyMapEntitySnapshot_buildId_resolutionStatus_idx" ON "CompanyMapEntitySnapshot"("buildId", "resolutionStatus");
CREATE INDEX "CompanyMapEntitySnapshot_buildId_officialAddressId_idx" ON "CompanyMapEntitySnapshot"("buildId", "officialAddressId");
CREATE INDEX "CompanyMapEntitySnapshot_buildId_groupRootOrgNumber_idx" ON "CompanyMapEntitySnapshot"("buildId", "groupRootOrgNumber");
CREATE INDEX "CompanyMapFinancialSnapshot_buildId_statementScope_fiscalYear_idx" ON "CompanyMapFinancialSnapshot"("buildId", "statementScope", "fiscalYear");
CREATE INDEX "CompanyMapFinancialSnapshot_buildId_statementScope_revenue_idx" ON "CompanyMapFinancialSnapshot"("buildId", "statementScope", "revenue");

ALTER TABLE "OfficialAddress" ADD CONSTRAINT "OfficialAddress_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "OfficialAddressDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyMapBuild" ADD CONSTRAINT "CompanyMapBuild_addressDatasetId_fkey"
  FOREIGN KEY ("addressDatasetId") REFERENCES "OfficialAddressDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyMapPublication" ADD CONSTRAINT "CompanyMapPublication_buildId_fkey"
  FOREIGN KEY ("buildId") REFERENCES "CompanyMapBuild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyMapEntitySnapshot" ADD CONSTRAINT "CompanyMapEntitySnapshot_buildId_fkey"
  FOREIGN KEY ("buildId") REFERENCES "CompanyMapBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyMapFinancialSnapshot" ADD CONSTRAINT "CompanyMapFinancialSnapshot_buildId_fkey"
  FOREIGN KEY ("buildId") REFERENCES "CompanyMapBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
