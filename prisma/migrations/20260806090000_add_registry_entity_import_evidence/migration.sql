CREATE TYPE "RegistryEntityImportStatus" AS ENUM ('COMPLETED', 'FAILED');

CREATE TABLE "RegistryEntityImport" (
  "id" UUID NOT NULL,
  "snapshotAt" TIMESTAMP(3) NOT NULL,
  "status" "RegistryEntityImportStatus" NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sourceMediaType" TEXT NOT NULL,
  "sourceArtifact" TEXT,
  "checksumSha256" TEXT NOT NULL,
  "byteCount" BIGINT NOT NULL,
  "rowCount" INTEGER NOT NULL,
  "isUnfiltered" BOOLEAN NOT NULL,
  "reachedEof" BOOLEAN NOT NULL,
  "failureReason" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "sourceEntityType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "normalizedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegistryEntityImport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "registry_entity_import_complete_evidence" CHECK (
    "status" <> 'COMPLETED'
    OR (
      "isUnfiltered" = true
      AND "reachedEof" = true
      AND "rowCount" > 0
      AND "byteCount" > 0
      AND length("checksumSha256") = 64
    )
  )
);

CREATE UNIQUE INDEX "RegistryEntityImport_snapshotAt_key"
  ON "RegistryEntityImport"("snapshotAt");
CREATE INDEX "RegistryEntityImport_status_completedAt_idx"
  ON "RegistryEntityImport"("status", "completedAt");

ALTER TABLE "CompanyMapBuild" ADD COLUMN "registryImportId" UUID;
CREATE INDEX "CompanyMapBuild_registryImportId_idx"
  ON "CompanyMapBuild"("registryImportId");
ALTER TABLE "CompanyMapBuild"
  ADD CONSTRAINT "CompanyMapBuild_registryImportId_fkey"
  FOREIGN KEY ("registryImportId") REFERENCES "RegistryEntityImport"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
