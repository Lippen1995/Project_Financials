CREATE TYPE "GroupMembershipStatus" AS ENUM ('RESOLVED', 'CONFLICT');

CREATE TABLE "GroupMembershipSnapshot" (
  "buildId" UUID NOT NULL,
  "taxYear" INTEGER NOT NULL,
  "memberOrgNumber" VARCHAR(9) NOT NULL,
  "directParentOrgNumber" VARCHAR(9),
  "groupRootOrgNumber" VARCHAR(9) NOT NULL,
  "depth" INTEGER NOT NULL,
  "path" TEXT[],
  "status" "GroupMembershipStatus" NOT NULL,
  "ruleVersion" TEXT NOT NULL,
  "ownershipAsOf" TIMESTAMP(3) NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "sourceEntityType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "normalizedAt" TIMESTAMP(3) NOT NULL,
  "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GroupMembershipSnapshot_pkey"
    PRIMARY KEY ("buildId", "taxYear", "memberOrgNumber")
);

CREATE INDEX "grp_member_by_root"
  ON "GroupMembershipSnapshot"("buildId", "taxYear", "groupRootOrgNumber");

CREATE INDEX "GroupMembershipSnapshot_taxYear_memberOrgNumber_idx"
  ON "GroupMembershipSnapshot"("taxYear", "memberOrgNumber");
