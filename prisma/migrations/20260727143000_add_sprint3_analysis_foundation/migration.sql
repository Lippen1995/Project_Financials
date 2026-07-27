CREATE TYPE "AnalysisWorkflow" AS ENUM (
  'MNA_SCREENING',
  'SOURCING',
  'COMPETITOR_ANALYSIS'
);

CREATE TYPE "AnalysisStatus" AS ENUM (
  'DRAFT',
  'IN_PROGRESS',
  'COMPLETED',
  'ARCHIVED'
);

CREATE TYPE "AnalysisWorklistType" AS ENUM (
  'LONGLIST',
  'SHORTLIST',
  'SOURCING',
  'PEER_SET'
);

CREATE TYPE "NjordFeedbackLabel" AS ENUM ('USEFUL', 'INCORRECT');

ALTER TABLE "AiSearchUsageEvent"
ADD COLUMN "estimatedCostNok" DECIMAL(12,4),
ADD COLUMN "durationMs" INTEGER,
ADD COLUMN "errorCode" TEXT;

CREATE TABLE "Analysis" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "workflow" "AnalysisWorkflow" NOT NULL,
  "status" "AnalysisStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "criteriaVersion" TEXT NOT NULL,
  "criteria" JSONB NOT NULL,
  "universeQueryVersion" TEXT NOT NULL,
  "universeQuery" JSONB NOT NULL,
  "calculationVersion" TEXT,
  "calculationConfig" JSONB,
  "sourceBasis" JSONB NOT NULL,
  "conclusion" JSONB,
  "followUp" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalysisWorklist" (
  "id" TEXT NOT NULL,
  "analysisId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "type" "AnalysisWorklistType" NOT NULL,
  "name" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "criteriaVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnalysisWorklist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalysisWorklistItem" (
  "id" TEXT NOT NULL,
  "worklistId" TEXT NOT NULL,
  "orgNumber" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "inclusionBasis" JSONB NOT NULL,
  "dataGaps" JSONB NOT NULL,
  "sourceBasis" JSONB NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnalysisWorklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NjordFeedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "analysisId" TEXT,
  "answerKey" TEXT NOT NULL,
  "label" "NjordFeedbackLabel" NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NjordFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Analysis_workspaceId_status_updatedAt_idx"
ON "Analysis"("workspaceId", "status", "updatedAt" DESC);
CREATE INDEX "Analysis_createdByUserId_createdAt_idx"
ON "Analysis"("createdByUserId", "createdAt" DESC);
CREATE INDEX "AnalysisWorklist_analysisId_type_updatedAt_idx"
ON "AnalysisWorklist"("analysisId", "type", "updatedAt" DESC);
CREATE UNIQUE INDEX "AnalysisWorklistItem_worklistId_orgNumber_key"
ON "AnalysisWorklistItem"("worklistId", "orgNumber");
CREATE UNIQUE INDEX "AnalysisWorklistItem_worklistId_sortOrder_key"
ON "AnalysisWorklistItem"("worklistId", "sortOrder");
CREATE INDEX "AnalysisWorklistItem_orgNumber_idx"
ON "AnalysisWorklistItem"("orgNumber");
CREATE UNIQUE INDEX "NjordFeedback_userId_answerKey_key"
ON "NjordFeedback"("userId", "answerKey");
CREATE INDEX "NjordFeedback_analysisId_createdAt_idx"
ON "NjordFeedback"("analysisId", "createdAt" DESC);
CREATE INDEX "NjordFeedback_label_createdAt_idx"
ON "NjordFeedback"("label", "createdAt" DESC);

ALTER TABLE "Analysis"
ADD CONSTRAINT "Analysis_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Analysis"
ADD CONSTRAINT "Analysis_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnalysisWorklist"
ADD CONSTRAINT "AnalysisWorklist_analysisId_fkey"
FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalysisWorklist"
ADD CONSTRAINT "AnalysisWorklist_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnalysisWorklistItem"
ADD CONSTRAINT "AnalysisWorklistItem_worklistId_fkey"
FOREIGN KEY ("worklistId") REFERENCES "AnalysisWorklist"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NjordFeedback"
ADD CONSTRAINT "NjordFeedback_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NjordFeedback"
ADD CONSTRAINT "NjordFeedback_analysisId_fkey"
FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
