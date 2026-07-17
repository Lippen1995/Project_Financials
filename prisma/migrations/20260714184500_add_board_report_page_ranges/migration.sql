ALTER TABLE "BoardReportExtraction"
ADD COLUMN "pageRanges" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "AnnualReportNarrative"
ADD COLUMN "pageRanges" JSONB;
