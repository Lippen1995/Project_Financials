-- GL-511: remove the FI-SIM simulation layer and leave reported-only live views.
--
-- This file is deliberately NOT in prisma/migrations. It is a prepared migration, not a pending
-- one: putting it in the chain would drop the simulation tables the next time anyone ran
-- `prisma migrate deploy`, which is the opposite of a rehearsal. When the investor demo is over
-- and the layer is actually being removed, move this directory into prisma/migrations with a
-- timestamp, and delete the FI-SIM source files listed in the teardown checklist.
--
-- What survives on purpose:
--   * The live views themselves. Every runtime read goes through them, and after teardown they
--     have exactly one branch. Keeping the names means no consumer changes.
--   * FinancialDatasetRevision and its bump trigger. They version the *reported* dataset, which
--     is what caches, analyses and stored snapshots key on. Dropping them would invalidate the
--     provenance of every reported record that already carries "reported:<n>".
--   * fjord_financial_runtime. It is the read-only runtime role for the reported views and is not
--     part of the simulation layer.

-- 1. Drop the views first: they depend on the tables below.
DROP VIEW IF EXISTS "live_financial_line_items_v2";
DROP VIEW IF EXISTS "live_financial_statements_v2";
DROP VIEW IF EXISTS "live_financial_line_items_v1";
DROP VIEW IF EXISTS "live_financial_statements_v1";
DROP VIEW IF EXISTS "live_financial_dataset_v1";

-- 2. Drop the simulation tables. Order follows the foreign keys; the immutability triggers are
--    dropped first so a validated dataset does not refuse to be removed.
DROP TRIGGER IF EXISTS "guard_simulated_dataset_validation_and_immutability" ON "SimulatedFinancialDataset";
DROP TRIGGER IF EXISTS "guard_simulated_statement_mutation" ON "SimulatedFinancialStatement";
DROP TRIGGER IF EXISTS "guard_and_validate_simulated_line_mutation" ON "SimulatedFinancialLine";
DROP TRIGGER IF EXISTS "guard_simulated_line_mapping_history" ON "SimulatedFinancialLineMapping";
DROP TRIGGER IF EXISTS "guard_simulated_alias_history" ON "SimulatedMetricAlias";
DROP TRIGGER IF EXISTS "validate_active_financial_dataset_pointer" ON "ActiveFinancialDataset";
DROP TRIGGER IF EXISTS "record_financial_dataset_activation" ON "ActiveFinancialDataset";
DROP TRIGGER IF EXISTS "guard_financial_dataset_activation_audit" ON "FinancialDatasetActivationAudit";

DROP TABLE IF EXISTS "SimulatedFinancialLineMapping";
DROP TABLE IF EXISTS "SimulatedMetricAlias";
DROP TABLE IF EXISTS "SimulatedFinancialLine";
DROP TABLE IF EXISTS "SimulatedFinancialStatement";
DROP TABLE IF EXISTS "ActiveFinancialDataset";
DROP TABLE IF EXISTS "SimulatedFinancialDataset";
DROP TABLE IF EXISTS "FinancialDatasetActivationAudit";

DROP FUNCTION IF EXISTS "guard_simulated_dataset_validation_and_immutability"();
DROP FUNCTION IF EXISTS "guard_simulated_statement_mutation"();
DROP FUNCTION IF EXISTS "guard_and_validate_simulated_line_mutation"();
DROP FUNCTION IF EXISTS "guard_simulated_mapping_history_mutation"();
DROP FUNCTION IF EXISTS "validate_active_financial_dataset_pointer"();
DROP FUNCTION IF EXISTS "record_financial_dataset_activation"();
DROP FUNCTION IF EXISTS "guard_financial_dataset_activation_audit"();

DROP TYPE IF EXISTS "SimulatedFinancialDatasetStatus";
DROP TYPE IF EXISTS "SimulatedFinancialStatementOrigin";
DROP TYPE IF EXISTS "SimulatedFinancialValidationStatus";
DROP TYPE IF EXISTS "FinancialSimulationProfile";
DROP TYPE IF EXISTS "FinancialDatasetActivationAction";
DROP TYPE IF EXISTS "FinancialDatasetMode";

-- 3. Recreate the live views with a single branch.
--
-- The column lists are unchanged, including the ones that only ever carried simulation
-- provenance. They are now constant NULLs rather than absent: a consumer that reads
-- `taxonomyVersion` gets null instead of an error, and the contract that a reported statement
-- carries no simulation provenance is enforced by the view rather than by a runtime check.
CREATE VIEW "live_financial_dataset_v1" AS
SELECT
  'reported'::text AS "datasetMode",
  'reported:' || COALESCE(
    (SELECT revision."reportedRevision" FROM "FinancialDatasetRevision" revision WHERE revision."id" = 'global'),
    0
  )::text AS "financialDatasetVersion";

