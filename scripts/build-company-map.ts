import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { COMPANY_MAP_ADDRESS_MATCHER_VERSION } from "@/server/company-map/address-resolution";

const FINANCIAL_DATASET_PENDING = "reported-only:pending-live-view";

function wantsPublication(): boolean {
  return process.argv.slice(2).includes("--publish");
}

async function main() {
  const publish = wantsPublication();
  if (publish) {
    throw new Error(
      "Public publication is blocked until the reported-only financial live view populates the build.",
    );
  }
  const addressDataset = await prisma.officialAddressDataset.findFirst({
    where: { status: "READY", isComplete: true },
    orderBy: { sourceUpdatedAt: "desc" },
  });
  if (!addressDataset) {
    throw new Error(
      "No complete READY Kartverket address dataset. Run npm run kartverket:ingest-addresses first.",
    );
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext('fjord-insight-registry-entity-publication'), 0)
      `;

      const registryImport = await tx.registryEntityImport.findFirst({
        where: {
          status: "COMPLETED",
          isUnfiltered: true,
          reachedEof: true,
        },
        orderBy: { completedAt: "desc" },
      });
      if (!registryImport) {
        throw new Error(
          "No proven complete Brreg mirror. Run npm run brreg:ingest-entities without filters.",
        );
      }

      const [registryStats] = await tx.$queryRaw<
        Array<{
          entityCount: bigint;
          businessAddressCount: bigint;
          normalizedAddressCount: bigint;
          earliestSnapshotAt: Date | null;
          latestSnapshotAt: Date | null;
        }>
      >`
    SELECT
      count(*)::bigint AS "entityCount",
      count(*) FILTER (WHERE "businessAddressStreet" IS NOT NULL)::bigint AS "businessAddressCount",
      count(*) FILTER (
        WHERE "businessAddressNormalizedName" IS NOT NULL
          AND "businessAddressHouseNumber" IS NOT NULL
      )::bigint AS "normalizedAddressCount",
      min("sourceSnapshotAt") AS "earliestSnapshotAt",
      max("sourceSnapshotAt") AS "latestSnapshotAt"
    FROM "RegistryEntity"
  `;
      if (
        !registryStats ||
        registryStats.entityCount !== BigInt(registryImport.rowCount) ||
        registryStats.earliestSnapshotAt?.getTime() !==
          registryImport.snapshotAt.getTime() ||
        registryStats.latestSnapshotAt?.getTime() !==
          registryImport.snapshotAt.getTime()
      ) {
        throw new Error(
          "RegistryEntity no longer matches its completed Brreg import evidence; run the full ingest.",
        );
      }
      if (
        registryStats.businessAddressCount > 0n &&
        registryStats.normalizedAddressCount === 0n
      ) {
        throw new Error(
          "The Brreg mirror predates exact business-address fields. Re-run npm run brreg:ingest-entities.",
        );
      }

      const groupPublication = await tx.groupRelationshipPublication.findFirst({
        where: { sourceImportStatus: "COMPLETED" },
        orderBy: { taxYear: "desc" },
      });
      const buildId = randomUUID();
      const now = new Date();
      await tx.companyMapBuild.create({
        data: {
          id: buildId,
          status: "BUILDING",
          addressDatasetId: addressDataset.id,
          matcherVersion: COMPANY_MAP_ADDRESS_MATCHER_VERSION,
          registrySnapshotAt: registryImport.snapshotAt,
          registryImportId: registryImport.id,
          groupBuildId: groupPublication?.buildId ?? null,
          groupTaxYear: groupPublication?.taxYear ?? null,
          financialDatasetVersion: FINANCIAL_DATASET_PENDING,
          sourceSystem: "FJORD_INSIGHT",
          sourceEntityType: "CompanyMapBuild",
          sourceId: buildId,
          fetchedAt: now,
          normalizedAt: now,
        },
      });

      try {
        await tx.$executeRaw(Prisma.sql`
      INSERT INTO "CompanyMapEntitySnapshot" (
        "buildId", "orgNumber", "name", "organisationForm", "companyStatus",
        "employeeCount", "addressStreet", "postalCode", "postalPlace", "municipality",
        "municipalityNumber", "countryCode", "resolutionStatus", "officialAddressId",
        "latitude", "longitude", "groupRootOrgNumber", "groupRootName",
        "groupMembershipStatus", "groupTaxYear", "registerUpdatedAt",
        "registrySourceSystem", "registrySourceEntityType", "registrySourceId",
        "registryFetchedAt", "registryNormalizedAt", "builtAt"
      )
      SELECT
        ${buildId}::uuid,
        registry."orgNumber",
        registry."name",
        registry."organisationForm",
        registry."status",
        registry."employeeCount",
        registry."businessAddressStreet",
        registry."businessAddressPostalCode",
        registry."businessAddressPostalPlace",
        registry."businessAddressMunicipality",
        registry."businessAddressMunicipalityNumber",
        registry."businessAddressCountryCode",
        CASE
          WHEN upper(coalesce(registry."businessAddressCountryCode", 'NO')) NOT IN ('NO', 'NOR', 'NORGE')
            THEN 'OUTSIDE_NORWAY'::"CompanyMapAddressResolutionStatus"
          WHEN nullif(btrim(registry."businessAddressStreet"), '') IS NULL
            THEN 'NO_BUSINESS_ADDRESS'::"CompanyMapAddressResolutionStatus"
          WHEN registry."businessAddressStreet" ~* '^(POSTBOKS|POSTB\\.?|PB\\.?)\\y'
            THEN 'NON_GEOGRAPHIC_ADDRESS'::"CompanyMapAddressResolutionStatus"
          WHEN registry."businessAddressMunicipalityNumber" IS NULL
            OR registry."businessAddressNormalizedName" IS NULL
            OR registry."businessAddressHouseNumber" IS NULL
            THEN 'INCOMPLETE_OR_INVALID'::"CompanyMapAddressResolutionStatus"
          WHEN official."matchCount" = 0
            THEN 'NO_EXACT_MATCH'::"CompanyMapAddressResolutionStatus"
          WHEN official."matchCount" > 1
            THEN 'AMBIGUOUS_EXACT_MATCH'::"CompanyMapAddressResolutionStatus"
          WHEN upper(coalesce(registry."organisationForm", '')) = 'ENK'
            THEN 'PRIVACY_WITHHELD'::"CompanyMapAddressResolutionStatus"
          ELSE 'MATCHED'::"CompanyMapAddressResolutionStatus"
        END,
        CASE WHEN official."matchCount" = 1
          AND upper(coalesce(registry."organisationForm", '')) <> 'ENK'
          AND upper(coalesce(registry."businessAddressCountryCode", 'NO')) IN ('NO', 'NOR', 'NORGE')
          THEN official."officialAddressId" END,
        CASE WHEN official."matchCount" = 1
          AND upper(coalesce(registry."organisationForm", '')) <> 'ENK'
          AND upper(coalesce(registry."businessAddressCountryCode", 'NO')) IN ('NO', 'NOR', 'NORGE')
          THEN official."latitude" END,
        CASE WHEN official."matchCount" = 1
          AND upper(coalesce(registry."organisationForm", '')) <> 'ENK'
          AND upper(coalesce(registry."businessAddressCountryCode", 'NO')) IN ('NO', 'NOR', 'NORGE')
          THEN official."longitude" END,
        CASE WHEN membership."status" = 'RESOLVED' THEN membership."groupRootOrgNumber" END,
        CASE WHEN membership."status" = 'RESOLVED' THEN group_root."name" END,
        membership."status",
        membership."taxYear",
        registry."registerUpdatedAt",
        registry."sourceSystem",
        registry."sourceEntityType",
        registry."sourceId",
        registry."fetchedAt",
        registry."normalizedAt",
        ${now}
      FROM "RegistryEntity" registry
      LEFT JOIN LATERAL (
        SELECT
          count(*)::integer AS "matchCount",
          min(address."officialAddressId") AS "officialAddressId",
          min(address."latitude") AS "latitude",
          min(address."longitude") AS "longitude"
        FROM "OfficialAddress" address
        WHERE address."datasetId" = ${addressDataset.id}::uuid
          AND address."municipalityNumber" = registry."businessAddressMunicipalityNumber"
          AND address."normalizedAddressName" = registry."businessAddressNormalizedName"
          AND address."houseNumber" = registry."businessAddressHouseNumber"
          AND address."houseLetter" IS NOT DISTINCT FROM registry."businessAddressHouseLetter"
          AND address."unitNumber" IS NOT DISTINCT FROM registry."businessAddressUnitNumber"
      ) official ON true
      LEFT JOIN "GroupMembershipSnapshot" membership
        ON membership."buildId" = ${groupPublication?.buildId ?? null}::uuid
        AND membership."taxYear" = ${groupPublication?.taxYear ?? null}
        AND membership."memberOrgNumber" = registry."orgNumber"
      LEFT JOIN "RegistryEntity" group_root
        ON group_root."orgNumber" = membership."groupRootOrgNumber"
    `);

        const [counts] = await tx.$queryRaw<
          Array<{
            entityCount: bigint;
            plottedCount: bigint;
            omittedCount: bigint;
          }>
        >(Prisma.sql`
      SELECT
        count(*)::bigint AS "entityCount",
        count(*) FILTER (WHERE "resolutionStatus" = 'MATCHED')::bigint AS "plottedCount",
        count(*) FILTER (WHERE "resolutionStatus" <> 'MATCHED')::bigint AS "omittedCount"
      FROM "CompanyMapEntitySnapshot"
      WHERE "buildId" = ${buildId}::uuid
    `);
        if (!counts || counts.entityCount !== registryStats.entityCount) {
          throw new Error(
            "Candidate map build did not retain every RegistryEntity row.",
          );
        }

        const completedAt = new Date();
        await tx.companyMapBuild.update({
          where: { id: buildId },
          data: {
            status: "READY",
            entityCount: Number(counts.entityCount),
            plottedCount: Number(counts.plottedCount),
            omittedCount: Number(counts.omittedCount),
            completedAt,
            normalizedAt: completedAt,
          },
        });

        console.log(
          `READY map candidate ${buildId}: ${counts.plottedCount}/${counts.entityCount} plotted; ` +
            `${counts.omittedCount} retained as omissions.`,
        );
      } catch (error) {
        const failureReason =
          error instanceof Error ? error.message : String(error);
        await tx.companyMapBuild.update({
          where: { id: buildId },
          data: {
            status: "FAILED",
            failureReason: failureReason.slice(0, 2_000),
          },
        });
        throw error;
      }
    },
    { isolationLevel: "RepeatableRead", maxWait: 60_000, timeout: 900_000 },
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
