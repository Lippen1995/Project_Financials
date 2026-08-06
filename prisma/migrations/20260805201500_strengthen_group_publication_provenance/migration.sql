ALTER TYPE "GroupMembershipStatus" ADD VALUE 'UNKNOWN' AFTER 'RESOLVED';

ALTER TABLE "OwnershipEdge"
  ADD COLUMN "sourceImportId" TEXT;

ALTER TABLE "GroupRelationshipPublication"
  ADD COLUMN "sourceImportId" TEXT,
  ADD COLUMN "membershipCount" INTEGER NOT NULL DEFAULT 0;

-- Existing publications predate exact source-import binding. They cannot be proven and must not
-- survive the stricter publication contract; the raw official holdings remain untouched.
DELETE FROM "GroupMembershipSnapshot";
DELETE FROM "GroupRelationshipSnapshot";
DELETE FROM "GroupRelationshipPublication";

ALTER TABLE "GroupRelationshipPublication"
  ALTER COLUMN "sourceImportId" SET NOT NULL,
  ALTER COLUMN "membershipCount" DROP DEFAULT;
