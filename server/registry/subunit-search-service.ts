import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type SubunitSearchResult = {
  orgNumber: string;
  name: string;
  parentOrgNumber: string | null;
  organisationForm: string | null;
  naceCode: string | null;
  naceDescription: string | null;
  postalCode: string | null;
  postalPlace: string | null;
  status: string;
  /** Operating company (hovedenhet) name, when it exists in the local Company table. */
  operatorName: string | null;
};

const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Search the local underenhet mirror (RegistrySubunit) by name — used for store/outlet
 * lookup so user searches hit our database instead of the live Brreg API. Optionally
 * constrained to a NACE prefix (e.g. "47.11" for grocery outlets). Joins the hovedenhet
 * to the local Company table to surface the operating company's name where known.
 */
export async function searchRegistrySubunits(
  query: string,
  options: { limit?: number; nacePrefix?: string; activeOnly?: boolean } = {},
): Promise<SubunitSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];

  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const like = `%${trimmed}%`;
  const naceFilter = options.nacePrefix
    ? Prisma.sql`AND s."naceCode" LIKE ${`${options.nacePrefix}%`}`
    : Prisma.empty;
  const statusFilter = options.activeOnly
    ? Prisma.sql`AND s."status" = 'ACTIVE'`
    : Prisma.empty;

  return prisma.$queryRaw<SubunitSearchResult[]>(Prisma.sql`
    SELECT
      s."orgNumber",
      s."name",
      s."parentOrgNumber",
      s."organisationForm",
      s."naceCode",
      s."naceDescription",
      s."postalCode",
      s."postalPlace",
      s."status"::text AS "status",
      c."name" AS "operatorName"
    FROM "RegistrySubunit" s
    LEFT JOIN "Company" c ON c."orgNumber" = s."parentOrgNumber"
    WHERE s."name" ILIKE ${like}
    ${naceFilter}
    ${statusFilter}
    ORDER BY (s."status" = 'ACTIVE') DESC, s."name" ASC
    LIMIT ${limit}
  `);
}

/**
 * All outlets operated by a given hovedenhet (operating company), i.e. every store that
 * rolls up into that company's accounts. Ordered active-first, then by name.
 */
export async function getSubunitsForOperator(operatorOrgNumber: string): Promise<SubunitSearchResult[]> {
  return prisma.$queryRaw<SubunitSearchResult[]>(Prisma.sql`
    SELECT
      s."orgNumber",
      s."name",
      s."parentOrgNumber",
      s."organisationForm",
      s."naceCode",
      s."naceDescription",
      s."postalCode",
      s."postalPlace",
      s."status"::text AS "status",
      c."name" AS "operatorName"
    FROM "RegistrySubunit" s
    LEFT JOIN "Company" c ON c."orgNumber" = s."parentOrgNumber"
    WHERE s."parentOrgNumber" = ${operatorOrgNumber}
    ORDER BY (s."status" = 'ACTIVE') DESC, s."name" ASC
  `);
}
