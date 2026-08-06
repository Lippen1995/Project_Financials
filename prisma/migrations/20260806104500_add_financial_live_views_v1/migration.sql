CREATE VIEW "live_financial_statements_v1" AS
WITH active_dataset AS (
  SELECT
    COALESCE(
      (
        SELECT CASE
          WHEN pointer."mode" = 'SIMULATED'
            AND current_setting('app.deployment_environment', true) = 'investor-demo'
            AND current_setting('app.fi_sim_enabled', true) = 'on'
          THEN 'SIMULATED'
          ELSE 'REPORTED'
        END
        FROM "ActiveFinancialDataset" pointer
        WHERE pointer."id" = 'global'
      ),
      'REPORTED'
    ) AS "mode",
    (SELECT pointer."simulatedDatasetId" FROM "ActiveFinancialDataset" pointer WHERE pointer."id" = 'global') AS "simulatedDatasetId",
    COALESCE(
      (SELECT pointer."activationRevision" FROM "ActiveFinancialDataset" pointer WHERE pointer."id" = 'global'),
      0
    ) AS "activationRevision"
),
reported_revision AS (
  SELECT COALESCE(
    (SELECT revision."reportedRevision" FROM "FinancialDatasetRevision" revision WHERE revision."id" = 'global'),
    0
  ) AS "revision"
),
simulated_statement_values AS (
  SELECT
    line."statementId",
    MAX(CASE WHEN line."conceptKey" = 'OperatingIncomeTotal' THEN
      CASE WHEN line."reportedFinancialLineItemId" IS NOT NULL
        THEN reported_line."value" ELSE line."syntheticValue" END
    END) AS "revenue",
    MAX(CASE WHEN line."conceptKey" = 'OperatingResult' THEN
      CASE WHEN line."reportedFinancialLineItemId" IS NOT NULL
        THEN reported_line."value" ELSE line."syntheticValue" END
    END) AS "operatingProfit",
    MAX(CASE WHEN line."conceptKey" = 'ProfitForPeriod' THEN
      CASE WHEN line."reportedFinancialLineItemId" IS NOT NULL
        THEN reported_line."value" ELSE line."syntheticValue" END
    END) AS "netIncome",
    MAX(CASE WHEN line."conceptKey" = 'EquityTotal' THEN
      CASE WHEN line."reportedFinancialLineItemId" IS NOT NULL
        THEN reported_line."value" ELSE line."syntheticValue" END
    END) AS "equity",
    MAX(CASE WHEN line."conceptKey" = 'AssetsTotal' THEN
      CASE WHEN line."reportedFinancialLineItemId" IS NOT NULL
        THEN reported_line."value" ELSE line."syntheticValue" END
    END) AS "assets"
  FROM "SimulatedFinancialLine" line
  LEFT JOIN "FinancialLineItem" reported_line
    ON reported_line."id" = line."reportedFinancialLineItemId"
  GROUP BY line."statementId"
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
  statement."assets" AS "assets"
FROM "FinancialStatement" statement
CROSS JOIN active_dataset
CROSS JOIN reported_revision
WHERE active_dataset."mode" = 'REPORTED'

UNION ALL

SELECT
  'simulated:' || dataset."id" || ':' || statement."companyId" || ':' ||
    statement."fiscalYear"::text || ':' || statement."statementScope"::text AS "liveStatementId",
  NULL::text AS "reportedStatementId",
  statement."companyId" AS "companyId",
  statement."fiscalYear" AS "fiscalYear",
  statement."statementScope" AS "statementScope",
  CASE
    WHEN bool_or(statement."statementOrigin" = 'HYBRID') THEN 'hybrid'
    ELSE 'simulated'
  END AS "statementOrigin",
  'simulated:' || dataset."id" || ':' || active_dataset."activationRevision"::text AS "financialDatasetVersion",
  dataset."taxonomyVersion" AS "taxonomyVersion",
  dataset."generatorVersion" AS "generatorVersion",
  (array_agg(statement."currency" ORDER BY statement."statementType"))[1] AS "currency",
  MAX(statement."unitScale") AS "unitScale",
  MIN(statement."periodStart") AS "periodStart",
  MAX(statement."periodEnd") AS "periodEnd",
  MAX(resolved."revenue") AS "revenue",
  MAX(resolved."operatingProfit") AS "operatingProfit",
  MAX(resolved."netIncome") AS "netIncome",
  MAX(resolved."equity") AS "equity",
  MAX(resolved."assets") AS "assets"
FROM "SimulatedFinancialStatement" statement
JOIN "SimulatedFinancialDataset" dataset ON dataset."id" = statement."datasetId"
LEFT JOIN simulated_statement_values resolved ON resolved."statementId" = statement."id"
CROSS JOIN active_dataset
WHERE active_dataset."mode" = 'SIMULATED'
  AND dataset."id" = active_dataset."simulatedDatasetId"
  AND dataset."status" = 'VALIDATED'
GROUP BY
  dataset."id",
  dataset."taxonomyVersion",
  dataset."generatorVersion",
  active_dataset."activationRevision",
  statement."companyId",
  statement."fiscalYear",
  statement."statementScope";

CREATE VIEW "live_financial_line_items_v1" AS
WITH active_dataset AS (
  SELECT
    COALESCE(
      (
        SELECT CASE
          WHEN pointer."mode" = 'SIMULATED'
            AND current_setting('app.deployment_environment', true) = 'investor-demo'
            AND current_setting('app.fi_sim_enabled', true) = 'on'
          THEN 'SIMULATED'
          ELSE 'REPORTED'
        END
        FROM "ActiveFinancialDataset" pointer
        WHERE pointer."id" = 'global'
      ),
      'REPORTED'
    ) AS "mode",
    (SELECT pointer."simulatedDatasetId" FROM "ActiveFinancialDataset" pointer WHERE pointer."id" = 'global') AS "simulatedDatasetId",
    COALESCE(
      (SELECT pointer."activationRevision" FROM "ActiveFinancialDataset" pointer WHERE pointer."id" = 'global'),
      0
    ) AS "activationRevision",
    COALESCE(
      (SELECT pointer."mappingRevision" FROM "ActiveFinancialDataset" pointer WHERE pointer."id" = 'global'),
      0
    ) AS "mappingRevision"
),
reported_revision AS (
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
  line."sourceId" AS "reportedSourceId"
FROM "FinancialLineItem" line
JOIN "FinancialStatement" statement
  ON statement."companyId" = line."companyId"
  AND statement."fiscalYear" = line."fiscalYear"
  AND statement."statementScope" = line."statementScope"
CROSS JOIN active_dataset
CROSS JOIN reported_revision
WHERE active_dataset."mode" = 'REPORTED'

UNION ALL

SELECT
  'simulated:' || line."id" AS "liveLineId",
  'simulated:' || dataset."id" || ':' || statement."companyId" || ':' ||
    statement."fiscalYear"::text || ':' || statement."statementScope"::text AS "liveStatementId",
  NULL::text AS "reportedStatementId",
  line."reportedFinancialLineItemId" AS "reportedFinancialLineItemId",
  statement."companyId" AS "companyId",
  statement."fiscalYear" AS "fiscalYear",
  statement."statementScope" AS "statementScope",
  statement."statementType" AS "statementType",
  line."conceptKey" AS "conceptKey",
  line."sourceLabel" AS "sourceLabel",
  mapping."metricKey" AS "metricKey",
  CASE
    WHEN line."reportedFinancialLineItemId" IS NOT NULL THEN reported_line."value"
    ELSE line."syntheticValue"
  END AS "value",
  CASE
    WHEN line."reportedFinancialLineItemId" IS NOT NULL THEN 'reported'
    ELSE 'synthetic'
  END AS "valueOrigin",
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM "SimulatedFinancialStatement" sibling
      WHERE sibling."datasetId" = statement."datasetId"
        AND sibling."companyId" = statement."companyId"
        AND sibling."fiscalYear" = statement."fiscalYear"
        AND sibling."statementScope" = statement."statementScope"
        AND sibling."statementOrigin" = 'HYBRID'
    ) THEN 'hybrid'
    ELSE 'simulated'
  END AS "statementOrigin",
  'simulated:' || dataset."id" || ':' || active_dataset."activationRevision"::text AS "financialDatasetVersion",
  line."taxonomyVersion" AS "taxonomyVersion",
  line."generatorVersion" AS "generatorVersion",
  line."currency" AS "currency",
  line."unitScale" AS "unitScale",
  line."sortOrder" AS "sortOrder",
  reported_line."sourceSystem" AS "reportedSourceSystem",
  reported_line."sourceId" AS "reportedSourceId"
FROM "SimulatedFinancialLine" line
JOIN "SimulatedFinancialStatement" statement ON statement."id" = line."statementId"
JOIN "SimulatedFinancialDataset" dataset ON dataset."id" = statement."datasetId"
LEFT JOIN "FinancialLineItem" reported_line ON reported_line."id" = line."reportedFinancialLineItemId"
CROSS JOIN active_dataset
LEFT JOIN LATERAL (
  SELECT result."metricKey"
  FROM "SimulatedFinancialLineMapping" result
  WHERE result."lineId" = line."id"
    AND result."mappingRevision" <= active_dataset."mappingRevision"
  ORDER BY result."mappingRevision" DESC
  LIMIT 1
) mapping ON true
WHERE active_dataset."mode" = 'SIMULATED'
  AND dataset."id" = active_dataset."simulatedDatasetId"
  AND dataset."status" = 'VALIDATED';

COMMENT ON VIEW "live_financial_statements_v1" IS
  'Only runtime read surface for active reported or investor-demo financial statements.';
COMMENT ON VIEW "live_financial_line_items_v1" IS
  'Only runtime read surface for active reported or investor-demo financial lines.';

GRANT USAGE ON SCHEMA public TO fjord_financial_runtime;
GRANT SELECT ON "live_financial_statements_v1", "live_financial_line_items_v1"
  TO fjord_financial_runtime;