COMMENT ON VIEW "live_financial_dataset_v1" IS
  'Active financial dataset metadata. Reported-only after GL-511.';

CREATE VIEW "live_financial_statements_v2" AS
WITH reported_revision AS (
  SELECT COALESCE(
    (SELECT revision."reportedRevision" FROM "FinancialDatasetRevision" revision WHERE revision."id" = 'global'),
    0
  ) AS "revision"
)
SELECT
  'reported:' || statement."id" AS "liveStatementId",
  statement."id" AS "reportedStatementId",
  statement."companyId" AS "companyId",
  statement."fiscalYear" AS "fiscalYear",
  statement."statementScope" AS "statementScope",
  'reported'::text AS "statementOrigin",
  'reported:' || reported_revision."revision"::text AS "financialDatasetVersion",
  NULL::text AS "taxonomyVersion",
  NULL::text AS "generatorVersion",
  statement."currency" AS "currency",
  COALESCE(statement."unitScale", 1) AS "unitScale",
  NULL::timestamp(3) AS "periodStart",
  NULL::timestamp(3) AS "periodEnd",
  statement."revenue" AS "revenue",
  statement."operatingProfit" AS "operatingProfit",
  statement."netIncome" AS "netIncome",
  statement."equity" AS "equity",
  statement."assets" AS "assets",
  statement."sourceSystem" AS "sourceSystem",
  statement."sourceEntityType" AS "sourceEntityType",
  statement."sourceId" AS "sourceId",
  statement."fetchedAt" AS "fetchedAt",
  statement."normalizedAt" AS "normalizedAt",
  statement."rawPayload" AS "rawPayload"
FROM "FinancialStatement" statement
CROSS JOIN reported_revision;

COMMENT ON VIEW "live_financial_statements_v2" IS
  'Only runtime read surface for financial statements. Reported-only after GL-511.';

CREATE VIEW "live_financial_line_items_v2" AS
WITH reported_revision AS (
  SELECT COALESCE(
    (SELECT revision."reportedRevision" FROM "FinancialDatasetRevision" revision WHERE revision."id" = 'global'),
    0
  ) AS "revision"
)
SELECT
  'reported:' || line."id" AS "liveLineId",
  'reported:' || statement."id" AS "liveStatementId",
  statement."id" AS "reportedStatementId",
  line."id" AS "reportedFinancialLineItemId",
  line."companyId" AS "companyId",
  line."fiscalYear" AS "fiscalYear",
  line."statementScope" AS "statementScope",
  line."statementType" AS "statementType",
  NULL::text AS "conceptKey",
  line."sourceLabel" AS "sourceLabel",
  line."metricKey" AS "metricKey",
  line."value" AS "value",
  'reported'::text AS "valueOrigin",
  'reported'::text AS "statementOrigin",
  'reported:' || reported_revision."revision"::text AS "financialDatasetVersion",
  NULL::text AS "taxonomyVersion",
  NULL::text AS "generatorVersion",
  line."currency" AS "currency",
  line."unitScale" AS "unitScale",
  line."sortOrder" AS "sortOrder",
  line."sourceSystem" AS "reportedSourceSystem",
  line."sourceId" AS "reportedSourceId",
  line."sourceSystem" AS "sourceSystem",
  line."sourceEntityType" AS "sourceEntityType",
  line."sourceId" AS "sourceId",
  line."fetchedAt" AS "fetchedAt",
  line."normalizedAt" AS "normalizedAt",
  NULL::jsonb AS "rawPayload",
  NULL::text AS "derivationRuleId"
FROM "FinancialLineItem" line
JOIN "FinancialStatement" statement
  ON statement."companyId" = line."companyId"
  AND statement."fiscalYear" = line."fiscalYear"
  AND statement."statementScope" = line."statementScope"
CROSS JOIN reported_revision;

COMMENT ON VIEW "live_financial_line_items_v2" IS
  'Only runtime read surface for financial lines. Reported-only after GL-511.';

GRANT SELECT ON
  "live_financial_dataset_v1",
  "live_financial_statements_v2",
  "live_financial_line_items_v2"
TO fjord_financial_runtime;

-- The simulation-admin role has nothing left to administer. It is left in place rather than
-- dropped because roles are cluster-wide and may hold grants in other databases; revoking its
-- membership is a deployment step, recorded in the teardown checklist.
