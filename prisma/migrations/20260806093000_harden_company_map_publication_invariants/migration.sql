ALTER TABLE "CompanyMapFinancialDatasetPublication"
  ADD COLUMN "buildId" UUID NOT NULL;
ALTER TABLE "CompanyMapFinancialDatasetPublication"
  DROP CONSTRAINT "CompanyMapFinancialDatasetPublication_pkey";
ALTER TABLE "CompanyMapFinancialDatasetPublication"
  ADD CONSTRAINT "CompanyMapFinancialDatasetPublication_pkey" PRIMARY KEY ("buildId");
CREATE INDEX "CompanyMapFinancialDatasetPublication_financialDatasetVersion_idx"
  ON "CompanyMapFinancialDatasetPublication"("financialDatasetVersion");

CREATE OR REPLACE FUNCTION "validate_company_map_publication"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  candidate "CompanyMapBuild"%ROWTYPE;
  actual_entity_count BIGINT;
  actual_plotted_count BIGINT;
  actual_omitted_count BIGINT;
BEGIN
  SELECT * INTO candidate FROM "CompanyMapBuild" WHERE "id" = NEW."buildId";
  IF NOT FOUND OR candidate."status" <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'Company-map publication requires a PUBLISHED build';
  END IF;

  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE "resolutionStatus" = 'MATCHED')::bigint,
    count(*) FILTER (WHERE "resolutionStatus" <> 'MATCHED')::bigint
  INTO actual_entity_count, actual_plotted_count, actual_omitted_count
  FROM "CompanyMapEntitySnapshot"
  WHERE "buildId" = candidate."id";

  IF actual_entity_count <> candidate."entityCount"
    OR actual_plotted_count <> candidate."plottedCount"
    OR actual_omitted_count <> candidate."omittedCount" THEN
    RAISE EXCEPTION 'Company-map build counters do not match the immutable entity snapshot';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "RegistryEntityImport" registry_import
    WHERE registry_import."id" = candidate."registryImportId"
      AND registry_import."status" = 'COMPLETED'
      AND registry_import."isUnfiltered" = true
      AND registry_import."reachedEof" = true
      AND registry_import."rowCount" = candidate."entityCount"
  ) THEN
    RAISE EXCEPTION 'Company-map build has no matching complete Brreg import evidence';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "GroupRelationshipPublication" group_publication
    WHERE group_publication."buildId" = candidate."groupBuildId"
      AND group_publication."taxYear" = candidate."groupTaxYear"
      AND group_publication."sourceImportStatus" = 'COMPLETED'
  ) THEN
    RAISE EXCEPTION 'Company-map build has no completed Skatteetaten group publication';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "CompanyMapFinancialDatasetPublication" financial_publication
    WHERE financial_publication."buildId" = candidate."id"
      AND financial_publication."financialDatasetVersion" = candidate."financialDatasetVersion"
      AND financial_publication."status" = 'VERIFIED_REPORTED'
      AND financial_publication."statementCount" > 0
      AND financial_publication."metricCount" > 0
  ) THEN
    RAISE EXCEPTION 'Company-map build has no verified reported financial dataset';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER "company_map_entity_snapshot_immutable" ON "CompanyMapEntitySnapshot";
CREATE TRIGGER "company_map_entity_snapshot_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "CompanyMapEntitySnapshot"
FOR EACH ROW EXECUTE FUNCTION "prevent_published_company_map_snapshot_mutation"();

DROP TRIGGER "company_map_financial_snapshot_immutable" ON "CompanyMapFinancialSnapshot";
CREATE TRIGGER "company_map_financial_snapshot_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "CompanyMapFinancialSnapshot"
FOR EACH ROW EXECUTE FUNCTION "prevent_published_company_map_snapshot_mutation"();

CREATE FUNCTION "prevent_published_company_map_build_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'PUBLISHED' THEN
    RAISE EXCEPTION 'Published company-map builds are immutable';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "company_map_build_immutable"
BEFORE UPDATE OR DELETE ON "CompanyMapBuild"
FOR EACH ROW EXECUTE FUNCTION "prevent_published_company_map_build_mutation"();
