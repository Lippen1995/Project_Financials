ALTER TABLE "RegistryEntity"
  ADD COLUMN "businessAddressStreet" TEXT,
  ADD COLUMN "businessAddressPostalCode" TEXT,
  ADD COLUMN "businessAddressPostalPlace" TEXT,
  ADD COLUMN "businessAddressMunicipality" TEXT,
  ADD COLUMN "businessAddressMunicipalityNumber" TEXT,
  ADD COLUMN "businessAddressCountryCode" TEXT;

-- The current mirror was built business-address-only by the immediately preceding map
-- migration. Preserve those values in the dedicated fields before restoring postal fallback
-- for non-map consumers on the next Brreg refresh.
UPDATE "RegistryEntity"
SET
  "businessAddressStreet" = "addressStreet",
  "businessAddressPostalCode" = "postalCode",
  "businessAddressPostalPlace" = "postalPlace",
  "businessAddressMunicipality" = "municipality",
  "businessAddressMunicipalityNumber" = "municipalityNumber",
  "businessAddressCountryCode" = "countryCode";

DROP INDEX "registry_entity_exact_address";
CREATE INDEX "registry_entity_exact_address"
  ON "RegistryEntity"(
    "businessAddressMunicipalityNumber",
    "businessAddressNormalizedName",
    "businessAddressHouseNumber"
  );

ALTER TABLE "OfficialAddress"
  ADD COLUMN "sourceSystem" TEXT NOT NULL DEFAULT 'KARTVERKET',
  ADD COLUMN "sourceEntityType" TEXT NOT NULL DEFAULT 'MatrikkelenAddress',
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "fetchedAt" TIMESTAMP(3);

UPDATE "OfficialAddress" address
SET
  "sourceId" = address."officialAddressId",
  "fetchedAt" = dataset."fetchedAt"
FROM "OfficialAddressDataset" dataset
WHERE dataset."id" = address."datasetId";

ALTER TABLE "OfficialAddress"
  ALTER COLUMN "sourceId" SET NOT NULL,
  ALTER COLUMN "fetchedAt" SET NOT NULL,
  ALTER COLUMN "sourceSystem" DROP DEFAULT,
  ALTER COLUMN "sourceEntityType" DROP DEFAULT;
