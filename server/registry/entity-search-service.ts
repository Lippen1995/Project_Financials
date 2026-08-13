import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildRegisteredIndustryCode } from "@/lib/industry-code";
import { slugify } from "@/lib/utils";
import type { NormalizedCompany, SearchFilters } from "@/lib/types";

type EntityRow = {
  orgNumber: string;
  name: string;
  organisationForm: string | null;
  naceCode: string | null;
  naceDescription: string | null;
  status: "ACTIVE" | "DISSOLVED" | "BANKRUPT";
  employeeCount: number | null;
  registeredAt: Date | null;
  website: string | null;
  addressStreet: string | null;
  postalCode: string | null;
  postalPlace: string | null;
  municipality: string | null;
  municipalityNumber: string | null;
  countryCode: string | null;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
  matchedPreviousName?: string | null;
};

const DEFAULT_SIZE = 25;
const MAX_SIZE = 100;

function toNormalizedCompany(row: EntityRow, loweredQuery: string | null): NormalizedCompany {
  const hasAddress = Boolean(row.addressStreet || row.postalCode || row.postalPlace);
  // Only worth showing when the current name does not already explain the hit.
  const matchedPreviousName =
    row.matchedPreviousName && (!loweredQuery || !row.name.toLowerCase().includes(loweredQuery))
      ? row.matchedPreviousName
      : null;
  return {
    sourceSystem: row.sourceSystem,
    sourceEntityType: row.sourceEntityType,
    sourceId: row.sourceId,
    fetchedAt: row.fetchedAt,
    normalizedAt: row.normalizedAt,
    rawPayload: null,
    orgNumber: row.orgNumber,
    name: row.name,
    slug: `${row.orgNumber}-${slugify(row.name)}`,
    legalForm: row.organisationForm,
    status: row.status,
    registeredAt: row.registeredAt,
    foundedAt: null,
    website: row.website,
    employeeCount: row.employeeCount,
    description: null,
    municipality: row.municipality,
    matchedPreviousName,
    announcementsUrl: `https://w2.brreg.no/kunngjoring/hent_nr.jsp?orgnr=${row.orgNumber}`,
    addresses: hasAddress
      ? [
          {
            sourceSystem: row.sourceSystem,
            sourceEntityType: "address",
            sourceId: `${row.orgNumber}-business`,
            fetchedAt: row.fetchedAt,
            normalizedAt: row.normalizedAt,
            rawPayload: null,
            line1: row.addressStreet ?? "",
            line2: null,
            postalCode: row.postalCode ?? "",
            city: row.postalPlace ?? "",
            region: row.municipality,
            country: row.countryCode ?? "NO",
          },
        ]
      : [],
    industryCode: buildRegisteredIndustryCode({
      orgNumber: row.orgNumber,
      industryPayload: row.naceCode ? { kode: row.naceCode, beskrivelse: row.naceDescription } : null,
      fetchedAt: row.fetchedAt,
      normalizedAt: row.normalizedAt,
    }),
  };
}

/**
 * Company search served from the local RegistryEntity mirror instead of the live Brreg
 * search API. Supports the same filters the Brreg provider did (name/org number, industry
 * code, municipality, city, legal form, status). A 9-digit query is treated as an exact
 * org-number lookup.
 */
