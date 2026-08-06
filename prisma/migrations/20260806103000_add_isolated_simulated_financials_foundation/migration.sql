CREATE TYPE "FinancialDatasetMode" AS ENUM ('REPORTED', 'SIMULATED');
CREATE TYPE "SimulatedFinancialDatasetStatus" AS ENUM ('BUILDING', 'VALIDATED', 'FAILED');
CREATE TYPE "SimulatedFinancialStatementOrigin" AS ENUM ('HYBRID', 'SIMULATED');
CREATE TYPE "SimulatedFinancialValidationStatus" AS ENUM ('PENDING', 'VALID', 'MANUAL_REVIEW', 'ERROR');
CREATE TYPE "FinancialSimulationProfile" AS ENUM (
  'SERVICE',
  'TRADE',
  'MANUFACTURING_CONSTRUCTION',
  'PROPERTY',
  'HOLDING_INVESTMENT',
  'DORMANT_PRE_REVENUE'
);

CREATE TABLE "SimulatedFinancialDataset" (
  "id" TEXT NOT NULL,
  "datasetVersion" TEXT NOT NULL,
  "status" "SimulatedFinancialDatasetStatus" NOT NULL DEFAULT 'BUILDING',
  "taxonomyVersion" TEXT NOT NULL,
  "generatorVersion" TEXT NOT NULL,
  "assumptionVersion" TEXT NOT NULL,
  "profileVersion" TEXT NOT NULL,
  "manifest" JSONB NOT NULL,
  "validationResult" JSONB,
  "createdByUserId" TEXT NOT NULL,
  "validatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SimulatedFinancialDataset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SimulatedFinancialDataset_version_check"
    CHECK ("taxonomyVersion" = 'FI-SIM-2026.1'),
  CONSTRAINT "SimulatedFinancialDataset_validation_check"
    CHECK (
      "status" <> 'VALIDATED'
      OR ("validatedAt" IS NOT NULL AND "validationResult" IS NOT NULL)
    )
);

CREATE TABLE "SimulatedFinancialStatement" (
  "id" TEXT NOT NULL,
  "datasetId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "fiscalYear" INTEGER NOT NULL,
  "statementScope" "StatementScope" NOT NULL DEFAULT 'COMPANY',
  "statementType" "FinancialFactStatementType" NOT NULL,
  "statementOrigin" "SimulatedFinancialStatementOrigin" NOT NULL,
  "profile" "FinancialSimulationProfile" NOT NULL,
  "profileRuleId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NOK',
  "unitScale" INTEGER NOT NULL DEFAULT 1,
  "validationStatus" "SimulatedFinancialValidationStatus" NOT NULL DEFAULT 'PENDING',
  "residualAmount" BIGINT,
  "validationResult" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SimulatedFinancialStatement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SimulatedFinancialStatement_type_check"
    CHECK ("statementType" IN ('INCOME_STATEMENT', 'BALANCE_SHEET')),
  CONSTRAINT "SimulatedFinancialStatement_period_check"
    CHECK ("periodEnd" >= "periodStart"),
  CONSTRAINT "SimulatedFinancialStatement_unit_check"
    CHECK ("unitScale" > 0 AND length("currency") = 3)
);

CREATE TABLE "SimulatedFinancialLine" (
  "id" TEXT NOT NULL,
  "statementId" TEXT NOT NULL,
  "conceptKey" TEXT NOT NULL,
  "conceptQName" TEXT NOT NULL,
  "taxonomyVersion" TEXT NOT NULL,
  "sourceLabel" TEXT NOT NULL,
  "presentationRole" TEXT NOT NULL,
  "reportedFinancialLineItemId" TEXT,
  "syntheticValue" BIGINT,
  "currency" TEXT NOT NULL DEFAULT 'NOK',
  "unitScale" INTEGER NOT NULL DEFAULT 1,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "derivationRuleId" TEXT,
  "generatorVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SimulatedFinancialLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SimulatedFinancialLine_value_xor_check"
    CHECK (("reportedFinancialLineItemId" IS NOT NULL) <> ("syntheticValue" IS NOT NULL)),
  CONSTRAINT "SimulatedFinancialLine_taxonomy_check"
    CHECK (
      "taxonomyVersion" = 'FI-SIM-2026.1'
      AND "conceptQName" = 'urn:fjord-insight:taxonomy:fi-sim:2026.1#' || "conceptKey"
    ),
  CONSTRAINT "SimulatedFinancialLine_unit_check"
    CHECK ("unitScale" > 0 AND length("currency") = 3)
);

