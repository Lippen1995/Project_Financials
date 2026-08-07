ALTER TABLE "DdFindingEvidence"
  ADD COLUMN "financialDatasetMode" TEXT,
  ADD COLUMN "financialDatasetVersion" TEXT,
  ADD COLUMN "financialDatasetQuarantined" BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing financial evidence predates dataset versioning. Keep it available for
-- explicit quarantine, but never mistake it for evidence from the active dataset.
UPDATE "DdFindingEvidence"
SET
  "financialDatasetMode" = 'reported',
  "financialDatasetVersion" = 'reported:0',
  "financialDatasetQuarantined" = TRUE
WHERE "type" = 'FINANCIAL_STATEMENT';

ALTER TABLE "DdFindingEvidence"
  ADD CONSTRAINT "DdFindingEvidence_financialDatasetMode_check"
  CHECK (
    "financialDatasetMode" IS NULL
    OR "financialDatasetMode" IN ('reported', 'simulated')
  ),
  ADD CONSTRAINT "DdFindingEvidence_financialDatasetVersion_check"
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
  ),
  ADD CONSTRAINT "DdFindingEvidence_financialDatasetRequired_check"
  CHECK (
    "type" <> 'FINANCIAL_STATEMENT'
    OR (
      "financialDatasetMode" IS NOT NULL
      AND "financialDatasetVersion" IS NOT NULL
    )
  );

CREATE INDEX "DdFindingEvidence_financialDatasetVersion_idx"
  ON "DdFindingEvidence"("financialDatasetVersion");
