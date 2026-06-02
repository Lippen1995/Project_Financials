CREATE TYPE "NewsFeedbackLabel" AS ENUM ('RELEVANT', 'NOT_RELEVANT', 'WEAK_RELEVANT');

ALTER TABLE "NewsArticleRelevance"
  ADD COLUMN "scoringRunId" TEXT,
  ADD COLUMN "candidateScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "primaryType" TEXT NOT NULL DEFAULT 'direct',
  ADD COLUMN "reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "evidence" JSONB,
  ADD COLUMN "engineVersion" TEXT NOT NULL DEFAULT 'local-v2',
  ADD COLUMN "featureVersion" TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN "scoreVersion" TEXT NOT NULL DEFAULT 'v1';

CREATE TABLE "NewsScoringRun" (
  "id" TEXT NOT NULL,
  "triggerSource" TEXT NOT NULL,
  "engineVersion" TEXT NOT NULL DEFAULT 'local-v2',
  "featureVersion" TEXT NOT NULL DEFAULT 'v1',
  "scoreVersion" TEXT NOT NULL DEFAULT 'v1',
  "articlesConsidered" INTEGER NOT NULL DEFAULT 0,
  "candidatePairs" INTEGER NOT NULL DEFAULT 0,
  "scoredPairs" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "NewsScoringRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewsArticleFeatureSet" (
  "id" TEXT NOT NULL,
  "newsArticleId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "scoringRunId" TEXT,
  "candidateReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "candidateScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "directMentionScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "aliasMentionScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "groupScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "peerScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "industryScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "macroScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ipScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sourceQualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "titleWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "summaryWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "freshnessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ambiguityPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "evidence" JSONB,
  "engineVersion" TEXT NOT NULL DEFAULT 'local-v2',
  "featureVersion" TEXT NOT NULL DEFAULT 'v1',
  "scoreVersion" TEXT NOT NULL DEFAULT 'v1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NewsArticleFeatureSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewsRelevanceFeedback" (
  "id" TEXT NOT NULL,
  "newsArticleId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "label" "NewsFeedbackLabel" NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NewsRelevanceFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsArticleFeatureSet_newsArticleId_companyId_key"
  ON "NewsArticleFeatureSet" ("newsArticleId", "companyId");

CREATE INDEX "NewsArticleFeatureSet_companyId_confidenceScore_idx"
  ON "NewsArticleFeatureSet" ("companyId", "confidenceScore" DESC);

CREATE INDEX "NewsArticleFeatureSet_companyId_updatedAt_idx"
  ON "NewsArticleFeatureSet" ("companyId", "updatedAt" DESC);

CREATE INDEX "NewsRelevanceFeedback_companyId_reviewedAt_idx"
  ON "NewsRelevanceFeedback" ("companyId", "reviewedAt" DESC);

CREATE INDEX "NewsRelevanceFeedback_newsArticleId_companyId_reviewedAt_idx"
  ON "NewsRelevanceFeedback" ("newsArticleId", "companyId", "reviewedAt" DESC);

CREATE INDEX "NewsScoringRun_createdAt_idx"
  ON "NewsScoringRun" ("createdAt" DESC);

ALTER TABLE "NewsArticleRelevance"
  ADD CONSTRAINT "NewsArticleRelevance_scoringRunId_fkey"
  FOREIGN KEY ("scoringRunId") REFERENCES "NewsScoringRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NewsArticleFeatureSet"
  ADD CONSTRAINT "NewsArticleFeatureSet_newsArticleId_fkey"
  FOREIGN KEY ("newsArticleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NewsArticleFeatureSet"
  ADD CONSTRAINT "NewsArticleFeatureSet_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NewsArticleFeatureSet"
  ADD CONSTRAINT "NewsArticleFeatureSet_scoringRunId_fkey"
  FOREIGN KEY ("scoringRunId") REFERENCES "NewsScoringRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NewsRelevanceFeedback"
  ADD CONSTRAINT "NewsRelevanceFeedback_newsArticleId_fkey"
  FOREIGN KEY ("newsArticleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NewsRelevanceFeedback"
  ADD CONSTRAINT "NewsRelevanceFeedback_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NewsRelevanceFeedback"
  ADD CONSTRAINT "NewsRelevanceFeedback_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
