CREATE OR REPLACE VIEW "live_financial_statements_v1" AS
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
  statement."assets" AS "assets",
  statement."sourceSystem" AS "reportedSourceSystem",
  statement."sourceId" AS "reportedSourceId",
  statement."sourceFilingId" AS "sourceFilingId",
  statement."publishedAt" AS "publishedAt",
  statement."fetchedAt" AS "financialFetchedAt",
  statement."normalizedAt" AS "financialNormalizedAt"
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
  MAX(resolved."assets") AS "assets",
  NULL::text AS "reportedSourceSystem",
  NULL::text AS "reportedSourceId",
  NULL::text AS "sourceFilingId",
  NULL::timestamp(3) AS "publishedAt",
  NULL::timestamp(3) AS "financialFetchedAt",
  NULL::timestamp(3) AS "financialNormalizedAt"
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

DROP VIEW "reported_financial_statement_provenance_v1";
