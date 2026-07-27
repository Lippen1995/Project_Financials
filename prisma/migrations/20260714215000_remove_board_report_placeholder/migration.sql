-- Remove only the clean-replay placeholder created by
-- 20260714184400_prepare_board_report_page_ranges. A db-push-era database has
-- no marker, so its real BoardReportExtraction table is left untouched.
DO $$
BEGIN
    IF to_regclass('"_MigrationBoardReportExtractionPlaceholder"') IS NOT NULL THEN
        DROP TABLE "BoardReportExtraction";
        DROP TABLE "_MigrationBoardReportExtractionPlaceholder";
    END IF;
END
$$;
