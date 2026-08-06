CREATE TYPE "CompanyMapFinancialDatasetStatus" AS ENUM ('VERIFIED_REPORTED', 'REVOKED');

CREATE TABLE "CompanyMapFinancialDatasetPublication" (
  "financialDatasetVersion" TEXT NOT NULL,
  "status" "CompanyMapFinancialDatasetStatus" NOT NULL,
  "statementCount" INTEGER NOT NULL,
  "metricCount" INTEGER NOT NULL,
  "verificationRepositoryVersion" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "sourceEntityType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL,
  "normalizedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyMapFinancialDatasetPublication_pkey"
    PRIMARY KEY ("financialDatasetVersion"),
  CONSTRAINT "company_map_financial_verified_counts" CHECK (
    "status" <> 'VERIFIED_REPORTED'
    OR ("statementCount" > 0 AND "metricCount" > 0)
  )
);

CREATE FUNCTION "validate_company_map_publication"()
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
    WHERE financial_publication."financialDatasetVersion" = candidate."financialDatasetVersion"
      AND financial_publication."status" = 'VERIFIED_REPORTED'
      AND financial_publication."statementCount" > 0
      AND financial_publication."metricCount" > 0
  ) THEN
    RAISE EXCEPTION 'Company-map build has no verified reported financial dataset';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "company_map_publication_invariants"
BEFORE INSERT OR UPDATE ON "CompanyMapPublication"
FOR EACH ROW EXECUTE FUNCTION "validate_company_map_publication"();

CREATE FUNCTION "prevent_published_company_map_snapshot_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_build_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_build_id := OLD."buildId";
  ELSE
    target_build_id := NEW."buildId";
  END IF;
  IF EXISTS (
    SELECT 1 FROM "CompanyMapBuild"
    WHERE "id" = target_build_id AND "status" = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'Published company-map snapshots are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "company_map_entity_snapshot_immutable"
BEFORE UPDATE OR DELETE ON "CompanyMapEntitySnapshot"
FOR EACH ROW EXECUTE FUNCTION "prevent_published_company_map_snapshot_mutation"();

CREATE TRIGGER "company_map_financial_snapshot_immutable"
BEFORE UPDATE OR DELETE ON "CompanyMapFinancialSnapshot"
FOR EACH ROW EXECUTE FUNCTION "prevent_published_company_map_snapshot_mutation"();
