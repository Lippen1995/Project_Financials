-- Add category to NewsArticle
ALTER TABLE "NewsArticle" ADD COLUMN "category" TEXT;

-- Create NewsArticleRelevance table
CREATE TABLE "NewsArticleRelevance" (
    "id"              TEXT NOT NULL,
    "newsArticleId"   TEXT NOT NULL,
    "companyId"       TEXT NOT NULL,
    "totalScore"      DOUBLE PRECISION NOT NULL,
    "directScore"     DOUBLE PRECISION NOT NULL,
    "sectorScore"     DOUBLE PRECISION NOT NULL,
    "macroScore"      DOUBLE PRECISION NOT NULL,
    "competitorScore" DOUBLE PRECISION NOT NULL,
    "reasoning"       TEXT,
    "tags"            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "scoredBy"        TEXT NOT NULL,
    "scoredAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsArticleRelevance_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one relevance score per article per company
ALTER TABLE "NewsArticleRelevance"
    ADD CONSTRAINT "NewsArticleRelevance_newsArticleId_companyId_key"
    UNIQUE ("newsArticleId", "companyId");

-- Indexes for fast company news lookup
CREATE INDEX "NewsArticleRelevance_companyId_totalScore_idx"
    ON "NewsArticleRelevance" ("companyId", "totalScore" DESC);

CREATE INDEX "NewsArticleRelevance_companyId_scoredAt_idx"
    ON "NewsArticleRelevance" ("companyId", "scoredAt" DESC);

-- Foreign keys
ALTER TABLE "NewsArticleRelevance"
    ADD CONSTRAINT "NewsArticleRelevance_newsArticleId_fkey"
    FOREIGN KEY ("newsArticleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NewsArticleRelevance"
    ADD CONSTRAINT "NewsArticleRelevance_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
