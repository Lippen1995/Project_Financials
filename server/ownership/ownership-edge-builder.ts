import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  ASSOCIATED_THRESHOLD_PERCENT,
  CONTROL_THRESHOLD_PERCENT,
} from "@/server/ownership/ownership-thresholds";

export type OwnershipEdgeBuildResult = {
  taxYear: number;
  edgeCount: number;
  subsidiaryCount: number;
  associatedCount: number;
  minorityCount: number;
};

/**
 * Build the materialised company-to-company ownership graph for a single tax year.
 *
 * Aggregates ShareholderRegisterHolding rows (which are per share class) into one
 * edge per (issuer, corporate owner) pair: shares are summed across classes and the
 * ownership percentage is computed against the issuer's total share count. Person
 * shareholders are skipped (they terminate the chain and are read directly from the
 * register), as are self-edges (treasury holdings).
 *
 * Idempotent: existing edges for the year are deleted first, so re-running after a
 * register re-import yields a clean rebuild.
 */
export async function buildOwnershipEdgesForYear(taxYear: number): Promise<OwnershipEdgeBuildResult> {
  // Not wrapped in an interactive transaction: the INSERT...SELECT aggregates millions
  // of register rows and far exceeds Prisma's 5s interactive-transaction timeout. The
  // DELETE + INSERT run as separate implicit transactions; this is a re-runnable batch
  // build, so the brief window between them is acceptable.
  await prisma.$executeRaw`DELETE FROM "OwnershipEdge" WHERE "taxYear" = ${taxYear}`;

  await prisma.$executeRaw`
      INSERT INTO "OwnershipEdge" (
        "taxYear", "issuerOrgNumber", "ownerOrgNumber", "issuerName", "ownerName",
        "aggregatedShares", "totalIssuerShares", "ownershipPercent", "relationship", "builtAt"
      )
      SELECT
        agg."taxYear",
        agg."issuerOrgNumber",
        agg."ownerOrgNumber",
        agg."issuerName",
        agg."ownerName",
        agg."aggregatedShares",
        agg."totalIssuerShares",
        agg."ownershipPercent",
        (CASE
          WHEN agg."ownershipPercent" IS NULL THEN 'MINORITY'
          WHEN agg."ownershipPercent" > ${CONTROL_THRESHOLD_PERCENT} THEN 'SUBSIDIARY'
          WHEN agg."ownershipPercent" >= ${ASSOCIATED_THRESHOLD_PERCENT} THEN 'ASSOCIATED'
          ELSE 'MINORITY'
        END)::"OwnershipRelationship",
        now()
      FROM (
        SELECT
          h."taxYear" AS "taxYear",
          h."issuerOrgNumber" AS "issuerOrgNumber",
          h."shareholderOrgNumber" AS "ownerOrgNumber",
          max(h."issuerName") AS "issuerName",
          max(h."shareholderName") AS "ownerName",
          sum(h."numberOfShares")::bigint AS "aggregatedShares",
          max(h."totalCompanyShares") AS "totalIssuerShares",
          CASE
            WHEN max(h."totalCompanyShares") IS NULL OR max(h."totalCompanyShares") = 0 THEN NULL
            -- Ownership cannot exceed 100 %; values above that mean the reported total
            -- share count is wrong. Clamp mild overshoot to 100, null out gross errors
            -- (>150 %) so we never fabricate control from broken data.
            WHEN (sum(h."numberOfShares")::numeric * 100) / max(h."totalCompanyShares")::numeric > 150 THEN NULL
            ELSE round(
              least((sum(h."numberOfShares")::numeric * 100) / max(h."totalCompanyShares")::numeric, 100),
              6
            )
          END AS "ownershipPercent"
        FROM "ShareholderRegisterHolding" h
        WHERE h."taxYear" = ${taxYear}
          AND h."shareholderOrgNumber" IS NOT NULL
          AND h."shareholderOrgNumber" <> h."issuerOrgNumber"
        GROUP BY h."taxYear", h."issuerOrgNumber", h."shareholderOrgNumber"
      ) agg
    `;

  const counts = await prisma.$queryRaw<Array<{ relationship: string; count: bigint }>>`
      SELECT "relationship"::text AS relationship, count(*)::bigint AS count
      FROM "OwnershipEdge"
      WHERE "taxYear" = ${taxYear}
      GROUP BY "relationship"
    `;

  const byRelationship = new Map(counts.map((row) => [row.relationship, Number(row.count)]));
  const subsidiaryCount = byRelationship.get("SUBSIDIARY") ?? 0;
  const associatedCount = byRelationship.get("ASSOCIATED") ?? 0;
  const minorityCount = byRelationship.get("MINORITY") ?? 0;

  return {
    taxYear,
    edgeCount: subsidiaryCount + associatedCount + minorityCount,
    subsidiaryCount,
    associatedCount,
    minorityCount,
  };
}

/** Tax years that have register holdings available to build edges from. */
export async function getRegisterHoldingTaxYears(): Promise<number[]> {
  const rows = await prisma.$queryRaw<Array<{ taxYear: number }>>(Prisma.sql`
    SELECT DISTINCT "taxYear" FROM "ShareholderRegisterHolding" ORDER BY "taxYear" DESC
  `);
  return rows.map((row) => row.taxYear);
}

/** Build edges for every tax year present in the register. Returns per-year results. */
export async function buildAllOwnershipEdges(): Promise<OwnershipEdgeBuildResult[]> {
  const years = await getRegisterHoldingTaxYears();
  const results: OwnershipEdgeBuildResult[] = [];
  for (const year of years) {
    results.push(await buildOwnershipEdgesForYear(year));
  }
  return results;
}