CREATE TABLE "SimulatedFinancialLineMapping" (
  "id" TEXT NOT NULL,
  "lineId" TEXT NOT NULL,
  "mappingRevision" BIGINT NOT NULL,
  "metricKey" TEXT,
  "mappingMethod" TEXT NOT NULL,
  "mappedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SimulatedFinancialLineMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SimulatedFinancialLineMapping_revision_check" CHECK ("mappingRevision" >= 0)
);

CREATE TABLE "SimulatedMetricAlias" (
  "id" TEXT NOT NULL,
  "datasetId" TEXT NOT NULL,
  "mappingRevision" BIGINT NOT NULL,
  "taxonomyVersion" TEXT NOT NULL,
  "conceptKey" TEXT,
  "metricKey" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "normalizedAlias" TEXT NOT NULL,
  "statementFamily" TEXT NOT NULL,
  "liabilitySection" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SimulatedMetricAlias_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SimulatedMetricAlias_revision_check" CHECK ("mappingRevision" >= 0),
  CONSTRAINT "SimulatedMetricAlias_family_check"
    CHECK ("statementFamily" IN ('INCOME_STATEMENT', 'BALANCE_SHEET'))
);

CREATE TABLE "ActiveFinancialDataset" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "mode" "FinancialDatasetMode" NOT NULL DEFAULT 'REPORTED',
  "simulatedDatasetId" TEXT,
  "activationRevision" BIGINT NOT NULL DEFAULT 0,
  "mappingRevision" BIGINT NOT NULL DEFAULT 0,
  "activatedAt" TIMESTAMP(3),
  "activatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActiveFinancialDataset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActiveFinancialDataset_singleton_check" CHECK ("id" = 'global'),
  CONSTRAINT "ActiveFinancialDataset_pointer_check" CHECK (
    ("mode" = 'REPORTED' AND "simulatedDatasetId" IS NULL)
    OR ("mode" = 'SIMULATED' AND "simulatedDatasetId" IS NOT NULL)
  ),
  CONSTRAINT "ActiveFinancialDataset_revision_check"
    CHECK ("activationRevision" >= 0 AND "mappingRevision" >= 0)
);

CREATE TABLE "FinancialDatasetRevision" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "reportedRevision" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialDatasetRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialDatasetRevision_singleton_check" CHECK ("id" = 'global'),
  CONSTRAINT "FinancialDatasetRevision_revision_check" CHECK ("reportedRevision" >= 0)
);

-- These roles are NOLOGIN capability roles. Deployments explicitly grant
-- membership to their runtime and investor-demo activation principals.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fjord_financial_runtime') THEN
    CREATE ROLE fjord_financial_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fjord_financial_simulation_admin') THEN
    CREATE ROLE fjord_financial_simulation_admin NOLOGIN;
  END IF;
END
$$;

REVOKE ALL PRIVILEGES ON TABLE
  "FinancialStatement",
  "FinancialLineItem",
  "PublishedFinancialLineItem",
  "SimulatedFinancialDataset",
  "SimulatedFinancialStatement",
  "SimulatedFinancialLine",
  "SimulatedFinancialLineMapping",
  "SimulatedMetricAlias",
  "ActiveFinancialDataset",
  "FinancialDatasetRevision"
FROM fjord_financial_runtime;

CREATE UNIQUE INDEX "SimulatedFinancialDataset_datasetVersion_key"
  ON "SimulatedFinancialDataset"("datasetVersion");
CREATE INDEX "SimulatedFinancialDataset_status_createdAt_idx"
  ON "SimulatedFinancialDataset"("status", "createdAt");
CREATE INDEX "SimulatedFinancialDataset_taxonomyVersion_generatorVersion_idx"
  ON "SimulatedFinancialDataset"("taxonomyVersion", "generatorVersion");

CREATE UNIQUE INDEX "SimulatedFinancialStatement_datasetId_companyId_fiscalYear__key"
  ON "SimulatedFinancialStatement"("datasetId", "companyId", "fiscalYear", "statementScope", "statementType");
CREATE INDEX "SimulatedFinancialStatement_companyId_fiscalYear_statementS_idx"
  ON "SimulatedFinancialStatement"("companyId", "fiscalYear", "statementScope");
CREATE INDEX "SimulatedFinancialStatement_datasetId_validationStatus_idx"
  ON "SimulatedFinancialStatement"("datasetId", "validationStatus");