export async function searchRegistryCompanies(filters: SearchFilters): Promise<NormalizedCompany[]> {
  const size = Math.min(Math.max(filters.size ?? DEFAULT_SIZE, 1), MAX_SIZE);
  const query = filters.query?.trim();

  const conditions: Prisma.Sql[] = [];
  // A name search runs against the flattened name index, which holds current and former names
  // alike — one trigram-backed scan instead of an OR across two tables, and former names come
  // along for free. Trigrams need three characters, so shorter queries stay on the old path
  // rather than paying for a second sequential scan that no index can serve.
  const useNameIndex = Boolean(query) && !/^\d{9}$/.test(query ?? "") && (query?.length ?? 0) >= 3;

  if (query) {
    if (/^\d{9}$/.test(query)) {
      conditions.push(Prisma.sql`e."orgNumber" = ${query}`);
    } else if (!useNameIndex) {
      conditions.push(Prisma.sql`e."name" ILIKE ${`%${query}%`}`);
    }
  }
  if (filters.industryCode) {
    conditions.push(Prisma.sql`e."naceCode" LIKE ${`${filters.industryCode.trim()}%`}`);
  }
  if (filters.municipalityNumber) {
    conditions.push(Prisma.sql`e."municipalityNumber" = ${filters.municipalityNumber.trim()}`);
  }
  if (filters.municipality) {
    conditions.push(Prisma.sql`e."municipality" ILIKE ${filters.municipality.trim()}`);
  }
  if (filters.city) {
    conditions.push(Prisma.sql`e."postalPlace" ILIKE ${filters.city.trim()}`);
  }
  if (filters.legalForm) {
    conditions.push(Prisma.sql`e."organisationForm" = ${filters.legalForm.trim().toUpperCase()}`);
  }
  if (filters.status) {
    conditions.push(Prisma.sql`e."status" = ${filters.status}::"CompanyStatus"`);
  }

  if (conditions.length === 0 && !useNameIndex) return [];

  // Relevance: exact then prefix name matches first, then active, then alphabetical — so
  // typing "jotun" surfaces "JOTUN A/S" above companies that merely contain the term.
  const nameQuery = query && !/^\d{9}$/.test(query) ? query : null;
  const orderBy = nameQuery
    ? Prisma.sql`ORDER BY
        (lower(e."name") = lower(${nameQuery})) DESC,
        (e."name" ILIKE ${`${nameQuery}%`}) DESC,
        (e."status" = 'ACTIVE') DESC,
        char_length(e."name") ASC,
        e."name" ASC`
    : Prisma.sql`ORDER BY (e."status" = 'ACTIVE') DESC, e."name" ASC`;

  // The matched former name rides along out of the same scan, so a hit whose current name
  // looks unrelated to the query can explain itself without a second lookup.
  const nameMatchCte = useNameIndex
    ? Prisma.sql`WITH matched AS (
        SELECT n."orgNumber",
               max(CASE WHEN n."isCurrent" = false THEN n."name" END) AS "matchedPreviousName"
        FROM "RegistryEntityName" n
        WHERE n."name" ILIKE ${`%${query}%`}
        GROUP BY n."orgNumber"
      )`
    : Prisma.empty;
  const nameMatchJoin = useNameIndex
    ? Prisma.sql`JOIN matched m ON m."orgNumber" = e."orgNumber"`
    : Prisma.empty;
  const matchedPreviousName = useNameIndex
    ? Prisma.sql`m."matchedPreviousName"`
    : Prisma.sql`NULL`;

  const where = conditions.length > 0 ? Prisma.join(conditions, " AND ") : Prisma.sql`TRUE`;
  const rows = await prisma.$queryRaw<EntityRow[]>(Prisma.sql`
    ${nameMatchCte}
    SELECT
      e."orgNumber", e."name", e."organisationForm", e."naceCode", e."naceDescription",
      e."status"::text AS "status", e."employeeCount", e."registeredAt", e."website",
      e."addressStreet", e."postalCode", e."postalPlace", e."municipality",
      e."municipalityNumber", e."countryCode", e."sourceSystem",
      e."sourceEntityType", e."sourceId", e."fetchedAt", e."normalizedAt",
      ${matchedPreviousName} AS "matchedPreviousName"
    FROM "RegistryEntity" e
    ${nameMatchJoin}
    WHERE ${where}
    ${orderBy}
    LIMIT ${size}
  `);

  return rows.map((row) =>
    toNormalizedCompany(row, nameQuery ? nameQuery.toLowerCase() : null),
  );
}
