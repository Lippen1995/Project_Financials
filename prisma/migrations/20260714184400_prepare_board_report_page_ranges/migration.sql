-- The historical page-range migration predates the versioned create-table
-- migration. On a clean replay only, provide a marked placeholder so that the
-- immutable historical migration can run. Existing databases already have the
-- real table and therefore never receive the marker.
DO $$
BEGIN
    IF to_regclass('"BoardReportExtraction"') IS NULL THEN
        CREATE TABLE "_MigrationBoardReportExtractionPlaceholder" (
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE "BoardReportExtraction" (
            "id" TEXT NOT NULL,
            CONSTRAINT "BoardReportExtraction_pkey" PRIMARY KEY ("id")
        );
    END IF;
END
$$;
