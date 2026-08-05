import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  GROUP_RELATIONSHIP_RULE_VERSION,
  LIMITED_COMPANY_FORMS,
  PUBLIC_ADMINISTRATION_ORGANISATION_FORMS,
  PUBLIC_ADMINISTRATION_SECTOR_CODES,
  SSB_INSTITUTIONAL_SECTOR_STANDARD_REFERENCE,
  SSB_INSTITUTIONAL_SECTOR_STANDARD_VERSION,
} from "@/server/ownership/group-relationship-classifier";

export type GroupRelationshipSnapshotBuildResult = {
  taxYear: number;
  buildId: string;
  relationshipCount: number;
  membershipCount: number;
  groupSubsidiaryCount: number;
  groupAssociateCount: number;
  financialPositionCount: number;
  minorityPositionCount: number;
  unknownCount: number;
  conflictCount: number;
};

export type CompleteShareholderRegisterImport = {
  id: string;
  sourceSystem: string;
  status: "COMPLETED";
  sourceId: string | null;
  sourceChecksum: string | null;
  importedRowCount: number;
  fetchedAt: Date;
};

export async function acquireOwnershipPublicationLocks(
  tx: Prisma.TransactionClient,
  taxYear: number,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext('fjord-insight-group-relationship'), ${taxYear})
  `;
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext('fjord-insight-registry-entity-publication'), 0)
  `;
}

export async function requireCompleteShareholderRegisterImport(
  tx: Prisma.TransactionClient,
  taxYear: number,
): Promise<CompleteShareholderRegisterImport> {
  const sourceImport = await tx.shareholderRegisterImport.findFirst({
    where: { taxYear, status: "COMPLETED" },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      sourceSystem: true,
      status: true,
      sourceId: true,
      sourceChecksum: true,
      importedRowCount: true,
      fetchedAt: true,
    },
  });
  if (!sourceImport) {
    throw new Error(
      `Cannot publish group relationships for ${taxYear}: no complete shareholder-register import exists.`,
    );
  }
  return { ...sourceImport, status: "COMPLETED" };
}

/**
 * Build an immutable semantic projection and publish it only after the complete INSERT succeeds.
 * The previous build remains readable during construction and is removed after the publication
 * pointer has moved, so readers never observe a partially rebuilt group graph.
 */
export async function buildGroupRelationshipSnapshotForYear(
  taxYear: number,
): Promise<GroupRelationshipSnapshotBuildResult> {
  return prisma.$transaction(
    async (tx) => {
      await acquireOwnershipPublicationLocks(tx, taxYear);
      const sourceImport = await requireCompleteShareholderRegisterImport(tx, taxYear);
      return buildGroupRelationshipSnapshotInTransaction(tx, taxYear, sourceImport);
    },
    { maxWait: 60_000, timeout: 900_000 },
  );
}

