ALTER TABLE "GroupRelationshipPublication"
  ALTER COLUMN "sourceImportStatus" DROP DEFAULT,
  ALTER COLUMN "sourceImportStatus" DROP NOT NULL,
  ALTER COLUMN "sourceImportStatus" TYPE "ShareholderRegisterImportStatus"
    USING NULLIF("sourceImportStatus", 'UNKNOWN')::"ShareholderRegisterImportStatus";
