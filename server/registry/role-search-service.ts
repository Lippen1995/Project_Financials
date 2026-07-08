import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export type PersonSearchResult = {
  identityKey: string;
  fullName: string;
  birthDate: string | null;
  isDeceased: boolean;
  roleCount: number;
  companyCount: number;
};

export type PersonRole = {
  companyOrgNumber: string;
  companyName: string | null;
  roleType: string;
  roleTypeLabel: string | null;
  isBoardRole: boolean;
  deregistered: boolean;
  groupLastChanged: string | null;
};

export type CompanyRole = {
  holderType: "PERSON" | "COMPANY";
  personIdentityKey: string | null;
  holderName: string;
  holderOrgNumber: string | null;
  birthDate: string | null;
  roleType: string;
  roleTypeLabel: string | null;
  isBoardRole: boolean;
  deregistered: boolean;
};

/** Search people by name, ranked by how many active roles they hold. */
export async function searchPersons(
  query: string,
  options: { limit?: number; includeDeregistered?: boolean } = {},
): Promise<PersonSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const deregFilter = options.includeDeregistered
    ? Prisma.empty
    : Prisma.sql`AND a."deregistered" = false`;

  return prisma.$queryRaw<PersonSearchResult[]>(Prisma.sql`
    SELECT
      p."identityKey",
      p."fullName",
      to_char(p."birthDate", 'YYYY-MM-DD') AS "birthDate",
      p."isDeceased",
      count(a.*)::int AS "roleCount",
      count(DISTINCT a."companyOrgNumber")::int AS "companyCount"
    FROM "RegistryPerson" p
    JOIN "RegistryRoleAssignment" a ON a."personIdentityKey" = p."identityKey"
    WHERE p."fullName" ILIKE ${`%${trimmed}%`} ${deregFilter}
    GROUP BY p."identityKey", p."fullName", p."birthDate", p."isDeceased"
    ORDER BY "roleCount" DESC, p."fullName" ASC
    LIMIT ${limit}
  `);
}

/**
 * Every company a person holds a role in (the reverse lookup / interlocking-directorate
 * view). Company names are resolved from the local Company table where available.
 */
export async function getPersonRoles(
  identityKey: string,
  options: { includeDeregistered?: boolean } = {},
): Promise<PersonRole[]> {
  const deregFilter = options.includeDeregistered
    ? Prisma.empty
    : Prisma.sql`AND a."deregistered" = false`;

  return prisma.$queryRaw<PersonRole[]>(Prisma.sql`
    SELECT
      a."companyOrgNumber",
      c."name" AS "companyName",
      a."roleType",
      a."roleTypeLabel",
      a."isBoardRole",
      a."deregistered",
      to_char(a."groupLastChanged", 'YYYY-MM-DD') AS "groupLastChanged"
    FROM "RegistryRoleAssignment" a
    LEFT JOIN "Company" c ON c."orgNumber" = a."companyOrgNumber"
    WHERE a."personIdentityKey" = ${identityKey} ${deregFilter}
    ORDER BY a."isBoardRole" DESC, a."companyOrgNumber" ASC
  `);
}

/** All role-holders (people and companies) registered in a company. */
export async function getCompanyRoleAssignments(
  orgNumber: string,
  options: { includeDeregistered?: boolean } = {},
): Promise<CompanyRole[]> {
  const deregFilter = options.includeDeregistered
    ? Prisma.empty
    : Prisma.sql`AND a."deregistered" = false`;

  return prisma.$queryRaw<CompanyRole[]>(Prisma.sql`
    SELECT
      a."holderType"::text AS "holderType",
      a."personIdentityKey",
      COALESCE(a."personName", a."holderName", 'Ukjent') AS "holderName",
      a."holderOrgNumber",
      to_char(a."personBirthDate", 'YYYY-MM-DD') AS "birthDate",
      a."roleType",
      a."roleTypeLabel",
      a."isBoardRole",
      a."deregistered"
    FROM "RegistryRoleAssignment" a
    WHERE a."companyOrgNumber" = ${orgNumber} ${deregFilter}
    ORDER BY a."isBoardRole" DESC, a."orderIndex" ASC NULLS LAST
  `);
}
