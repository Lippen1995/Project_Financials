ALTER TABLE "AnalysisWorklist"
  ADD COLUMN "financialDatasetMode" TEXT,
  ADD COLUMN "financialDatasetVersion" TEXT;

ALTER TABLE "AnalysisWorklist"
  ADD CONSTRAINT "AnalysisWorklist_financialDatasetMode_check"
  CHECK (
    "financialDatasetMode" IS NULL
    OR "financialDatasetMode" IN ('reported', 'simulated')
  ),
  ADD CONSTRAINT "AnalysisWorklist_financialDatasetVersion_check"
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

CREATE INDEX "AnalysisWorklist_financialDatasetVersion_idx"
  ON "AnalysisWorklist"("financialDatasetVersion");
