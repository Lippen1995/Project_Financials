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

/**
 * Search people by name, ranked by how many active roles they hold. Optionally restrict
 * to a role type (e.g. DAGL, LEDE, MEDL) so the search answers "who is a daglig leder /
 * styreleder named …".
 */
export async function searchPersons(
  query: string,
  options: { limit?: number; includeDeregistered?: boolean; roleType?: string } = {},
): Promise<PersonSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const deregFilter = options.includeDeregistered
    ? Prisma.empty
    : Prisma.sql`AND a."deregistered" = false`;
  const roleFilter = options.roleType
    ? Prisma.sql`AND a."roleType" = ${options.roleType}`
    : Prisma.empty;

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
    WHERE p."fullName" ILIKE ${`%${trimmed}%`} ${deregFilter} ${roleFilter}
    GROUP BY p."identityKey", p."fullName", p."birthDate", p."isDeceased"
    ORDER BY "roleCount" DESC, p."fullName" ASC
    LIMIT ${limit}
  `);
}

/** Person role types offered as search filters, in display order. */
export const PERSON_ROLE_TYPES: Array<{ code: string; label: string }> = [
  { code: "LEDE", label: "Styrets leder" },
  { code: "NEST", label: "Nestleder" },
  { code: "MEDL", label: "Styremedlem" },
  { code: "VARA", label: "Varamedlem" },
  { code: "DAGL", label: "Daglig leder" },
  { code: "INNH", label: "Innehaver" },
  { code: "KONT", label: "Kontaktperson" },
  { code: "REVI", label: "Revisor" },
];

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

export type PersonShareholding = {
  issuerOrgNumber: string;
  issuerName: string;
  shares: string;
  ownershipPercent: number | null;
  taxYear: number;
};

/**
 * Shares a person owns, from the Skatteetaten aksjonærregister. The register keys people
 * by name + birth *year* only (no full date), so this joins on the normalized name and the
 * birth year decoded from the person's identity key — a fuzzy match that can miss people
 * whose registered name omits a middle name, and (rarely) merge same-name/same-year
 * namesakes. Aggregated per issuer across share classes for the latest snapshot year.
 */
export async function getPersonShareholdings(identityKey: string): Promise<PersonShareholding[]> {
  const separator = identityKey.lastIndexOf("|");
  const normalizedName = separator >= 0 ? identityKey.slice(0, separator) : identityKey;
  const datePart = separator >= 0 ? identityKey.slice(separator + 1) : "";
  const birthYear = /^\d{4}/.test(datePart) ? Number(datePart.slice(0, 4)) : null;
  if (!normalizedName || birthYear === null) return [];

  return prisma.$queryRaw<PersonShareholding[]>(Prisma.sql`
    WITH latest AS (SELECT max("taxYear") AS y FROM "ShareholderRegisterHolding")
    SELECT
      h."issuerOrgNumber" AS "issuerOrgNumber",
      max(h."issuerName") AS "issuerName",
      sum(h."numberOfShares")::bigint::text AS "shares",
      CASE
        WHEN max(h."totalCompanyShares") IS NULL OR max(h."totalCompanyShares") = 0 THEN NULL
        ELSE round(
          least(sum(h."numberOfShares")::numeric * 100 / max(h."totalCompanyShares")::numeric, 100),
          2
        )::float8
      END AS "ownershipPercent",
      (SELECT y FROM latest)::int AS "taxYear"
    FROM "ShareholderRegisterHolding" h, latest
    WHERE h."taxYear" = latest.y
      AND h."shareholderType" = 'PERSON'
      AND h."shareholderBirthYear" = ${birthYear}
      AND upper(regexp_replace(h."shareholderName", '\\s+', ' ', 'g')) = ${normalizedName}
    GROUP BY h."issuerOrgNumber"
    ORDER BY "ownershipPercent" DESC NULLS LAST, sum(h."numberOfShares") DESC
    LIMIT 200
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
