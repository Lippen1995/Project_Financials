-- CreateEnum
CREATE TYPE "AppRole" AS ENUM ('USER', 'ADMIN', 'FINANCIAL_REVIEWER');

-- CreateEnum
CREATE TYPE "AnnualReportReviewDecisionType" AS ENUM ('ACCEPTED', 'CORRECTED', 'REJECTED', 'REPROCESS_REQUESTED', 'UNREADABLE');

-- CreateEnum
CREATE TYPE "PdfTrainingLabelType" AS ENUM ('DOCUMENT_CLASS', 'PAGE_SECTION', 'UNIT_SCALE', 'YEAR_COLUMN', 'FACT_VALUE', 'STATEMENT_ROW', 'BOARD_REPORT_TEXT', 'AUDITOR_REPORT_TEXT', 'AUDITOR_OPINION', 'PARSER_ROUTE', 'FAILURE_REASON', 'WIDE_NUMBER_RECONSTRUCTION');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "appRole" "AppRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "AnnualReportReviewDecision" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "extractionRunId" TEXT,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "decisionType" "AnnualReportReviewDecisionType" NOT NULL,
    "beforePayload" JSONB,
    "afterPayload" JSONB,
    "correctionNotes" TEXT,
    "validationPassed" BOOLEAN,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnualReportReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfTrainingLabel" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "extractionRunId" TEXT,
    "reviewId" TEXT,
    "reviewerUserId" TEXT NOT NULL,
    "labelType" "PdfTrainingLabelType" NOT NULL,
    "targetRef" JSONB,
    "proposedValue" JSONB,
    "acceptedValue" JSONB,
    "sourcePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdfTrainingLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnnualReportReviewDecision_reviewId_createdAt_idx" ON "AnnualReportReviewDecision"("reviewId", "createdAt");

-- CreateIndex
CREATE INDEX "AnnualReportReviewDecision_filingId_createdAt_idx" ON "AnnualReportReviewDecision"("filingId", "createdAt");

-- CreateIndex
CREATE INDEX "AnnualReportReviewDecision_reviewerUserId_createdAt_idx" ON "AnnualReportReviewDecision"("reviewerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PdfTrainingLabel_filingId_labelType_idx" ON "PdfTrainingLabel"("filingId", "labelType");

-- CreateIndex
CREATE INDEX "PdfTrainingLabel_extractionRunId_labelType_idx" ON "PdfTrainingLabel"("extractionRunId", "labelType");

-- CreateIndex
CREATE INDEX "PdfTrainingLabel_reviewerUserId_createdAt_idx" ON "PdfTrainingLabel"("reviewerUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "AnnualReportReviewDecision" ADD CONSTRAINT "AnnualReportReviewDecision_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "AnnualReportReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualReportReviewDecision" ADD CONSTRAINT "AnnualReportReviewDecision_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfTrainingLabel" ADD CONSTRAINT "PdfTrainingLabel_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
