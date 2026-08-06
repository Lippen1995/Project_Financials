CREATE OR REPLACE FUNCTION "prevent_published_company_map_snapshot_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (
      SELECT 1 FROM "CompanyMapBuild"
      WHERE "id" = NEW."buildId" AND "status" = 'PUBLISHED'
    ) THEN
      RAISE EXCEPTION 'Published company-map snapshots are immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF EXISTS (
      SELECT 1 FROM "CompanyMapBuild"
      WHERE "id" IN (OLD."buildId", NEW."buildId") AND "status" = 'PUBLISHED'
    ) THEN
      RAISE EXCEPTION 'Published company-map snapshots are immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "CompanyMapBuild"
    WHERE "id" = OLD."buildId" AND "status" = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'Published company-map snapshots are immutable';
  END IF;
  RETURN OLD;
END;
$$;