CREATE UNIQUE INDEX "SimulatedFinancialLine_statementId_conceptKey_key"
  ON "SimulatedFinancialLine"("statementId", "conceptKey");
CREATE INDEX "SimulatedFinancialLine_reportedFinancialLineItemId_idx"
  ON "SimulatedFinancialLine"("reportedFinancialLineItemId");
CREATE INDEX "SimulatedFinancialLine_sourceLabel_idx"
  ON "SimulatedFinancialLine"("sourceLabel");
CREATE INDEX "SimulatedFinancialLine_taxonomyVersion_conceptKey_idx"
  ON "SimulatedFinancialLine"("taxonomyVersion", "conceptKey");

CREATE UNIQUE INDEX "SimulatedFinancialLineMapping_lineId_mappingRevision_key"
  ON "SimulatedFinancialLineMapping"("lineId", "mappingRevision");
CREATE INDEX "SimulatedFinancialLineMapping_mappingRevision_metricKey_idx"
  ON "SimulatedFinancialLineMapping"("mappingRevision", "metricKey");

CREATE UNIQUE INDEX "SimulatedMetricAlias_datasetId_mappingRevision_metricKey_no_key"
  ON "SimulatedMetricAlias"("datasetId", "mappingRevision", "metricKey", "normalizedAlias", "liabilitySection");
CREATE INDEX "SimulatedMetricAlias_datasetId_mappingRevision_statementFam_idx"
  ON "SimulatedMetricAlias"("datasetId", "mappingRevision", "statementFamily", "isActive");
CREATE INDEX "SimulatedMetricAlias_datasetId_conceptKey_idx"
  ON "SimulatedMetricAlias"("datasetId", "conceptKey");

CREATE INDEX "ActiveFinancialDataset_mode_activationRevision_mappingRevis_idx"
  ON "ActiveFinancialDataset"("mode", "activationRevision", "mappingRevision");

ALTER TABLE "SimulatedFinancialStatement"
  ADD CONSTRAINT "SimulatedFinancialStatement_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "SimulatedFinancialDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SimulatedFinancialStatement"
  ADD CONSTRAINT "SimulatedFinancialStatement_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SimulatedFinancialLine"
  ADD CONSTRAINT "SimulatedFinancialLine_statementId_fkey"
  FOREIGN KEY ("statementId") REFERENCES "SimulatedFinancialStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SimulatedFinancialLine"
  ADD CONSTRAINT "SimulatedFinancialLine_reportedFinancialLineItemId_fkey"
  FOREIGN KEY ("reportedFinancialLineItemId") REFERENCES "FinancialLineItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SimulatedFinancialLineMapping"
  ADD CONSTRAINT "SimulatedFinancialLineMapping_lineId_fkey"
  FOREIGN KEY ("lineId") REFERENCES "SimulatedFinancialLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SimulatedMetricAlias"
  ADD CONSTRAINT "SimulatedMetricAlias_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "SimulatedFinancialDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActiveFinancialDataset"
  ADD CONSTRAINT "ActiveFinancialDataset_simulatedDatasetId_fkey"
  FOREIGN KEY ("simulatedDatasetId") REFERENCES "SimulatedFinancialDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "guard_simulated_dataset_validation_and_immutability"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'VALIDATED' THEN
      RAISE EXCEPTION 'Validated simulated financial datasets are immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" = 'VALIDATED' THEN
    RAISE EXCEPTION 'Validated simulated financial datasets are immutable';
  END IF;

  IF NEW."status" = 'VALIDATED' THEN
    IF NEW."validatedAt" IS NULL OR NEW."validationResult" IS NULL THEN
      RAISE EXCEPTION 'Validated datasets require validation evidence';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "SimulatedFinancialStatement" statement
      WHERE statement."datasetId" = NEW."id"
    ) THEN
      RAISE EXCEPTION 'A simulated dataset cannot validate without statements';
    END IF;
    IF EXISTS (
      SELECT 1 FROM "SimulatedFinancialStatement" statement
      WHERE statement."datasetId" = NEW."id"
        AND statement."validationStatus" <> 'VALID'
    ) THEN
      RAISE EXCEPTION 'All simulated statements must be valid before dataset validation';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM "SimulatedFinancialStatement" statement
      WHERE statement."datasetId" = NEW."id"
        AND NOT EXISTS (
          SELECT 1 FROM "SimulatedFinancialLine" line
          WHERE line."statementId" = statement."id"
        )
    ) THEN
      RAISE EXCEPTION 'Every simulated statement must contain lines';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM "SimulatedFinancialStatement" statement
      WHERE statement."datasetId" = NEW."id"
      GROUP BY statement."companyId", statement."fiscalYear", statement."statementScope"
      HAVING COUNT(*) <> 2
        OR COUNT(DISTINCT (
          statement."currency",
          statement."unitScale",
          statement."periodStart",
          statement."periodEnd"
        )) <> 1
    ) THEN
      RAISE EXCEPTION 'Each simulated financial package requires consistent income and balance statements';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM "SimulatedFinancialStatement" statement
      WHERE statement."datasetId" = NEW."id"
        AND (
          (statement."statementOrigin" = 'SIMULATED' AND EXISTS (
            SELECT 1 FROM "SimulatedFinancialLine" line
            WHERE line."statementId" = statement."id"
              AND line."reportedFinancialLineItemId" IS NOT NULL
          ))
          OR
          (statement."statementOrigin" = 'HYBRID' AND (
            NOT EXISTS (
              SELECT 1 FROM "SimulatedFinancialLine" line
              WHERE line."statementId" = statement."id"
                AND line."reportedFinancialLineItemId" IS NOT NULL
            )
            OR NOT EXISTS (
              SELECT 1 FROM "SimulatedFinancialLine" line
              WHERE line."statementId" = statement."id"
                AND line."syntheticValue" IS NOT NULL
            )
          ))
        )
    ) THEN
      RAISE EXCEPTION 'Statement origin does not match its line origins';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "guard_simulated_dataset_validation_and_immutability"
