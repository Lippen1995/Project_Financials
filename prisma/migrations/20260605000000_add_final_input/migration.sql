-- Explicit "Endelig" (final) value per reviewed/published line item.
-- finalInput is the reviewer's on-screen resolved value (manual ?? machine);
-- publishing sources the figure from finalInput, value mirrors it.
ALTER TABLE "AnnualReportReviewedFact" ADD COLUMN "finalInput" BIGINT;
ALTER TABLE "PublishedFinancialLineItem" ADD COLUMN "finalInput" BIGINT;

-- Backfill existing rows so readers/validation never see null.
UPDATE "AnnualReportReviewedFact" SET "finalInput" = "value" WHERE "finalInput" IS NULL;
UPDATE "PublishedFinancialLineItem" SET "finalInput" = "value" WHERE "finalInput" IS NULL;
