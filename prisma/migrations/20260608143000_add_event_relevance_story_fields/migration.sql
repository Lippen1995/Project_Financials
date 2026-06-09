ALTER TABLE "CompanyEvent"
ADD COLUMN "relevanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "routineDisclosure" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "storyKey" TEXT;

CREATE INDEX "CompanyEvent_companyId_storyKey_lastSeen_idx"
ON "CompanyEvent"("companyId", "storyKey", "lastSeen" DESC);