BEFORE UPDATE OR DELETE ON "SimulatedFinancialDataset"
FOR EACH ROW EXECUTE FUNCTION "guard_simulated_dataset_validation_and_immutability"();

CREATE OR REPLACE FUNCTION "guard_simulated_statement_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_dataset_id TEXT;
  new_dataset_id TEXT;
BEGIN
  old_dataset_id := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD."datasetId" END;
  new_dataset_id := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW."datasetId" END;

  IF EXISTS (
    SELECT 1 FROM "SimulatedFinancialDataset" dataset
    WHERE dataset."id" IN (old_dataset_id, new_dataset_id)
      AND dataset."status" = 'VALIDATED'
  ) THEN
    RAISE EXCEPTION 'Statements in validated simulated datasets are immutable';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "guard_simulated_statement_mutation"
BEFORE INSERT OR UPDATE OR DELETE ON "SimulatedFinancialStatement"
FOR EACH ROW EXECUTE FUNCTION "guard_simulated_statement_mutation"();

CREATE OR REPLACE FUNCTION "guard_and_validate_simulated_line_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_statement_id TEXT;
  new_statement_id TEXT;
  target_statement_id TEXT;
  dataset_status "SimulatedFinancialDatasetStatus";
  dataset_taxonomy TEXT;
  dataset_generator TEXT;
  statement_company TEXT;
  statement_year INTEGER;
  statement_scope "StatementScope";
  statement_type "FinancialFactStatementType";
  statement_currency TEXT;
  statement_unit INTEGER;
  anchor_company TEXT;
  anchor_year INTEGER;
  anchor_scope "StatementScope";
  anchor_type "FinancialFactStatementType";
