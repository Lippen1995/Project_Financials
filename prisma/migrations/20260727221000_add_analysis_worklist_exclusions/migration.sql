ALTER TABLE "AnalysisWorklist"
ADD COLUMN "universeResultVersion" TEXT,
ADD COLUMN "screeningVersion" TEXT,
ADD COLUMN "rankingVersion" TEXT,
ADD COLUMN "evaluatedCount" INTEGER,
ADD COLUMN "includedCount" INTEGER,
ADD COLUMN "excludedCount" INTEGER,
ADD COLUMN "truncatedCount" INTEGER,
ADD COLUMN "universeExecutedAt" TIMESTAMP(3);

CREATE TABLE "AnalysisWorklistExclusion" (
  "id" TEXT NOT NULL,
  "worklistId" TEXT NOT NULL,
  "orgNumber" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "reasons" JSONB NOT NULL,
  "sourceBasis" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnalysisWorklistExclusion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalysisWorklistExclusion_worklistId_orgNumber_key"
ON "AnalysisWorklistExclusion"("worklistId", "orgNumber");

CREATE INDEX "AnalysisWorklistExclusion_worklistId_orgNumber_idx"
ON "AnalysisWorklistExclusion"("worklistId", "orgNumber");

CREATE INDEX "AnalysisWorklistExclusion_orgNumber_idx"
ON "AnalysisWorklistExclusion"("orgNumber");

ALTER TABLE "AnalysisWorklistExclusion"
ADD CONSTRAINT "AnalysisWorklistExclusion_worklistId_fkey"
FOREIGN KEY ("worklistId") REFERENCES "AnalysisWorklist"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
