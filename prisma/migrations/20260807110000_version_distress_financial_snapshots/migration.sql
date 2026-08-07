ALTER TABLE "DistressFinancialSnapshot"
  ADD COLUMN "financialDatasetMode" TEXT,
  ADD COLUMN "financialDatasetVersion" TEXT;

ALTER TABLE "DistressFinancialSnapshot"
  ADD CONSTRAINT "DistressFinancialSnapshot_financialDatasetMode_check"
  CHECK (
    "financialDatasetMode" IS NULL
    OR "financialDatasetMode" IN ('reported', 'simulated')
  ),
  ADD CONSTRAINT "DistressFinancialSnapshot_financialDatasetVersion_check"
  CHECK (
    ("financialDatasetMode" IS NULL AND "financialDatasetVersion" IS NULL)
    OR (
      "financialDatasetMode" IS NOT NULL
      AND "financialDatasetVersion" IS NOT NULL
      AND (
        ("financialDatasetMode" = 'reported' AND "financialDatasetVersion" ~ '^reported:[0-9]+$')
        OR ("financialDatasetMode" = 'simulated' AND "financialDatasetVersion" ~ '^simulated:[A-Za-z0-9_-]+:[0-9]+$')
      )
    )
  );

CREATE INDEX "DistressFinancialSnapshot_financialDatasetVersion_idx"
  ON "DistressFinancialSnapshot"("financialDatasetVersion");
