-- The public map filters by fylke, and the only county signal the snapshot carries is the first
-- two digits of Brønnøysundregistrene's municipality number. Expose that column on both restricted
-- views so county filtering stays inside the same publication guard as every other filter.

CREATE OR REPLACE VIEW "live_company_map_entities_v1" AS
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
  entity."groupRootName",
  entity."municipalityNumber"
FROM "live_company_map_dataset_v1" dataset
JOIN "CompanyMapEntitySnapshot" entity
  ON entity."buildId" = dataset."buildId";

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
  entity."groupRootName",
  entity."municipalityNumber"
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

-- Name search and county filtering both scan the published entity snapshot for one build.
CREATE INDEX IF NOT EXISTS "company_map_entity_municipality_number"
  ON "CompanyMapEntitySnapshot" ("buildId", "municipalityNumber");
