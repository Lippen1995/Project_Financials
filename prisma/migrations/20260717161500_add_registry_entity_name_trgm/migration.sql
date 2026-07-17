-- Typeahead uses case-insensitive contains matching across the Brreg entity mirror.
-- A regular B-tree name index cannot serve ILIKE '%term%' over 1.2M rows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS registry_entity_name_trgm
ON "RegistryEntity" USING GIN ("name" gin_trgm_ops);
