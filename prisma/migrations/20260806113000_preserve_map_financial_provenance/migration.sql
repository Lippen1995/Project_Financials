CREATE VIEW "reported_financial_statement_provenance_v1" AS
SELECT
  statement."id" AS "reportedStatementId",
  statement."sourceSystem" AS "reportedSourceSystem",
  statement."sourceId" AS "reportedSourceId",
  statement."sourceFilingId" AS "sourceFilingId",
  statement."publishedAt" AS "publishedAt",
  statement."fetchedAt" AS "financialFetchedAt",
  statement."normalizedAt" AS "financialNormalizedAt"
FROM "FinancialStatement" statement;

ALTER TABLE "CompanyMapFinancialSnapshot"
  ADD COLUMN "preTaxProfitStatus" TEXT,
  ADD COLUMN "reportedStatementId" TEXT,
  ADD COLUMN "reportedSourceSystem" TEXT,
  ADD COLUMN "reportedSourceId" TEXT,
  ADD COLUMN "sourceFilingId" TEXT,
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "financialFetchedAt" TIMESTAMP(3),
  ADD COLUMN "financialNormalizedAt" TIMESTAMP(3);

UPDATE "CompanyMapFinancialSnapshot" snapshot
SET
  "preTaxProfitStatus" = CASE
    WHEN snapshot."preTaxProfit" IS NULL THEN 'MISSING'
    ELSE 'AVAILABLE'
  END,
  "reportedStatementId" = statement."id",
  "reportedSourceSystem" = statement."sourceSystem",
  "reportedSourceId" = statement."sourceId",
  "sourceFilingId" = statement."sourceFilingId",
  "publishedAt" = statement."publishedAt",
  "financialFetchedAt" = statement."fetchedAt",
  "financialNormalizedAt" = statement."normalizedAt"
FROM "FinancialStatement" statement
JOIN "Company" company ON company."id" = statement."companyId"
WHERE company."orgNumber" = snapshot."orgNumber"
  AND statement."fiscalYear" = snapshot."fiscalYear"
  AND statement."statementScope" = snapshot."statementScope";

ALTER TABLE "CompanyMapFinancialSnapshot"
  ALTER COLUMN "preTaxProfitStatus" SET NOT NULL,
  ALTER COLUMN "reportedStatementId" SET NOT NULL,
  ALTER COLUMN "reportedSourceSystem" SET NOT NULL,
  ALTER COLUMN "reportedSourceId" SET NOT NULL,
  ALTER COLUMN "financialFetchedAt" SET NOT NULL,
  ALTER COLUMN "financialNormalizedAt" SET NOT NULL,
  ADD CONSTRAINT "company_map_pre_tax_profit_quality" CHECK (
    "preTaxProfitStatus" IN ('AVAILABLE', 'MISSING', 'AMBIGUOUS')
    AND (
      ("preTaxProfitStatus" = 'AVAILABLE' AND "preTaxProfit" IS NOT NULL)
      OR ("preTaxProfitStatus" <> 'AVAILABLE' AND "preTaxProfit" IS NULL)
    )
  );
