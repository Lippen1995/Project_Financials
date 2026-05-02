-- AlterEnum: add PUBLISHED_FROM_REVIEW
-- NOTE: PostgreSQL ALTER TYPE ADD VALUE cannot run inside a transaction block.
ALTER TYPE "AnnualReportReviewDecisionType" ADD VALUE 'PUBLISHED_FROM_REVIEW';

-- CreateEnum
CREATE TYPE "ReviewedFactCorrectionSource" AS ENUM ('ACCEPTED_MACHINE', 'MANUAL_CORRECTION');

-- CreateTable
CREATE TABLE "AnnualReportReviewedFact" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "extractionRunId" TEXT,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "metricKey" TEXT NOT NULL,
    "statementType" "FinancialFactStatementType" NOT NULL,
    "value" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'NOK',
    "unitScale" INTEGER NOT NULL DEFAULT 1,
    "sourcePage" INTEGER,
    "rawLabel" TEXT,
    "correctionSource" "ReviewedFactCorrectionSource" NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnualReportReviewedFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnnualReportReviewedFact_reviewId_metricKey_key" ON "AnnualReportReviewedFact"("reviewId", "metricKey");

-- CreateIndex
CREATE INDEX "AnnualReportReviewedFact_reviewId_metricKey_idx" ON "AnnualReportReviewedFact"("reviewId", "metricKey");

-- CreateIndex
CREATE INDEX "AnnualReportReviewedFact_companyId_fiscalYear_metricKey_idx" ON "AnnualReportReviewedFact"("companyId", "fiscalYear", "metricKey");

-- AddForeignKey
ALTER TABLE "AnnualReportReviewedFact" ADD CONSTRAINT "AnnualReportReviewedFact_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "AnnualReportReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualReportReviewedFact" ADD CONSTRAINT "AnnualReportReviewedFact_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "AnnualReportFiling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualReportReviewedFact" ADD CONSTRAINT "AnnualReportReviewedFact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualReportReviewedFact" ADD CONSTRAINT "AnnualReportReviewedFact_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
