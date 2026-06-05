-- Persisted family classification for reviewer-created custom keys (keys not in
-- the CanonicalKey registry). Their derived family is unreliable for balance
-- details entered on NOTE/income-typed rows, so reviewers can override it.
CREATE TABLE IF NOT EXISTS "CanonicalKeyFamilyOverride" (
    "id" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CanonicalKeyFamilyOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CanonicalKeyFamilyOverride_metricKey_key"
    ON "CanonicalKeyFamilyOverride"("metricKey");
