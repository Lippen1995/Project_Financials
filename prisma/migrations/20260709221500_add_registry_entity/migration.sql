-- Version the local Brreg entity mirror that was previously created through
-- the development db-push path. IF NOT EXISTS lets drifted development
-- databases adopt the migration without recreating the table.
CREATE TABLE IF NOT EXISTS "RegistryEntity" (
    "id" TEXT NOT NULL,
    "orgNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organisationForm" TEXT,
    "naceCode" TEXT,
    "naceDescription" TEXT,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "employeeCount" INTEGER,
    "registeredAt" TIMESTAMP(3),
    "website" TEXT,
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

    CONSTRAINT "RegistryEntity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RegistryEntity_orgNumber_key"
    ON "RegistryEntity"("orgNumber");
CREATE INDEX IF NOT EXISTS "RegistryEntity_name_idx"
    ON "RegistryEntity"("name");
CREATE INDEX IF NOT EXISTS "RegistryEntity_naceCode_idx"
    ON "RegistryEntity"("naceCode");
CREATE INDEX IF NOT EXISTS "RegistryEntity_status_idx"
    ON "RegistryEntity"("status");
CREATE INDEX IF NOT EXISTS "RegistryEntity_municipalityNumber_idx"
    ON "RegistryEntity"("municipalityNumber");
