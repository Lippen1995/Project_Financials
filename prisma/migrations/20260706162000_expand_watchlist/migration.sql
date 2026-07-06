CREATE TYPE "WorkspaceWatchIntensity" AS ENUM ('HIGH_ONLY', 'BALANCED', 'BROAD');

ALTER TABLE "WorkspaceWatch"
ADD COLUMN "intensity" "WorkspaceWatchIntensity" NOT NULL DEFAULT 'BALANCED';

CREATE TABLE "WorkspaceIndustryWatch" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "industryCodePrefix" TEXT NOT NULL,
  "title" TEXT,
  "status" "WorkspaceWatchStatus" NOT NULL DEFAULT 'ACTIVE',
  "intensity" "WorkspaceWatchIntensity" NOT NULL DEFAULT 'BALANCED',
  "unsupportedReason" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkspaceIndustryWatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceWatchGroup" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "status" "WorkspaceWatchStatus" NOT NULL DEFAULT 'ACTIVE',
  "intensity" "WorkspaceWatchIntensity" NOT NULL DEFAULT 'BALANCED',
  "matchLimit" INTEGER NOT NULL DEFAULT 50,
  "unsupportedReason" TEXT,
  "archivedAt" TIMESTAMP(3),
  "refreshedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkspaceWatchGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceWatchGroupMember" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkspaceWatchGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceIndustryWatch_workspaceId_industryCodePrefix_key"
ON "WorkspaceIndustryWatch"("workspaceId", "industryCodePrefix");

CREATE INDEX "WorkspaceIndustryWatch_workspaceId_status_idx"
ON "WorkspaceIndustryWatch"("workspaceId", "status");

CREATE INDEX "WorkspaceWatchGroup_workspaceId_status_idx"
ON "WorkspaceWatchGroup"("workspaceId", "status");

CREATE INDEX "WorkspaceWatchGroup_workspaceId_query_idx"
ON "WorkspaceWatchGroup"("workspaceId", "query");

CREATE UNIQUE INDEX "WorkspaceWatchGroupMember_groupId_companyId_key"
ON "WorkspaceWatchGroupMember"("groupId", "companyId");

CREATE INDEX "WorkspaceWatchGroupMember_companyId_idx"
ON "WorkspaceWatchGroupMember"("companyId");

ALTER TABLE "WorkspaceIndustryWatch"
ADD CONSTRAINT "WorkspaceIndustryWatch_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceWatchGroup"
ADD CONSTRAINT "WorkspaceWatchGroup_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceWatchGroupMember"
ADD CONSTRAINT "WorkspaceWatchGroupMember_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "WorkspaceWatchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceWatchGroupMember"
ADD CONSTRAINT "WorkspaceWatchGroupMember_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
