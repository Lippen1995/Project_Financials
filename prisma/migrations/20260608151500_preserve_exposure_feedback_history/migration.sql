ALTER TABLE "CompanyEventExposure"
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

DROP INDEX IF EXISTS "CompanyEventExposure_companyId_exposureScore_idx";

CREATE INDEX "CompanyEventExposure_companyId_active_exposureScore_idx"
ON "CompanyEventExposure"("companyId", "active", "exposureScore" DESC);
