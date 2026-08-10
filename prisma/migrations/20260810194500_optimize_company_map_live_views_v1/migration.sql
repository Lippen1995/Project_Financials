-- The company-map views expose only the already-public, atomically selected map build. They do
-- not need a security barrier: privileges on the views provide the access boundary, while normal
-- view inlining lets PostgreSQL push build, organisation-form and status filters into the existing
-- snapshot indexes.

ALTER VIEW "live_company_map_dataset_v1" RESET (security_barrier);
ALTER VIEW "live_company_map_entities_v1" RESET (security_barrier);
ALTER VIEW "live_company_map_financials_v1" RESET (security_barrier);
