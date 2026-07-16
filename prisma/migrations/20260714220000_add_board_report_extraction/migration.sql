CREATE TYPE "BoardReportExtractionStatus" AS ENUM (
  'EXTRACTED',
  'NOT_FOUND',
  'MANUAL_REVIEW',
  'UNREADABLE',
  'SOURCE_UNAVAILABLE',
  'FAILED'
);

CREATE TYPE "BoardReportReviewStatus" AS ENUM (
  'NOT_REQUIRED',
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'CORRECTED'
);

ALTER TYPE "AnnualReportArtifactType" ADD VALUE 'BOARD_REPORT_EXTRACTION_JSON';
ALTER TYPE "AnnualReportArtifactType" ADD VALUE 'BOARD_REPORT_TEXT';
ALTER TYPE "AnnualReportArtifactType" ADD VALUE 'BOARD_REPORT_REVIEW_PDF';

ALTER TABLE "AnnualReportNarrative"
  ADD COLUMN "sourceExtractionId" TEXT;

CREATE TABLE "BoardReportExtraction" (
  "id" TEXT NOT NULL,
  "filingId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "status" "BoardReportExtractionStatus" NOT NULL,
  "reviewStatus" "BoardReportReviewStatus" NOT NULL DEFAULT 'PENDING',
  "title" TEXT,
  "text" TEXT,
  "normalizedText" TEXT,
  "textChecksum" TEXT,
  "pageStart" INTEGER,
  "pageEnd" INTEGER,
  "startBoundary" JSONB,
  "endBoundary" JSONB,
  "includedBlocks" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "quality" JSONB NOT NULL,
  "matchedStartSignals" JSONB NOT NULL,
  "matchedStopSignals" JSONB NOT NULL,
  "warnings" JSONB NOT NULL,
  "route" TEXT NOT NULL,
  "extractorVersion" TEXT NOT NULL,
  "parserVersion" TEXT,
  "sourceSystem" TEXT NOT NULL,
  "sourceEntityType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sourceDocumentHash" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "normalizedAt" TIMESTAMP(3) NOT NULL,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewReason" TEXT,
  "machineProposalId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BoardReportExtraction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoardReportExtraction_filingId_sourceDocumentHash_extractorVersion_key"
  ON "BoardReportExtraction"("filingId", "sourceDocumentHash", "extractorVersion");
CREATE INDEX "BoardReportExtraction_companyId_fiscalYear_status_idx"
  ON "BoardReportExtraction"("companyId", "fiscalYear", "status");
CREATE INDEX "BoardReportExtraction_filingId_createdAt_idx"
  ON "BoardReportExtraction"("filingId", "createdAt");
CREATE INDEX "BoardReportExtraction_reviewStatus_createdAt_idx"
  ON "BoardReportExtraction"("reviewStatus", "createdAt");
CREATE INDEX "BoardReportExtraction_sourceDocumentHash_extractorVersion_idx"
  ON "BoardReportExtraction"("sourceDocumentHash", "extractorVersion");
CREATE UNIQUE INDEX "AnnualReportNarrative_sourceExtractionId_key"
  ON "AnnualReportNarrative"("sourceExtractionId");

ALTER TABLE "BoardReportExtraction"
  ADD CONSTRAINT "BoardReportExtraction_filingId_fkey"
  FOREIGN KEY ("filingId") REFERENCES "AnnualReportFiling"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardReportExtraction"
  ADD CONSTRAINT "BoardReportExtraction_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardReportExtraction"
  ADD CONSTRAINT "BoardReportExtraction_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BoardReportExtraction"
  ADD CONSTRAINT "BoardReportExtraction_machineProposalId_fkey"
  FOREIGN KEY ("machineProposalId") REFERENCES "BoardReportExtraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnnualReportNarrative"
  ADD CONSTRAINT "AnnualReportNarrative_sourceExtractionId_fkey"
  FOREIGN KEY ("sourceExtractionId") REFERENCES "BoardReportExtraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
