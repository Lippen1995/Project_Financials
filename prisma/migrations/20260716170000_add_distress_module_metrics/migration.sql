ALTER TABLE "DistressFinancialSnapshot"
ADD COLUMN "liquidityRatio" DECIMAL(8,2),
ADD COLUMN "fixedAssets" BIGINT,
ADD COLUMN "inventory" BIGINT,
ADD COLUMN "cash" BIGINT,
ADD COLUMN "revenueTrend" JSONB;

CREATE INDEX "DistressFinancialSnapshot_distressScore_idx" ON "DistressFinancialSnapshot"("distressScore");
