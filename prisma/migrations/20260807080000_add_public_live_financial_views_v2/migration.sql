CREATE VIEW "live_financial_dataset_v1" AS
WITH active_pointer AS (
  SELECT
    pointer."mode",
    pointer."simulatedDatasetId",
    pointer."activationRevision"
  FROM "ActiveFinancialDataset" pointer
  WHERE pointer."id" = 'global'
),
reported_revision AS (
  SELECT COALESCE(
    (SELECT revision."reportedRevision"
     FROM "FinancialDatasetRevision" revision
     WHERE revision."id" = 'global'),
    0
  ) AS "revision"
),
effective_dataset AS (
  SELECT
    CASE
      WHEN pointer."mode" = 'SIMULATED'
        AND pointer."simulatedDatasetId" IS NOT NULL
        AND current_setting('app.deployment_environment', true) = 'investor-demo'
        AND current_setting('app.fi_sim_enabled', true) = 'on'
      THEN 'simulated'
      ELSE 'reported'
    END AS "datasetMode",
    pointer."simulatedDatasetId",
    COALESCE(pointer."activationRevision", 0) AS "activationRevision"
  FROM (SELECT 1) seed
  LEFT JOIN active_pointer pointer ON true
)
SELECT
  effective."datasetMode",
  CASE
    WHEN effective."datasetMode" = 'simulated'
    THEN 'simulated:' || effective."simulatedDatasetId" || ':' || effective."activationRevision"::text
    ELSE 'reported:' || reported_revision."revision"::text
  END AS "financialDatasetVersion"
FROM effective_dataset effective
CROSS JOIN reported_revision;

COMMENT ON VIEW "live_financial_dataset_v1" IS
  'Fail-closed active financial dataset metadata for runtime cache and empty-state provenance.';

GRANT SELECT ON "live_financial_dataset_v1" TO fjord_financial_runtime;

CREATE VIEW "live_financial_statements_v2" AS
SELECT
  financial.*,
  CASE
    WHEN financial."statementOrigin" = 'reported' THEN reported."sourceSystem"
    ELSE 'FI-SIM'
  END AS "sourceSystem",
  CASE
    WHEN financial."statementOrigin" = 'reported' THEN reported."sourceEntityType"
    ELSE 'simulatedFinancialStatement'
  END AS "sourceEntityType",
  CASE
    WHEN financial."statementOrigin" = 'reported' THEN reported."sourceId"
    ELSE financial."liveStatementId"
  END AS "sourceId",
  CASE
    WHEN financial."statementOrigin" = 'reported' THEN reported."fetchedAt"
    ELSE simulated_dataset."createdAt"
  END AS "fetchedAt",
  CASE
    WHEN financial."statementOrigin" = 'reported' THEN reported."normalizedAt"
    ELSE COALESCE(simulated_dataset."validatedAt", simulated_dataset."createdAt")
  END AS "normalizedAt",
  CASE
    WHEN financial."statementOrigin" = 'reported' THEN reported."rawPayload"
    ELSE jsonb_build_object(
      'datasetVersion', simulated_dataset."datasetVersion",
      'taxonomyVersion', simulated_dataset."taxonomyVersion",
      'generatorVersion', simulated_dataset."generatorVersion"
    )
  END AS "rawPayload"
FROM "live_financial_statements_v1" financial
LEFT JOIN "ActiveFinancialDataset" active_dataset
  ON active_dataset."id" = 'global'
  AND financial."statementOrigin" <> 'reported'
LEFT JOIN "FinancialStatement" reported
  ON reported."id" = financial."reportedStatementId"
LEFT JOIN "SimulatedFinancialDataset" simulated_dataset
  ON simulated_dataset."id" = active_dataset."simulatedDatasetId";

COMMENT ON VIEW "live_financial_statements_v2" IS
  'Public live financial statements with source metadata and dataset provenance.';

GRANT SELECT ON "live_financial_statements_v2" TO fjord_financial_runtime;
REVOKE SELECT ON "live_financial_statements_v1" FROM fjord_financial_runtime;

CREATE VIEW "live_financial_line_items_v2" AS
SELECT
  financial.*,
  CASE
    WHEN financial."valueOrigin" = 'reported' THEN reported."sourceSystem"
    ELSE 'FI-SIM'
  END AS "sourceSystem",
  CASE
    WHEN financial."valueOrigin" = 'reported' THEN reported."sourceEntityType"
    ELSE 'simulatedFinancialLine'
  END AS "sourceEntityType",
  CASE
    WHEN financial."valueOrigin" = 'reported' THEN reported."sourceId"
    ELSE financial."liveLineId"
  END AS "sourceId",
  CASE
    WHEN financial."valueOrigin" = 'reported' THEN reported."fetchedAt"
    ELSE simulated."createdAt"
  END AS "fetchedAt",
  CASE
    WHEN financial."valueOrigin" = 'reported' THEN reported."normalizedAt"
    ELSE simulated."createdAt"
  END AS "normalizedAt",
  CASE
    WHEN financial."valueOrigin" = 'reported' THEN NULL::jsonb
    ELSE jsonb_build_object(
      'derivationRuleId', simulated."derivationRuleId",
      'generatorVersion', simulated."generatorVersion",
      'taxonomyVersion', simulated."taxonomyVersion"
    )
  END AS "rawPayload",
  simulated."derivationRuleId" AS "derivationRuleId"
FROM "live_financial_line_items_v1" financial
LEFT JOIN "FinancialLineItem" reported
  ON reported."id" = financial."reportedFinancialLineItemId"
LEFT JOIN "SimulatedFinancialLine" simulated
  ON financial."liveLineId" = 'simulated:' || simulated."id";

COMMENT ON VIEW "live_financial_line_items_v2" IS
  'Public live financial lines with immutable value and source provenance.';

GRANT SELECT ON "live_financial_line_items_v2" TO fjord_financial_runtime;
REVOKE SELECT ON "live_financial_line_items_v1" FROM fjord_financial_runtime;

CREATE FUNCTION "bump_reported_financial_dataset_revision"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.reported_financial_revision_bumped', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM set_config('app.reported_financial_revision_bumped', 'on', true);

  INSERT INTO "FinancialDatasetRevision" (
    "id",
    "reportedRevision",
    "updatedAt"
  )
  VALUES ('global', 1, CURRENT_TIMESTAMP)
  ON CONFLICT ("id") DO UPDATE
  SET
    "reportedRevision" = "FinancialDatasetRevision"."reportedRevision" + 1,
    "updatedAt" = CURRENT_TIMESTAMP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "FinancialStatement_bump_dataset_revision"
AFTER INSERT OR UPDATE OR DELETE ON "FinancialStatement"
FOR EACH ROW EXECUTE FUNCTION "bump_reported_financial_dataset_revision"();

CREATE TRIGGER "FinancialLineItem_bump_dataset_revision"
AFTER INSERT OR UPDATE OR DELETE ON "FinancialLineItem"
FOR EACH ROW EXECUTE FUNCTION "bump_reported_financial_dataset_revision"();

COMMENT ON FUNCTION "bump_reported_financial_dataset_revision"() IS
  'Atomically invalidates all financial outputs once per transaction when reported statements or lines change.';

REVOKE ALL ON FUNCTION "bump_reported_financial_dataset_revision"() FROM PUBLIC;
