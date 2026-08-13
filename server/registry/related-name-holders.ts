import { prisma } from "@/lib/prisma";

/**
 * Other entities that have carried one of this entity's names. Brreg frees a company name the
 * moment it is changed or the company is deleted, so a name turning up under a different
 * organisation number is how a business continuing in a new legal entity becomes visible —
 * the case the register itself never states outright.
 *
 * Everything here is registered fact: who held which name when, who sits on both boards, and
 * where they are registered. Whether that adds up to a continuation is the reader's call.
 */
export type RelatedNameHolder = {
  orgNumber: string;
  name: string;
  status: "ACTIVE" | "DISSOLVED" | "BANKRUPT";
  registeredAt: Date | null;
  foundedAt: Date | null;
  municipality: string | null;
  /** The name both entities have carried, as the other entity registered it. */
  sharedName: string;
  sharedNameIsTheirCurrent: boolean;
  sharedNameIsOurCurrent: boolean;
  theirPeriod: { from: Date | null; to: Date | null };
  ourPeriod: { from: Date | null; to: Date | null };
  sameMunicipality: boolean;
  /** People holding a registered role in both entities. */
  sharedRoleHolders: string[];
};

/** Cap before ranking, so a generic name cannot turn one page view into a huge scan. */
const CANDIDATE_LIMIT = 50;

type CandidateRow = {
  orgNumber: string;
  name: string;
  status: "ACTIVE" | "DISSOLVED" | "BANKRUPT";
  registeredAt: Date | null;
  foundedAt: Date | null;
  municipality: string | null;
  municipalityNumber: string | null;
  ourMunicipalityNumber: string | null;
  sharedName: string;
  theirCurrent: boolean;
  theirFrom: Date | null;
  theirTo: Date | null;
  ourCurrent: boolean;
  ourFrom: Date | null;
  ourTo: Date | null;
};

export async function getRelatedNameHolders(
  orgNumber: string,
  limit = 8,
): Promise<RelatedNameHolder[]> {
  const candidates = await prisma.$queryRaw<CandidateRow[]>`
    WITH ours AS (
      SELECT n."normalizedName", n."isCurrent", n."fromDate", n."toDate"
      FROM "RegistryEntityName" n
      WHERE n."orgNumber" = ${orgNumber}
    ),
    us AS (
      SELECT e."businessAddressMunicipalityNumber" AS municipality_number
      FROM "RegistryEntity" e
      WHERE e."orgNumber" = ${orgNumber}
    )
    SELECT
      theirs."orgNumber" AS "orgNumber",
      e."name" AS "name",
      e."status"::text AS "status",
      e."registeredAt" AS "registeredAt",
      e."foundedAt" AS "foundedAt",
      e."businessAddressMunicipality" AS "municipality",
      e."businessAddressMunicipalityNumber" AS "municipalityNumber",
      us.municipality_number AS "ourMunicipalityNumber",
      theirs."name" AS "sharedName",
      theirs."isCurrent" AS "theirCurrent",
      theirs."fromDate" AS "theirFrom",
      theirs."toDate" AS "theirTo",
      ours."isCurrent" AS "ourCurrent",
      ours."fromDate" AS "ourFrom",
      ours."toDate" AS "ourTo"
    FROM ours
    JOIN "RegistryEntityName" theirs
      ON theirs."normalizedName" = ours."normalizedName"
     AND theirs."orgNumber" <> ${orgNumber}
    JOIN "RegistryEntity" e ON e."orgNumber" = theirs."orgNumber"
    CROSS JOIN us
    ORDER BY (e."status" <> 'ACTIVE') DESC, e."registeredAt" DESC NULLS LAST
    LIMIT ${CANDIDATE_LIMIT}
  `;

  if (candidates.length === 0) {
    return [];
  }

  const otherOrgNumbers = Array.from(new Set(candidates.map((candidate) => candidate.orgNumber)));
  const overlaps = await prisma.$queryRaw<Array<{ otherOrg: string; people: string[] }>>`
    SELECT b."companyOrgNumber" AS "otherOrg", array_agg(DISTINCT a."personName") AS "people"
    FROM "RegistryRoleAssignment" a
    JOIN "RegistryRoleAssignment" b ON a."personIdentityKey" = b."personIdentityKey"
    WHERE a."companyOrgNumber" = ${orgNumber}
      AND b."companyOrgNumber" = ANY(${otherOrgNumbers}::text[])
      AND a."personIdentityKey" IS NOT NULL
      AND a."personName" IS NOT NULL
    GROUP BY b."companyOrgNumber"
  `;
  const peopleByOrg = new Map(overlaps.map((overlap) => [overlap.otherOrg, overlap.people]));

  // One entity can share several names with another; keep the strongest single link per org.
  const bestByOrg = new Map<string, RelatedNameHolder>();
  for (const candidate of candidates) {
    const holder: RelatedNameHolder = {
      orgNumber: candidate.orgNumber,
      name: candidate.name,
      status: candidate.status,
      registeredAt: candidate.registeredAt,
      foundedAt: candidate.foundedAt,
      municipality: candidate.municipality,
      sharedName: candidate.sharedName,
      sharedNameIsTheirCurrent: candidate.theirCurrent,
      sharedNameIsOurCurrent: candidate.ourCurrent,
      theirPeriod: { from: candidate.theirFrom, to: candidate.theirTo },
      ourPeriod: { from: candidate.ourFrom, to: candidate.ourTo },
      sameMunicipality:
        Boolean(candidate.municipalityNumber) &&
        candidate.municipalityNumber === candidate.ourMunicipalityNumber,
      sharedRoleHolders: peopleByOrg.get(candidate.orgNumber) ?? [],
    };

    const existing = bestByOrg.get(holder.orgNumber);
    if (!existing || scoreHolder(holder) > scoreHolder(existing)) {
      bestByOrg.set(holder.orgNumber, holder);
    }
  }

  return Array.from(bestByOrg.values())
    .sort((left, right) => scoreHolder(right) - scoreHolder(left))
    .slice(0, limit);
}

/** Shared people carry the most weight — a shared name alone is often coincidence. */
function scoreHolder(holder: RelatedNameHolder) {
  let score = 0;
  if (holder.sharedRoleHolders.length > 0) score += 100 + holder.sharedRoleHolders.length;
  if (holder.status === "BANKRUPT") score += 40;
  else if (holder.status === "DISSOLVED") score += 20;
  if (holder.sameMunicipality) score += 10;
  if (holder.registeredAt) score += Math.min(5, holder.registeredAt.getFullYear() - 1990) / 5;
  return score;
}
