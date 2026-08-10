-- Restricted, versioned read surface for the free public company map.
--
-- The underlying snapshot is an atomically published cache. These views make the current
-- reported dataset revision part of the same database statement as ranking and coverage, while
-- keeping the financial runtime role away from the cache and entity tables themselves.

CREATE VIEW "live_company_map_dataset_v1"
WITH (security_barrier = true) AS
SELECT
  publication."buildId",
  build."financialDatasetVersion",
  publication."publishedAt"
FROM "CompanyMapPublication" publication
JOIN "CompanyMapBuild" build
  ON build."id" = publication."buildId"
JOIN "CompanyMapFinancialDatasetPublication" financial_publication
  ON financial_publication."buildId" = build."id"
LEFT JOIN "FinancialDatasetRevision" revision
  ON revision."id" = 'global'
WHERE publication."channel" = 'public'
  AND build."status" = 'PUBLISHED'
  AND financial_publication."status" = 'VERIFIED_REPORTED'
  AND financial_publication."financialDatasetVersion" = build."financialDatasetVersion"
  AND financial_publication."statementCount" > 0
  AND financial_publication."metricCount" > 0
  AND build."financialDatasetVersion" =
    'reported:' || COALESCE(revision."reportedRevision", 0)::text;

COMMENT ON VIEW "live_company_map_dataset_v1" IS
  'Active reported company-map publication metadata, invalidated atomically by the reported dataset revision.';

CREATE VIEW "live_company_map_entities_v1"
WITH (security_barrier = true) AS
SELECT
  entity."buildId",
  dataset."financialDatasetVersion",
  entity."orgNumber",
  entity."name",
  entity."organisationForm",
  entity."companyStatus",
  entity."employeeCount",
  entity."municipality",
  entity."officialAddressId",
  entity."latitude",
  entity."longitude",
  entity."resolutionStatus",
  entity."groupRootOrgNumber",
  entity."groupRootName"
FROM "live_company_map_dataset_v1" dataset
JOIN "CompanyMapEntitySnapshot" entity
  ON entity."buildId" = dataset."buildId";

COMMENT ON VIEW "live_company_map_entities_v1" IS
  'Public company-map entity rows for the active reported map build.';

CREATE VIEW "live_company_map_financials_v1"
WITH (security_barrier = true) AS
SELECT
  financial."buildId",
  company."id" AS "companyId",
  financial."orgNumber",
  financial."statementScope",
  financial."fiscalYear",
  financial."currency",
  financial."unitScale",
  financial."revenue",
  financial."ebit",
  financial."preTaxProfit",
  financial."preTaxProfitStatus",
  financial."netIncome",
  financial."equity",
  financial."totalAssets",
  financial."valueOrigin",
  financial."financialDatasetVersion",
  financial."reportedStatementId",
  financial."reportedSourceSystem",
  financial."reportedSourceId",
  financial."sourceFilingId",
  financial."publishedAt",
  financial."financialFetchedAt",
  financial."financialNormalizedAt"
FROM "live_company_map_dataset_v1" dataset
JOIN "CompanyMapFinancialSnapshot" financial
  ON financial."buildId" = dataset."buildId"
  AND financial."financialDatasetVersion" = dataset."financialDatasetVersion"
JOIN "Company" company
  ON company."orgNumber" = financial."orgNumber"
WHERE financial."valueOrigin" = 'reported';

COMMENT ON VIEW "live_company_map_financials_v1" IS
  'Reported-only financial metrics for the active public company-map build.';

GRANT SELECT ON
  "live_company_map_dataset_v1",
  "live_company_map_entities_v1",
  "live_company_map_financials_v1"
TO fjord_financial_runtime;

REVOKE ALL PRIVILEGES ON TABLE
  "CompanyMapBuild",
  "CompanyMapPublication",
  "CompanyMapEntitySnapshot",
  "CompanyMapFinancialSnapshot",
  "CompanyMapFinancialDatasetPublication",
  "FinancialDatasetRevision",
  "Company"
FROM fjord_financial_runtime;
