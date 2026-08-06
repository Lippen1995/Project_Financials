ALTER TABLE "CompanyMapFinancialDatasetPublication"
  ADD CONSTRAINT "CompanyMapFinancialDatasetPublication_buildId_fkey"
  FOREIGN KEY ("buildId") REFERENCES "CompanyMapBuild"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
