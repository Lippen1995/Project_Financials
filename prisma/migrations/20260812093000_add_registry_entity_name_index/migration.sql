-- Flattened name index over the register: one row per name an entity has carried, current or
-- historic. Lets company search match former names and lets a name be traced across org
-- numbers without scanning RegistryEntity.previousNames as jsonb.
CREATE TABLE "RegistryEntityName" (
    "id" TEXT NOT NULL,
    "orgNumber" VARCHAR(9) NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL,
    "fromDate" TIMESTAMP(3),
    "toDate" TIMESTAMP(3),
    "sourceSnapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceSystem" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistryEntityName_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RegistryEntityName_normalizedName_idx" ON "RegistryEntityName"("normalizedName");
CREATE INDEX "RegistryEntityName_orgNumber_idx" ON "RegistryEntityName"("orgNumber");
CREATE INDEX "RegistryEntityName_isCurrent_idx" ON "RegistryEntityName"("isCurrent");

-- Substring search over names needs trigrams, the same way RegistryEntity."name" already does.
-- Guarded so a deployment without permission to create the extension still applies the migration.
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'pg_trgm unavailable; skipping the trigram index on RegistryEntityName.';
END
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        CREATE INDEX IF NOT EXISTS "registry_entity_name_value_trgm"
            ON "RegistryEntityName" USING gin ("name" gin_trgm_ops);
    END IF;
END
$$;
