ALTER TABLE "CompanyEventFeedback"
  ADD COLUMN IF NOT EXISTS "action" TEXT NOT NULL DEFAULT 'relevant',
  ADD COLUMN IF NOT EXISTS "previousValue" JSONB,
  ADD COLUMN IF NOT EXISTS "correctedValue" JSONB;

CREATE INDEX IF NOT EXISTS "CompanyEventFeedback_action_createdAt_idx"
  ON "CompanyEventFeedback"("action", "createdAt" DESC);
