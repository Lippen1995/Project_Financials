-- Comment threads on financial statements need the same dataset provenance the finding
-- evidence already carries. Without it a thread cannot be quarantined when the active dataset
-- is switched: the evidence surface can tell that a note was captured against a dataset that is
-- no longer active, and the comment surface cannot.
ALTER TABLE "DdCommentThread"
  ADD COLUMN "financialDatasetMode" TEXT,
  ADD COLUMN "financialDatasetVersion" TEXT,
  ADD COLUMN "financialDatasetQuarantined" BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing financial threads predate dataset versioning. Keep them readable, but never let them
-- pass for threads captured against the active dataset.
UPDATE "DdCommentThread"
SET
  "financialDatasetMode" = 'reported',
  "financialDatasetVersion" = 'reported:0',
  "financialDatasetQuarantined" = TRUE
WHERE "targetType" = 'FINANCIAL_STATEMENT';

ALTER TABLE "DdCommentThread"
  ADD CONSTRAINT "DdCommentThread_financialDatasetMode_check"
  CHECK (
    "financialDatasetMode" IS NULL
    OR "financialDatasetMode" IN ('reported', 'simulated')
  ),
  ADD CONSTRAINT "DdCommentThread_financialDatasetVersion_check"
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
  ADD CONSTRAINT "DdCommentThread_financialDatasetRequired_check"
  CHECK (
    "targetType" <> 'FINANCIAL_STATEMENT'
    OR (
      "financialDatasetMode" IS NOT NULL
      AND "financialDatasetVersion" IS NOT NULL
    )
  );

CREATE INDEX "DdCommentThread_financialDatasetVersion_idx"
  ON "DdCommentThread"("financialDatasetVersion");
