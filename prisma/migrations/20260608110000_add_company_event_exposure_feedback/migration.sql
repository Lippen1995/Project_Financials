CREATE TABLE "CompanyEventExposureFeedback" (
    "id" TEXT NOT NULL,
    "exposureId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "relevanceScore" DOUBLE PRECISION NOT NULL,
    "investorValueScore" DOUBLE PRECISION NOT NULL,
    "label" "NewsFeedbackLabel" NOT NULL,
    "previousValue" JSONB,
    "correctedValue" JSONB,
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyEventExposureFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompanyEventExposureFeedback_exposureId_reviewedAt_idx"
ON "CompanyEventExposureFeedback"("exposureId", "reviewedAt" DESC);

CREATE INDEX "CompanyEventExposureFeedback_userId_reviewedAt_idx"
ON "CompanyEventExposureFeedback"("userId", "reviewedAt" DESC);

CREATE INDEX "CompanyEventExposureFeedback_label_reviewedAt_idx"
ON "CompanyEventExposureFeedback"("label", "reviewedAt" DESC);

ALTER TABLE "CompanyEventExposureFeedback"
ADD CONSTRAINT "CompanyEventExposureFeedback_exposureId_fkey"
FOREIGN KEY ("exposureId") REFERENCES "CompanyEventExposure"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyEventExposureFeedback"
ADD CONSTRAINT "CompanyEventExposureFeedback_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