export async function buildGroupRelationshipSnapshotInTransaction(
  tx: Prisma.TransactionClient,
  taxYear: number,
  sourceImport: CompleteShareholderRegisterImport,
): Promise<GroupRelationshipSnapshotBuildResult> {
  const buildId = randomUUID();
  const normalizedAt = new Date();
  const ownershipAsOf = new Date(Date.UTC(taxYear, 11, 31));
  const publicOwnerPredicate = Prisma.sql`(
    owner."institutionalSectorCode" IN (${Prisma.join([...PUBLIC_ADMINISTRATION_SECTOR_CODES])})
    OR owner."organisationForm" IN (${Prisma.join([...PUBLIC_ADMINISTRATION_ORGANISATION_FORMS])})
  )`;

  const ownershipSourceId = sourceImport.sourceId ?? sourceImport.sourceChecksum ?? sourceImport.id;

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "GroupRelationshipSnapshot" (
        "buildId", "taxYear", "issuerOrgNumber", "ownerOrgNumber", "issuerName", "ownerName",
        "ownershipPercent", "ownershipBand", "relationship", "ownerCategory", "reasonCode",
        "ruleVersion", "sourceSystem", "sourceEntityType", "sourceId", "fetchedAt",
        "normalizedAt", "ownerMetadataSourceSystem", "ownerMetadataSourceEntityType",
        "ownerMetadataSourceId", "ownerMetadataFetchedAt", "ownerMetadataNormalizedAt",
        "issuerMetadataSourceSystem", "issuerMetadataSourceEntityType", "issuerMetadataSourceId",
        "issuerMetadataFetchedAt", "issuerMetadataNormalizedAt", "builtAt"
      )
      WITH RECURSIVE edge_context AS (
        SELECT
          e.*,
          count(*) FILTER (WHERE e."relationship" = 'SUBSIDIARY') OVER (
            PARTITION BY e."taxYear", e."issuerOrgNumber"
          ) AS "controllingOwnerCount"
        FROM "OwnershipEdge" e
        WHERE e."taxYear" = ${taxYear}
          AND e."sourceImportId" = ${sourceImport.id}
      ), enriched AS (
        SELECT
          e.*,
          owner."orgNumber" AS "resolvedOwnerOrgNumber",
          issuer."orgNumber" AS "resolvedIssuerOrgNumber",
          owner."organisationForm" AS "ownerOrganisationForm",
          owner."institutionalSectorCode" AS "ownerInstitutionalSectorCode",
          issuer."organisationForm" AS "issuerOrganisationForm",
          owner."sourceSystem" AS "ownerMetadataSourceSystem",
          owner."sourceEntityType" AS "ownerMetadataSourceEntityType",
          owner."sourceId" AS "ownerMetadataSourceId",
          owner."fetchedAt" AS "ownerMetadataFetchedAt",
          owner."normalizedAt" AS "ownerMetadataNormalizedAt",
          issuer."sourceSystem" AS "issuerMetadataSourceSystem",
          issuer."sourceEntityType" AS "issuerMetadataSourceEntityType",
          issuer."sourceId" AS "issuerMetadataSourceId",
          issuer."fetchedAt" AS "issuerMetadataFetchedAt",
          issuer."normalizedAt" AS "issuerMetadataNormalizedAt",
          ${publicOwnerPredicate} AS "isPublicNonCommercial"
        FROM edge_context e
        LEFT JOIN "RegistryEntity" owner ON owner."orgNumber" = e."ownerOrgNumber"
        LEFT JOIN "RegistryEntity" issuer ON issuer."orgNumber" = e."issuerOrgNumber"
      ), preclassified AS (
        SELECT
          e.*,
          (CASE
            WHEN e."resolvedOwnerOrgNumber" IS NULL OR e."resolvedIssuerOrgNumber" IS NULL
              THEN 'UNKNOWN'
            WHEN e."ownerOrganisationForm" IS NULL AND e."ownerInstitutionalSectorCode" IS NULL
              THEN 'UNKNOWN'
            WHEN e."issuerOrganisationForm" IS NULL THEN 'UNKNOWN'
            WHEN e."isPublicNonCommercial"
              AND e."issuerOrganisationForm" IN (${Prisma.join([...LIMITED_COMPANY_FORMS])})
              THEN 'FINANCIAL_POSITION'
            WHEN e."totalIssuerShares" IS NOT NULL
              AND e."aggregatedShares" > e."totalIssuerShares" THEN 'CONFLICT'
            WHEN e."ownershipPercent" IS NULL THEN 'UNKNOWN'
            WHEN e."controllingOwnerCount" > 1 AND e."relationship" = 'SUBSIDIARY'
              THEN 'CONFLICT'
            WHEN e."relationship" = 'SUBSIDIARY' THEN 'GROUP_SUBSIDIARY'
            WHEN e."relationship" = 'ASSOCIATED' THEN 'GROUP_ASSOCIATE'
            ELSE 'MINORITY_POSITION'
          END)::"GroupRelationshipKind" AS "preliminaryRelationship",
          (CASE
            WHEN e."resolvedOwnerOrgNumber" IS NULL
              OR (e."ownerOrganisationForm" IS NULL AND e."ownerInstitutionalSectorCode" IS NULL)
              THEN 'UNKNOWN'
            WHEN e."isPublicNonCommercial" THEN 'PUBLIC_NON_COMMERCIAL'
            ELSE 'OTHER_ORGANISATION'
          END)::"GroupOwnerCategory" AS "classifiedOwnerCategory",
          (CASE
            WHEN e."resolvedOwnerOrgNumber" IS NULL OR e."resolvedIssuerOrgNumber" IS NULL
              THEN 'REGISTRY_ENTITY_MISSING'
            WHEN (e."ownerOrganisationForm" IS NULL AND e."ownerInstitutionalSectorCode" IS NULL)
              OR e."issuerOrganisationForm" IS NULL THEN 'REGISTRY_METADATA_INCOMPLETE'
            WHEN e."isPublicNonCommercial"
              AND e."issuerOrganisationForm" IN (${Prisma.join([...LIMITED_COMPANY_FORMS])})
              THEN 'PUBLIC_OWNER_AS_ASA'
            WHEN e."totalIssuerShares" IS NOT NULL
              AND e."aggregatedShares" > e."totalIssuerShares" THEN 'OWNERSHIP_TOTAL_CONFLICT'
            WHEN e."ownershipPercent" IS NULL THEN 'OWNERSHIP_PERCENT_MISSING'
            WHEN e."controllingOwnerCount" > 1 AND e."relationship" = 'SUBSIDIARY'
              THEN 'MULTIPLE_CONTROLLING_OWNERS'
            WHEN e."relationship" = 'SUBSIDIARY' THEN 'OWNERSHIP_OVER_50'
            WHEN e."relationship" = 'ASSOCIATED' THEN 'OWNERSHIP_20_TO_50'
            ELSE 'OWNERSHIP_BELOW_20'
          END) AS "preliminaryReasonCode"
        FROM enriched e
      ), control_walk AS (
        SELECT
          e."issuerOrgNumber" AS "startIssuerOrgNumber",
          e."ownerOrgNumber" AS "currentOrgNumber",
          ARRAY[e."issuerOrgNumber", e."ownerOrgNumber"]::text[] AS path,
          e."issuerOrgNumber" = e."ownerOrgNumber" AS cycle,
          1 AS depth
        FROM preclassified e
        WHERE e."preliminaryRelationship" = 'GROUP_SUBSIDIARY'

        UNION ALL

        SELECT
          walk."startIssuerOrgNumber",
          next."ownerOrgNumber",
          walk.path || next."ownerOrgNumber",
          next."ownerOrgNumber" = ANY(walk.path),
          walk.depth + 1
        FROM control_walk walk
        JOIN preclassified next
          ON next."issuerOrgNumber" = walk."currentOrgNumber"
         AND next."preliminaryRelationship" = 'GROUP_SUBSIDIARY'
        WHERE NOT walk.cycle AND walk.depth < 20
      ), conflicted_chains AS (
        SELECT DISTINCT walk."startIssuerOrgNumber"
        FROM control_walk walk
        WHERE walk.cycle
           OR (
             walk.depth = 20
             AND EXISTS (
               SELECT 1
               FROM preclassified next
               WHERE next."issuerOrgNumber" = walk."currentOrgNumber"
                 AND next."preliminaryRelationship" = 'GROUP_SUBSIDIARY'
             )
           )
      )
      SELECT
        ${buildId}::uuid,
        e."taxYear",
        e."issuerOrgNumber",
        e."ownerOrgNumber",
        e."issuerName",
        e."ownerName",
        e."ownershipPercent",
        e."relationship",
        (CASE WHEN conflict."startIssuerOrgNumber" IS NOT NULL
          AND e."preliminaryRelationship" = 'GROUP_SUBSIDIARY'
          THEN 'CONFLICT' ELSE e."preliminaryRelationship" END)::"GroupRelationshipKind",
        e."classifiedOwnerCategory",
        (CASE WHEN conflict."startIssuerOrgNumber" IS NOT NULL
          AND e."preliminaryRelationship" = 'GROUP_SUBSIDIARY'
          THEN 'CONTROL_CHAIN_CYCLE_OR_DEPTH_LIMIT' ELSE e."preliminaryReasonCode" END),
        ${GROUP_RELATIONSHIP_RULE_VERSION},
        ${String(sourceImport.sourceSystem)},
        ${"derived_group_relationship"},
        ${ownershipSourceId} || ':' || e."issuerOrgNumber" || ':' || e."ownerOrgNumber",
        ${sourceImport.fetchedAt},
        ${normalizedAt},
        e."ownerMetadataSourceSystem",
        e."ownerMetadataSourceEntityType",
        e."ownerMetadataSourceId",
        e."ownerMetadataFetchedAt",
        e."ownerMetadataNormalizedAt",
        e."issuerMetadataSourceSystem",
        e."issuerMetadataSourceEntityType",
        e."issuerMetadataSourceId",
        e."issuerMetadataFetchedAt",
        e."issuerMetadataNormalizedAt",
        ${normalizedAt}
      FROM preclassified e
      LEFT JOIN conflicted_chains conflict
        ON conflict."startIssuerOrgNumber" = e."issuerOrgNumber"
    `);

    // Traverse only semantic subsidiary edges. Public AS/ASA holdings, associates, minority
    // positions and unknown/conflicted edges can therefore never become group ancestors.
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "GroupMembershipSnapshot" (
        "buildId", "taxYear", "memberOrgNumber", "directParentOrgNumber",
        "groupRootOrgNumber", "depth", "path", "status", "ruleVersion",
        "ownershipAsOf", "sourceSystem", "sourceEntityType", "sourceId",
        "fetchedAt", "normalizedAt", "builtAt"
      )
      WITH RECURSIVE group_edges AS (
        SELECT "issuerOrgNumber", "ownerOrgNumber"
        FROM "GroupRelationshipSnapshot"
        WHERE "buildId" = ${buildId}::uuid
          AND "taxYear" = ${taxYear}
          AND "relationship" = 'GROUP_SUBSIDIARY'
      ), ambiguous_nodes AS (
        SELECT
          relationship."issuerOrgNumber" AS "memberOrgNumber",
          (CASE
            WHEN bool_or(relationship."relationship" = 'CONFLICT') THEN 'CONFLICT'
            ELSE 'UNKNOWN'
          END)::"GroupMembershipStatus" AS status
        FROM "GroupRelationshipSnapshot" relationship
        WHERE relationship."buildId" = ${buildId}::uuid
          AND relationship."taxYear" = ${taxYear}
          AND relationship."relationship" IN ('CONFLICT', 'UNKNOWN')
        GROUP BY relationship."issuerOrgNumber"
      ), roots AS (
        SELECT DISTINCT
          edge."ownerOrgNumber" AS "rootOrgNumber",
          coalesce(ambiguous.status, 'RESOLVED'::"GroupMembershipStatus") AS status
        FROM group_edges edge
        LEFT JOIN ambiguous_nodes ambiguous
          ON ambiguous."memberOrgNumber" = edge."ownerOrgNumber"
        WHERE NOT EXISTS (
          SELECT 1
          FROM group_edges parent
          WHERE parent."issuerOrgNumber" = edge."ownerOrgNumber"
        )
      ), membership_walk AS (
        SELECT
          root."rootOrgNumber" AS "memberOrgNumber",
          NULL::text AS "directParentOrgNumber",
          root."rootOrgNumber" AS "groupRootOrgNumber",
          0 AS depth,
          ARRAY[root."rootOrgNumber"]::text[] AS path,
          root.status
        FROM roots root

        UNION ALL

        SELECT
          edge."issuerOrgNumber",
          edge."ownerOrgNumber",
          walk."groupRootOrgNumber",
          walk.depth + 1,
          walk.path || edge."issuerOrgNumber",
          (CASE
            WHEN walk.status = 'CONFLICT' OR ambiguous.status = 'CONFLICT' THEN 'CONFLICT'
            WHEN walk.status = 'UNKNOWN' OR ambiguous.status = 'UNKNOWN' THEN 'UNKNOWN'
            ELSE 'RESOLVED'
          END)::"GroupMembershipStatus"
        FROM membership_walk walk
        JOIN group_edges edge
          ON edge."ownerOrgNumber" = walk."memberOrgNumber"
        LEFT JOIN ambiguous_nodes ambiguous
          ON ambiguous."memberOrgNumber" = edge."issuerOrgNumber"
        WHERE NOT edge."issuerOrgNumber" = ANY(walk.path)
          AND walk.depth < 20
      ), walked_members AS (
        SELECT DISTINCT ON (walk."memberOrgNumber")
          walk."memberOrgNumber",
          walk."directParentOrgNumber",
          walk."groupRootOrgNumber",
          walk.depth,
          walk.path,
          walk.status
        FROM membership_walk walk
        ORDER BY
          walk."memberOrgNumber",
          CASE walk.status WHEN 'CONFLICT' THEN 0 WHEN 'UNKNOWN' THEN 1 ELSE 2 END,
          walk.depth ASC,
          walk."groupRootOrgNumber" ASC
      ), standalone_ambiguous_members AS (
        SELECT DISTINCT
          ambiguous."memberOrgNumber",
          NULL::text AS "directParentOrgNumber",
          ambiguous."memberOrgNumber" AS "groupRootOrgNumber",
          0 AS depth,
          ARRAY[ambiguous."memberOrgNumber"]::text[] AS path,
          ambiguous.status
        FROM ambiguous_nodes ambiguous
        WHERE NOT EXISTS (
          SELECT 1
          FROM walked_members walked
          WHERE walked."memberOrgNumber" = ambiguous."memberOrgNumber"
        )
      ), all_members AS (
        SELECT * FROM walked_members
        UNION ALL
        SELECT * FROM standalone_ambiguous_members
      )
      SELECT
        ${buildId}::uuid,
        ${taxYear},
        member."memberOrgNumber",
        member."directParentOrgNumber",
        member."groupRootOrgNumber",
        member.depth,
        member.path,
        member.status,
        ${GROUP_RELATIONSHIP_RULE_VERSION},
        ${ownershipAsOf},
        ${String(sourceImport.sourceSystem)},
        ${"derived_group_membership"},
        ${ownershipSourceId} || ':' || member."memberOrgNumber",
        ${sourceImport.fetchedAt},
        ${normalizedAt},
        ${normalizedAt}
      FROM all_members member
    `);

    const counts = await tx.$queryRaw<Array<{ relationship: string; count: bigint }>>`
      SELECT "relationship"::text AS relationship, count(*)::bigint AS count
      FROM "GroupRelationshipSnapshot"
      WHERE "buildId" = ${buildId}::uuid AND "taxYear" = ${taxYear}
      GROUP BY "relationship"
    `;
    const byRelationship = new Map(counts.map((row) => [row.relationship, Number(row.count)]));
    const relationshipCount = [...byRelationship.values()].reduce((sum, count) => sum + count, 0);
    const financialPositionCount = byRelationship.get("FINANCIAL_POSITION") ?? 0;
    const [{ count: membershipCountRaw }] = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count
      FROM "GroupMembershipSnapshot"
      WHERE "buildId" = ${buildId}::uuid AND "taxYear" = ${taxYear}
    `;
    const membershipCount = Number(membershipCountRaw);

    await tx.groupRelationshipPublication.upsert({
      where: { taxYear },
      create: {
        taxYear,
        buildId,
        ruleVersion: GROUP_RELATIONSHIP_RULE_VERSION,
        sourceImportStatus: sourceImport.status,
        sourceImportId: sourceImport.id,
        relationshipCount,
        membershipCount,
        financialPositionCount,
        classificationSourceSystem: "SSB_KLASS",
        classificationSourceVersion: SSB_INSTITUTIONAL_SECTOR_STANDARD_VERSION,
        classificationSourceReference: SSB_INSTITUTIONAL_SECTOR_STANDARD_REFERENCE,
        sourceSystem: String(sourceImport.sourceSystem),
        sourceEntityType: "derived_group_relationship_snapshot",
        sourceId: ownershipSourceId,
        fetchedAt: sourceImport.fetchedAt,
        normalizedAt,
        publishedAt: normalizedAt,
      },
      update: {
        buildId,
        ruleVersion: GROUP_RELATIONSHIP_RULE_VERSION,
        sourceImportStatus: sourceImport.status,
        sourceImportId: sourceImport.id,
        relationshipCount,
        membershipCount,
        financialPositionCount,
        classificationSourceSystem: "SSB_KLASS",
        classificationSourceVersion: SSB_INSTITUTIONAL_SECTOR_STANDARD_VERSION,
        classificationSourceReference: SSB_INSTITUTIONAL_SECTOR_STANDARD_REFERENCE,
        sourceSystem: String(sourceImport.sourceSystem),
        sourceEntityType: "derived_group_relationship_snapshot",
        sourceId: ownershipSourceId,
        fetchedAt: sourceImport.fetchedAt,
        normalizedAt,
        publishedAt: normalizedAt,
      },
    });
    await tx.$executeRaw`
      DELETE FROM "GroupRelationshipSnapshot"
      WHERE "taxYear" = ${taxYear} AND "buildId" <> ${buildId}::uuid
    `;
    await tx.$executeRaw`
      DELETE FROM "GroupMembershipSnapshot"
      WHERE "taxYear" = ${taxYear} AND "buildId" <> ${buildId}::uuid
    `;

  return {
      taxYear,
      buildId,
      relationshipCount,
      membershipCount,
      groupSubsidiaryCount: byRelationship.get("GROUP_SUBSIDIARY") ?? 0,
      groupAssociateCount: byRelationship.get("GROUP_ASSOCIATE") ?? 0,
      financialPositionCount,
      minorityPositionCount: byRelationship.get("MINORITY_POSITION") ?? 0,
      unknownCount: byRelationship.get("UNKNOWN") ?? 0,
      conflictCount: byRelationship.get("CONFLICT") ?? 0,
  };
}
