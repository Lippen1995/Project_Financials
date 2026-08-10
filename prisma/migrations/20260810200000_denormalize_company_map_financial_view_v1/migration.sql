-- Financial ranking and coverage need the public entity filters for every financial row. Expose
-- those fields in the same restricted view so normal requests do not join two independently
-- version-gated views and repeat the publication guard for every aggregate.

CREATE OR REPLACE VIEW "live_company_map_financials_v1" AS
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
  financial."financialNormalizedAt",
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
JOIN "CompanyMapFinancialSnapshot" financial
  ON financial."buildId" = dataset."buildId"
  AND financial."financialDatasetVersion" = dataset."financialDatasetVersion"
JOIN "CompanyMapEntitySnapshot" entity
  ON entity."buildId" = financial."buildId"
  AND entity."orgNumber" = financial."orgNumber"
JOIN "Company" company
  ON company."orgNumber" = financial."orgNumber"
WHERE financial."valueOrigin" = 'reported';

COMMENT ON VIEW "live_company_map_financials_v1" IS
  'Reported-only metrics and public entity filters for the active company-map build.';