BEGIN
  old_statement_id := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD."statementId" END;
  new_statement_id := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW."statementId" END;
  target_statement_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."statementId" ELSE NEW."statementId" END;

  IF EXISTS (
    SELECT 1
    FROM "SimulatedFinancialStatement" guarded_statement
    JOIN "SimulatedFinancialDataset" guarded_dataset
      ON guarded_dataset."id" = guarded_statement."datasetId"
    WHERE guarded_statement."id" IN (old_statement_id, new_statement_id)
      AND guarded_dataset."status" = 'VALIDATED'
  ) THEN
    RAISE EXCEPTION 'Lines in validated simulated datasets are immutable';
  END IF;

  SELECT dataset."status", dataset."taxonomyVersion", dataset."generatorVersion",
         statement."companyId", statement."fiscalYear", statement."statementScope",
         statement."statementType", statement."currency", statement."unitScale"
  INTO dataset_status, dataset_taxonomy, dataset_generator,
       statement_company, statement_year, statement_scope,
       statement_type, statement_currency, statement_unit
  FROM "SimulatedFinancialStatement" statement
  JOIN "SimulatedFinancialDataset" dataset ON dataset."id" = statement."datasetId"
  WHERE statement."id" = target_statement_id;

  IF TG_OP <> 'DELETE' THEN
    IF NEW."taxonomyVersion" <> dataset_taxonomy OR NEW."generatorVersion" <> dataset_generator THEN
      RAISE EXCEPTION 'Line taxonomy and generator versions must match their dataset';
    END IF;
    IF NEW."currency" <> statement_currency OR NEW."unitScale" <> statement_unit THEN
      RAISE EXCEPTION 'Line currency and unit must match their statement';
    END IF;

    IF NEW."reportedFinancialLineItemId" IS NOT NULL THEN
      SELECT anchor."companyId", anchor."fiscalYear", anchor."statementScope", anchor."statementType"
      INTO anchor_company, anchor_year, anchor_scope, anchor_type
      FROM "FinancialLineItem" anchor
      WHERE anchor."id" = NEW."reportedFinancialLineItemId";

      IF anchor_company IS NULL
        OR anchor_company <> statement_company
        OR anchor_year <> statement_year
        OR anchor_scope <> statement_scope
        OR anchor_type <> statement_type THEN
        RAISE EXCEPTION 'Reported anchor must match statement company, period, scope and type';
      END IF;
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "guard_and_validate_simulated_line_mutation"
BEFORE INSERT OR UPDATE OR DELETE ON "SimulatedFinancialLine"
FOR EACH ROW EXECUTE FUNCTION "guard_and_validate_simulated_line_mutation"();

CREATE OR REPLACE FUNCTION "guard_simulated_mapping_history_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_dataset_id TEXT;
  dataset_status "SimulatedFinancialDatasetStatus";
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'Simulated mapping history is append-only';
  END IF;

  IF TG_TABLE_NAME = 'SimulatedFinancialLineMapping' THEN
    SELECT statement."datasetId" INTO target_dataset_id
    FROM "SimulatedFinancialLine" line
    JOIN "SimulatedFinancialStatement" statement ON statement."id" = line."statementId"
    WHERE line."id" = NEW."lineId";
  ELSE
    target_dataset_id := NEW."datasetId";
  END IF;

  SELECT "status" INTO dataset_status
  FROM "SimulatedFinancialDataset"
  WHERE "id" = target_dataset_id;

  IF dataset_status IS DISTINCT FROM 'VALIDATED' THEN
    RAISE EXCEPTION 'Simulated mappings can only be appended to validated datasets';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "guard_simulated_line_mapping_history"
BEFORE INSERT OR UPDATE OR DELETE ON "SimulatedFinancialLineMapping"
FOR EACH ROW EXECUTE FUNCTION "guard_simulated_mapping_history_mutation"();

CREATE TRIGGER "guard_simulated_alias_history"
BEFORE INSERT OR UPDATE OR DELETE ON "SimulatedMetricAlias"
FOR EACH ROW EXECUTE FUNCTION "guard_simulated_mapping_history_mutation"();

CREATE OR REPLACE FUNCTION "validate_active_financial_dataset_pointer"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  dataset_status "SimulatedFinancialDatasetStatus";
BEGIN
  IF NOT pg_has_role(session_user, 'fjord_financial_simulation_admin', 'MEMBER') THEN
    RAISE EXCEPTION 'Financial dataset activation requires the simulation-admin database role';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW."mode" = 'SIMULATED'
    AND (
      current_setting('app.deployment_environment', true) IS DISTINCT FROM 'investor-demo'
      OR current_setting('app.fi_sim_enabled', true) IS DISTINCT FROM 'on'
    ) THEN
    RAISE EXCEPTION 'Financial dataset activation is disabled outside an enabled investor-demo session';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW."activationRevision" <= OLD."activationRevision" THEN
    RAISE EXCEPTION 'Financial dataset activation revision must increase';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."mappingRevision" < OLD."mappingRevision" THEN
    RAISE EXCEPTION 'Financial mapping revision cannot decrease';
  END IF;

  IF NEW."mode" = 'SIMULATED' THEN
    SELECT "status" INTO dataset_status
    FROM "SimulatedFinancialDataset"
    WHERE "id" = NEW."simulatedDatasetId";

    IF dataset_status IS DISTINCT FROM 'VALIDATED' THEN
      RAISE EXCEPTION 'Only a validated simulated dataset can be activated';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "validate_active_financial_dataset_pointer"
BEFORE INSERT OR UPDATE OR DELETE ON "ActiveFinancialDataset"
FOR EACH ROW EXECUTE FUNCTION "validate_active_financial_dataset_pointer"();
