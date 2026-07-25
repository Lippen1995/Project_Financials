-- The model was introduced before its migration was checked in. Keep this
-- migration idempotent so databases that received the table through the
-- former development `db push` path can adopt the versioned history safely.
CREATE TABLE IF NOT EXISTS "PublishedFinancialLineItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "statementType" "FinancialFactStatementType" NOT NULL,
    "statementScope" "StatementScope" NOT NULL DEFAULT 'COMPANY',
    "metricKey" TEXT NOT NULL,
    "rawLabel" TEXT,
    "value" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'NOK',
    "unitScale" INTEGER NOT NULL DEFAULT 1,
    "sourcePage" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "reviewId" TEXT,
    "reviewerUserId" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishedFinancialLineItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PublishedFinancialLineItem_companyId_fiscalYear_statementSc_idx"
    ON "PublishedFinancialLineItem"("companyId", "fiscalYear", "statementScope");
CREATE INDEX IF NOT EXISTS "PublishedFinancialLineItem_companyId_fiscalYear_statementTy_idx"
    ON "PublishedFinancialLineItem"("companyId", "fiscalYear", "statementType");
CREATE INDEX IF NOT EXISTS "PublishedFinancialLineItem_filingId_idx"
    ON "PublishedFinancialLineItem"("filingId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'PublishedFinancialLineItem_companyId_fkey'
          AND conrelid = '"PublishedFinancialLineItem"'::regclass
    ) THEN
        ALTER TABLE "PublishedFinancialLineItem"
            ADD CONSTRAINT "PublishedFinancialLineItem_companyId_fkey"
            FOREIGN KEY ("companyId") REFERENCES "Company"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'PublishedFinancialLineItem_filingId_fkey'
          AND conrelid = '"PublishedFinancialLineItem"'::regclass
    ) THEN
        ALTER TABLE "PublishedFinancialLineItem"
            ADD CONSTRAINT "PublishedFinancialLineItem_filingId_fkey"
            FOREIGN KEY ("filingId") REFERENCES "AnnualReportFiling"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;
