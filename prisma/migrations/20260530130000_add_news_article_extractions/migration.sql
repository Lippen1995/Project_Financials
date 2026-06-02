CREATE TABLE "NewsArticleExtraction" (
  "id" TEXT NOT NULL,
  "newsArticleId" TEXT NOT NULL,
  "extractor" TEXT NOT NULL,
  "extractionStatus" TEXT NOT NULL,
  "title" TEXT,
  "lead" TEXT,
  "mainText" TEXT,
  "language" TEXT,
  "authors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "imageUrl" TEXT,
  "sourceDomain" TEXT,
  "publishedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "sourceSystem" TEXT NOT NULL,
  "sourceEntityType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "normalizedAt" TIMESTAMP(3) NOT NULL,
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NewsArticleExtraction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsArticleExtraction_newsArticleId_key"
  ON "NewsArticleExtraction" ("newsArticleId");

CREATE INDEX "NewsArticleExtraction_extractionStatus_updatedAt_idx"
  ON "NewsArticleExtraction" ("extractionStatus", "updatedAt" DESC);

CREATE INDEX "NewsArticleExtraction_sourceSystem_sourceEntityType_idx"
  ON "NewsArticleExtraction" ("sourceSystem", "sourceEntityType");

ALTER TABLE "NewsArticleExtraction"
  ADD CONSTRAINT "NewsArticleExtraction_newsArticleId_fkey"
  FOREIGN KEY ("newsArticleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
