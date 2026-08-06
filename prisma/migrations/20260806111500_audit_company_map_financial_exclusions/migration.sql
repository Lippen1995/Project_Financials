ALTER TABLE "CompanyMapFinancialDatasetPublication"
  ADD COLUMN "sourceStatementCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "excludedStatementCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "excludedEntityCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "CompanyMapFinancialDatasetPublication"
  ALTER COLUMN "sourceStatementCount" DROP DEFAULT,
  ALTER COLUMN "excludedStatementCount" DROP DEFAULT,
  ALTER COLUMN "excludedEntityCount" DROP DEFAULT;

ALTER TABLE "CompanyMapFinancialDatasetPublication"
  ADD CONSTRAINT "company_map_financial_exclusion_audit" CHECK (
    "sourceStatementCount" = "statementCount" + "excludedStatementCount"
    AND "excludedStatementCount" >= 0
    AND "excludedEntityCount" >= 0
    AND "excludedEntityCount" <= "excludedStatementCount"
  );
