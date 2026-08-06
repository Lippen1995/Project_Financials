ALTER TABLE "CompanyMapFinancialSnapshot"
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'NOK',
  ADD COLUMN "unitScale" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CompanyMapFinancialSnapshot" ALTER COLUMN "currency" DROP DEFAULT;

ALTER TABLE "CompanyMapFinancialSnapshot"
  ADD CONSTRAINT "company_map_financial_unit_scale" CHECK ("unitScale" = 1);

ALTER TABLE "CompanyMapFinancialDatasetPublication"
  ADD COLUMN "financialEntityCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "companyStatementCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "consolidatedStatementCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CompanyMapFinancialDatasetPublication"
  ALTER COLUMN "financialEntityCount" DROP DEFAULT,
  ALTER COLUMN "companyStatementCount" DROP DEFAULT,
  ALTER COLUMN "consolidatedStatementCount" DROP DEFAULT;

ALTER TABLE "CompanyMapFinancialDatasetPublication"
  ADD CONSTRAINT "company_map_financial_certificate_counts" CHECK (
    "status" <> 'VERIFIED_REPORTED'
    OR (
      "financialEntityCount" > 0
      AND "companyStatementCount" >= 0
      AND "consolidatedStatementCount" >= 0
      AND "companyStatementCount" + "consolidatedStatementCount" = "statementCount"
    )
  );

CREATE FUNCTION "bump_reported_financial_dataset_revision"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('fjord-insight-financial-dataset-publication'),
    0
  );
  INSERT INTO "FinancialDatasetRevision" ("id", "reportedRevision", "updatedAt")
  VALUES ('global', 1, CURRENT_TIMESTAMP)
  ON CONFLICT ("id") DO UPDATE
    SET "reportedRevision" = "FinancialDatasetRevision"."reportedRevision" + 1,
        "updatedAt" = CURRENT_TIMESTAMP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "financial_statement_bump_reported_revision"
AFTER INSERT OR UPDATE OR DELETE ON "FinancialStatement"
FOR EACH STATEMENT EXECUTE FUNCTION "bump_reported_financial_dataset_revision"();

CREATE TRIGGER "financial_line_item_bump_reported_revision"
AFTER INSERT OR UPDATE OR DELETE ON "FinancialLineItem"
FOR EACH STATEMENT EXECUTE FUNCTION "bump_reported_financial_dataset_revision"();

CREATE FUNCTION "validate_company_map_financial_certificate"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  candidate "CompanyMapBuild"%ROWTYPE;
  actual_statement_count BIGINT;
  actual_financial_entity_count BIGINT;
  actual_company_statement_count BIGINT;
  actual_consolidated_statement_count BIGINT;
  actual_metric_count BIGINT;
  invalid_row_count BIGINT;
BEGIN
  IF NEW."status" <> 'VERIFIED_REPORTED' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO candidate FROM "CompanyMapBuild" WHERE "id" = NEW."buildId";
  IF NOT FOUND OR candidate."financialDatasetVersion" <> NEW."financialDatasetVersion" THEN
    RAISE EXCEPTION 'Financial certificate dataset does not match its company-map build';
  END IF;

  SELECT
    count(*)::bigint,
    count(DISTINCT financial."orgNumber")::bigint,
    count(*) FILTER (WHERE financial."statementScope" = 'COMPANY')::bigint,
    count(*) FILTER (WHERE financial."statementScope" = 'CONSOLIDATED')::bigint,
    sum(
      (financial."revenue" IS NOT NULL)::integer
      + (financial."ebit" IS NOT NULL)::integer
      + (financial."preTaxProfit" IS NOT NULL)::integer
      + (financial."netIncome" IS NOT NULL)::integer
      + (financial."equity" IS NOT NULL)::integer
      + (financial."totalAssets" IS NOT NULL)::integer
    )::bigint,
    count(*) FILTER (
      WHERE financial."valueOrigin" <> 'reported'
        OR financial."financialDatasetVersion" <> NEW."financialDatasetVersion"
    )::bigint
  INTO
    actual_statement_count,
    actual_financial_entity_count,
    actual_company_statement_count,
    actual_consolidated_statement_count,
    actual_metric_count,
    invalid_row_count
  FROM "CompanyMapFinancialSnapshot" financial
  WHERE financial."buildId" = NEW."buildId";

  IF invalid_row_count <> 0
    OR actual_statement_count <> NEW."statementCount"
    OR actual_financial_entity_count <> NEW."financialEntityCount"
    OR actual_company_statement_count <> NEW."companyStatementCount"
    OR actual_consolidated_statement_count <> NEW."consolidatedStatementCount"
    OR actual_metric_count <> NEW."metricCount" THEN
    RAISE EXCEPTION 'Financial certificate counts do not match the reported map snapshot';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "company_map_financial_certificate_invariants"
BEFORE INSERT OR UPDATE ON "CompanyMapFinancialDatasetPublication"
FOR EACH ROW EXECUTE FUNCTION "validate_company_map_financial_certificate"();
