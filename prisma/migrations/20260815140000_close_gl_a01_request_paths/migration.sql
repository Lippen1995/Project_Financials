-- GL-A01: user-facing requests read local state; scheduled workers populate it.

CREATE TABLE "CompanyAnnouncementFetchState" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "unavailableReason" TEXT,
    "allAnnouncementsUrl" TEXT,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL,
    "nextCheckAt" TIMESTAMP(3) NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "announcementCount" INTEGER NOT NULL DEFAULT 0,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyAnnouncementFetchState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SsbClassificationCode" (
    "id" TEXT NOT NULL,
    "classificationId" TEXT NOT NULL,
    "datasetVersion" TEXT NOT NULL,
    "validAt" DATE NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "parentCode" TEXT,
    "level" TEXT,
    "notes" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SsbClassificationCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SsbClassificationSyncState" (
    "id" TEXT NOT NULL,
    "classificationId" TEXT NOT NULL,
    "datasetVersion" TEXT,
    "validAt" DATE,
    "status" TEXT NOT NULL,
    "codeCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL,
    "nextCheckAt" TIMESTAMP(3) NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SsbClassificationSyncState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSearchJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "analysisId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "errorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiSearchJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyAnnouncementFetchState_companyId_key" ON "CompanyAnnouncementFetchState"("companyId");
CREATE INDEX "CompanyAnnouncementFetchState_status_nextCheckAt_idx" ON "CompanyAnnouncementFetchState"("status", "nextCheckAt");
CREATE INDEX "CompanyAnnouncementFetchState_nextCheckAt_idx" ON "CompanyAnnouncementFetchState"("nextCheckAt");

CREATE UNIQUE INDEX "SsbClassificationCode_classificationId_code_key" ON "SsbClassificationCode"("classificationId", "code");
CREATE INDEX "SsbClassificationCode_classificationId_name_idx" ON "SsbClassificationCode"("classificationId", "name");
CREATE INDEX "SsbClassificationCode_classificationId_parentCode_idx" ON "SsbClassificationCode"("classificationId", "parentCode");
CREATE INDEX "SsbClassificationCode_datasetVersion_idx" ON "SsbClassificationCode"("datasetVersion");

CREATE UNIQUE INDEX "SsbClassificationSyncState_classificationId_key" ON "SsbClassificationSyncState"("classificationId");
CREATE INDEX "SsbClassificationSyncState_status_nextCheckAt_idx" ON "SsbClassificationSyncState"("status", "nextCheckAt");

CREATE INDEX "AiSearchJob_status_nextAttemptAt_idx" ON "AiSearchJob"("status", "nextAttemptAt");
CREATE INDEX "AiSearchJob_userId_createdAt_idx" ON "AiSearchJob"("userId", "createdAt");

ALTER TABLE "CompanyAnnouncementFetchState"
  ADD CONSTRAINT "CompanyAnnouncementFetchState_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiSearchJob"
  ADD CONSTRAINT "AiSearchJob_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
