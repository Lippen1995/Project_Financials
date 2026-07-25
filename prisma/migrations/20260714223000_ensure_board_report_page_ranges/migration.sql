-- On a clean database, BoardReportExtraction is created after the historical
-- page-range migration. Ensure the column once the table is guaranteed to
-- exist; IF NOT EXISTS keeps db-push-era databases compatible.
ALTER TABLE "BoardReportExtraction"
    ADD COLUMN IF NOT EXISTS "pageRanges" JSONB NOT NULL DEFAULT '[]';
