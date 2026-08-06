ALTER TABLE "GroupRelationshipSnapshot"
  ADD COLUMN "ownerMetadataSourceSystem" TEXT,
  ADD COLUMN "ownerMetadataSourceEntityType" TEXT,
  ADD COLUMN "ownerMetadataSourceId" TEXT,
  ADD COLUMN "ownerMetadataFetchedAt" TIMESTAMP(3),
  ADD COLUMN "ownerMetadataNormalizedAt" TIMESTAMP(3),
  ADD COLUMN "issuerMetadataSourceSystem" TEXT,
  ADD COLUMN "issuerMetadataSourceEntityType" TEXT,
  ADD COLUMN "issuerMetadataSourceId" TEXT,
  ADD COLUMN "issuerMetadataFetchedAt" TIMESTAMP(3),
  ADD COLUMN "issuerMetadataNormalizedAt" TIMESTAMP(3);
