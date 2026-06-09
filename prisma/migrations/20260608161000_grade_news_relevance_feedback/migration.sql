ALTER TABLE "NewsRelevanceFeedback"
ADD COLUMN "relevanceScore" INTEGER,
ADD COLUMN "investorValueScore" INTEGER,
ADD COLUMN "issueTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
