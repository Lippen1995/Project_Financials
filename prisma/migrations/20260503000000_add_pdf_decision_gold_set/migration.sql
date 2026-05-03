-- CreateEnum
CREATE TYPE "PdfDecisionGoldSetStatus" AS ENUM ('CANDIDATE', 'APPROVED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "PdfDecisionGoldSetReason" AS ENUM ('LOW_RISK_FAILED', 'HIGH_RISK_SUCCEEDED', 'MANUAL_CORRECTION', 'UNREADABLE', 'REPROCESS_REQUESTED', 'BALANCE_MISMATCH', 'ROUTE_MISMATCH', 'OCR_RISK', 'REPRESENTATIVE_SAMPLE', 'OTHER');

-- CreateTable
CREATE TABLE "PdfDecisionGoldSetItem" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "extractionRunId" TEXT,
    "orgNumber" TEXT,
    "fiscalYear" INTEGER,
    "status" "PdfDecisionGoldSetStatus" NOT NULL DEFAULT 'CANDIDATE',
    "reason" "PdfDecisionGoldSetReason" NOT NULL DEFAULT 'OTHER',
    "note" TEXT,
    "decisionRoute" TEXT,
    "riskLevel" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "outcome" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ADMIN',
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfDecisionGoldSetItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PdfDecisionGoldSetItem_filingId_key" ON "PdfDecisionGoldSetItem"("filingId");

-- CreateIndex
CREATE INDEX "PdfDecisionGoldSetItem_status_idx" ON "PdfDecisionGoldSetItem"("status");

-- CreateIndex
CREATE INDEX "PdfDecisionGoldSetItem_reason_idx" ON "PdfDecisionGoldSetItem"("reason");

-- CreateIndex
CREATE INDEX "PdfDecisionGoldSetItem_orgNumber_fiscalYear_idx" ON "PdfDecisionGoldSetItem"("orgNumber", "fiscalYear");

-- CreateIndex
CREATE INDEX "PdfDecisionGoldSetItem_decisionRoute_riskLevel_idx" ON "PdfDecisionGoldSetItem"("decisionRoute", "riskLevel");

-- AddForeignKey
ALTER TABLE "PdfDecisionGoldSetItem" ADD CONSTRAINT "PdfDecisionGoldSetItem_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "AnnualReportFiling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfDecisionGoldSetItem" ADD CONSTRAINT "PdfDecisionGoldSetItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfDecisionGoldSetItem" ADD CONSTRAINT "PdfDecisionGoldSetItem_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

