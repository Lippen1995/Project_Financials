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

export type RoleTypeSearchResult = {
  roleType: string;
  roleTypeLabel: string | null;
  assignmentCount: number;
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
  /**
   * Effective (weighted look-through) ownership of this person role-holder in the company:
   * direct shares plus each holding company's stake weighted by the person's ownership
   * fraction of that company, traversed through multiple levels. `effectiveShares` is the
   * nominal weighted count (rounded to whole shares); `effectivePercent` the weighted share
   * of the company. `directShares` is the directly-registered portion; `heldVia` names the
   * holding companies the indirect portion flows through.
   */
  effectiveShares: number | null;
  effectivePercent: number | null;
  directShares: number | null;
  heldVia: string | null;
};

/**
 * Search people by name, ranked by how many active roles they hold. Optionally restrict
 * to a role type (e.g. DAGL, LEDE, MEDL) so the search answers "who is a daglig leder /
 * styreleder named …".
 */
export async function searchPersons(
  query: string,
  options: {
    limit?: number;
    includeDeregistered?: boolean;
    roleType?: string;
    mode?: "persons" | "roles";
  } = {},
): Promise<PersonSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH && !options.roleType) return [];
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const deregFilter = options.includeDeregistered
    ? Prisma.empty
    : Prisma.sql`AND a."deregistered" = false`;
  const roleFilter = options.roleType
    ? Prisma.sql`AND a."roleType" = ${options.roleType}`
    : Prisma.empty;
  const queryFilter =
    options.mode === "roles"
      ? Prisma.sql`AND (
          a."roleTypeLabel" ILIKE ${`%${trimmed}%`}
          OR a."roleType" ILIKE ${`%${trimmed}%`}
        )`
      : Prisma.sql`AND p."fullName" ILIKE ${`%${trimmed}%`}`;

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
    WHERE true ${queryFilter} ${deregFilter} ${roleFilter}
    GROUP BY p."identityKey", p."fullName", p."birthDate", p."isDeceased"
    ORDER BY "roleCount" DESC, p."fullName" ASC
    LIMIT ${limit}
  `);
}

/** Search the role vocabulary actually present in the normalized Brreg role assignments. */
export async function searchRoleTypes(
  query: string,
  options: { limit?: number; includeDeregistered?: boolean } = {},
): Promise<RoleTypeSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const deregFilter = options.includeDeregistered
    ? Prisma.empty
    : Prisma.sql`AND "deregistered" = false`;

  return prisma.$queryRaw<RoleTypeSearchResult[]>(Prisma.sql`
    SELECT
      "roleType",
      max("roleTypeLabel") AS "roleTypeLabel",
      count(*)::int AS "assignmentCount"
    FROM "RegistryRoleAssignment"
    WHERE (
      "roleTypeLabel" ILIKE ${`%${trimmed}%`}
      OR "roleType" ILIKE ${`%${trimmed}%`}
    ) ${deregFilter}
    GROUP BY "roleType"
    ORDER BY "assignmentCount" DESC, "roleType" ASC
    LIMIT ${limit}
  `);
}

/** Role types offered as filters, derived from normalized Brreg role assignments. */
export async function getAvailableRoleTypes(): Promise<Array<{ code: string; label: string }>> {
  return prisma.$queryRaw<Array<{ code: string; label: string }>>(Prisma.sql`
    SELECT
      "roleType" AS code,
      coalesce(max("roleTypeLabel"), "roleType") AS label
    FROM "RegistryRoleAssignment"
    WHERE "deregistered" = false
    GROUP BY "roleType"
    ORDER BY label ASC
  `);
}

/**
 * Every company a person holds a role in (the reverse lookup / interlocking-directorate
 * view). Company names are resolved from the official Brreg registry mirror, with the
 * richer on-demand Company snapshot taking precedence when it is available.
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
      COALESCE(c."name", re."name") AS "companyName",
      a."roleType",
      a."roleTypeLabel",
      a."isBoardRole",
      a."deregistered",
      to_char(a."groupLastChanged", 'YYYY-MM-DD') AS "groupLastChanged"
    FROM "RegistryRoleAssignment" a
    LEFT JOIN "Company" c ON c."orgNumber" = a."companyOrgNumber"
    LEFT JOIN "RegistryEntity" re ON re."orgNumber" = a."companyOrgNumber"
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

type RawCompanyRole = {
  holderType: "PERSON" | "COMPANY";
  personIdentityKey: string | null;
  holderName: string;
  holderOrgNumber: string | null;
  birthDate: string | null;
  roleType: string;
  roleTypeLabel: string | null;
  isBoardRole: boolean;
  deregistered: boolean;
  personName: string | null;
  birthYear: number | null;
};

function personKey(name: string, birthYear: number | null): string | null {
  if (birthYear === null) return null;
  return `${name.toUpperCase().replace(/\s+/g, " ").trim()}|${birthYear}`;
}

type ShareholderRow = {
  issuer: string;
  type: "PERSON" | "COMPANY";
  shOrg: string | null;
  shName: string;
  shYear: number | null;
  fraction: number;
};

/**
 * Effective (weighted look-through) ownership of `companyOrgNumber` for the given person
 * keys. Walks up the shareholder graph level by level: at each hop a company's shareholders
 * contribute their stake weighted by the fraction of the company that has flowed in so far.
 * Person edges terminate and accumulate; corporate edges expand further, tagged with the
 * top-level holding company the flow entered through (for the "via" breakdown). Bounded by
 * depth, per-level breadth, total nodes, and a minimum flow so cycles and huge public
 * cap tables stay tractable.
 */
type OwnershipEntry = { directFraction: number; indirectFraction: number; via: Map<string, string> };

async function computeEffectiveOwnership(
  companyOrgNumber: string,
  year: number,
  totalShares: number,
  personKeys: Set<string>,
): Promise<Map<string, OwnershipEntry>> {
  const MAX_DEPTH = 10;
  const MAX_FRONTIER = 800;
  const MAX_TOTAL_NODES = 4000;
  const MIN_FLOW = 1e-5;
  // Only seed/expand corporate holders whose stake is meaningful — this keeps widely-held
  // public cap tables (tens of thousands of retail holders) tractable while still capturing
  // any board member who holds through a real holding company.
  const SEED_MIN_FRACTION = 0.001; // 0.1 % of the company

  const result = new Map<string, OwnershipEntry>();
  const ensure = (key: string): OwnershipEntry => {
    let entry = result.get(key);
    if (!entry) {
      entry = { directFraction: 0, indirectFraction: 0, via: new Map() };
      result.set(key, entry);
    }
    return entry;
  };

  // Direct holdings: only the role-holders' own registered shares in the company (filtered
  // by name, so we never scan the company's full retail shareholder list).
  const names = [...new Set([...personKeys].map((key) => key.slice(0, key.lastIndexOf("|"))))];
  if (names.length > 0) {
    const directRows = await prisma.$queryRaw<Array<{ nameKey: string; yr: number | null; shares: number }>>(
      Prisma.sql`
        SELECT
          upper(regexp_replace(h."shareholderName", '\\s+', ' ', 'g')) AS "nameKey",
          h."shareholderBirthYear" AS "yr",
          sum(h."numberOfShares")::float8 AS "shares"
        FROM "ShareholderRegisterHolding" h
        WHERE h."issuerOrgNumber" = ${companyOrgNumber} AND h."taxYear" = ${year}
          AND h."shareholderType" = 'PERSON'
          AND upper(regexp_replace(h."shareholderName", '\\s+', ' ', 'g')) IN (${Prisma.join(names)})
        GROUP BY 1, 2
      `,
    );
    for (const row of directRows) {
      const key = `${row.nameKey}|${row.yr}`;
      if (personKeys.has(key)) ensure(key).directFraction += row.shares / totalShares;
    }
  }

  // Only corporate shareholders (to keep walking up) and person shareholders who are
  // role-holders (to accumulate) are fetched — a widely-held intermediate's thousands of
  // retail owners are dropped in SQL. Dust edges below MIN_FLOW are dropped too.
  const personFilter =
    names.length > 0
      ? Prisma.sql`OR t."shName" IN (${Prisma.join(names)})`
      : Prisma.empty;

  async function fetchShareholders(orgs: string[]): Promise<Map<string, ShareholderRow[]>> {
    const rows = await prisma.$queryRaw<ShareholderRow[]>(Prisma.sql`
      SELECT t."issuer", t."type", t."shOrg", t."shName", t."shYear", t."fraction"
      FROM (
        SELECT
          h."issuerOrgNumber" AS "issuer",
          h."shareholderType"::text AS "type",
          h."shareholderOrgNumber" AS "shOrg",
          upper(regexp_replace(h."shareholderName", '\\s+', ' ', 'g')) AS "shName",
          h."shareholderBirthYear" AS "shYear",
          least(sum(h."numberOfShares")::numeric / NULLIF(max(h."totalCompanyShares"), 0), 1)::float8 AS "fraction"
        FROM "ShareholderRegisterHolding" h
        WHERE h."taxYear" = ${year} AND h."issuerOrgNumber" IN (${Prisma.join(orgs)})
        GROUP BY 1, 2, 3, 4, 5
      ) t
      WHERE t."fraction" >= ${MIN_FLOW}
        AND (t."type" = 'COMPANY' ${personFilter})
    `);
    const byIssuer = new Map<string, ShareholderRow[]>();
    for (const row of rows) {
      if (!row.fraction || row.fraction <= 0) continue;
      const list = byIssuer.get(row.issuer);
      if (list) list.push(row);
      else byIssuer.set(row.issuer, [row]);
    }
    return byIssuer;
  }

  // Indirect: seed from the company's corporate shareholders above the floor, then walk up.
  // Each flow is tagged with the top-level holding company it entered through (for "via").
  type FrontierNode = { org: string; source: { org: string; name: string }; flow: number };
  let frontier = new Map<string, FrontierNode>();

  const seedRows = await prisma.$queryRaw<Array<{ holdco: string; name: string; fraction: number }>>(Prisma.sql`
    SELECT
      s."shareholderOrgNumber" AS "holdco",
      max(s."shareholderName") AS "name",
      least(sum(s."numberOfShares")::numeric / NULLIF(max(s."totalCompanyShares"), 0), 1)::float8 AS "fraction"
    FROM "ShareholderRegisterHolding" s
    WHERE s."issuerOrgNumber" = ${companyOrgNumber} AND s."taxYear" = ${year}
      AND s."shareholderType" = 'COMPANY' AND s."shareholderOrgNumber" IS NOT NULL
      AND s."shareholderOrgNumber" <> ${companyOrgNumber}
    GROUP BY s."shareholderOrgNumber"
    HAVING least(sum(s."numberOfShares")::numeric / NULLIF(max(s."totalCompanyShares"), 0), 1) >= ${SEED_MIN_FRACTION}
  `);
  for (const row of seedRows) {
    frontier.set(`${row.holdco}|${row.holdco}`, {
      org: row.holdco,
      source: { org: row.holdco, name: row.name },
      flow: row.fraction,
    });
  }

  const startedAt = Date.now();
  const BUDGET_MS = 3000;
  let depth = 0;
  let nodesProcessed = 0;
  while (
    frontier.size > 0 &&
    depth < MAX_DEPTH &&
    nodesProcessed < MAX_TOTAL_NODES &&
    Date.now() - startedAt < BUDGET_MS
  ) {
    let nodes = [...frontier.values()].filter((n) => n.flow >= MIN_FLOW);
    nodes.sort((a, b) => b.flow - a.flow);
    if (nodes.length > MAX_FRONTIER) nodes = nodes.slice(0, MAX_FRONTIER);
    frontier = new Map();
    if (nodes.length === 0) break;
    nodesProcessed += nodes.length;

    const byIssuer = await fetchShareholders([...new Set(nodes.map((n) => n.org))]);

    for (const node of nodes) {
      for (const row of byIssuer.get(node.org) ?? []) {
        const flow = node.flow * row.fraction;
        if (row.type === "PERSON") {
          const key = personKey(row.shName, row.shYear);
          if (key && personKeys.has(key)) {
            const entry = ensure(key);
            entry.indirectFraction += flow;
            entry.via.set(node.source.org, node.source.name);
          }
        } else if (row.shOrg && row.shOrg !== node.org && flow >= MIN_FLOW) {
          const k = `${row.shOrg}|${node.source.org}`;
          const existing = frontier.get(k);
          if (existing) existing.flow += flow;
          else frontier.set(k, { org: row.shOrg, source: node.source, flow });
        }
      }
    }
    depth += 1;
  }

  return result;
}

/**
 * All role-holders (people and companies) registered in a company, with each person's
 * effective (weighted look-through) ownership of that same company — direct shares plus
 * each controlled/part-owned holding company's stake weighted by the person's ownership
 * fraction, traversed through multiple levels. Matching is on normalized name + birth year
 * (the aksjonærregister has no full birth date).
 */
export async function getCompanyRoleAssignments(
  orgNumber: string,
  options: { includeDeregistered?: boolean } = {},
): Promise<CompanyRole[]> {
  const deregFilter = options.includeDeregistered
    ? Prisma.empty
    : Prisma.sql`AND a."deregistered" = false`;

  const rawRoles = await prisma.$queryRaw<RawCompanyRole[]>(Prisma.sql`
    SELECT
      a."holderType"::text AS "holderType",
      a."personIdentityKey",
      COALESCE(a."personName", a."holderName", 'Ukjent') AS "holderName",
      a."holderOrgNumber",
      to_char(a."personBirthDate", 'YYYY-MM-DD') AS "birthDate",
      a."roleType",
      a."roleTypeLabel",
      a."isBoardRole",
      a."deregistered",
      a."personName",
      extract(year from a."personBirthDate")::int AS "birthYear"
    FROM "RegistryRoleAssignment" a
    WHERE a."companyOrgNumber" = ${orgNumber} ${deregFilter}
    ORDER BY a."isBoardRole" DESC, a."orderIndex" ASC NULLS LAST
  `);

  const [yearRow] = await prisma.$queryRaw<Array<{ year: number | null }>>(
    Prisma.sql`SELECT max("taxYear")::int AS year FROM "ShareholderRegisterHolding"`,
  );
  const year = yearRow?.year ?? null;

  let ownership = new Map<string, OwnershipEntry>();
  let totalShares = 0;

  if (year !== null) {
    const [totalRow] = await prisma.$queryRaw<Array<{ total: string | null }>>(Prisma.sql`
      SELECT max("totalCompanyShares")::text AS total
      FROM "ShareholderRegisterHolding"
      WHERE "issuerOrgNumber" = ${orgNumber} AND "taxYear" = ${year}
    `);
    totalShares = totalRow?.total ? Number(totalRow.total) : 0;

    const personKeys = new Set<string>();
    for (const role of rawRoles) {
      if (role.holderType !== "PERSON") continue;
      const key = personKey(role.personName ?? "", role.birthYear);
      if (key) personKeys.add(key);
    }
    if (personKeys.size > 0 && totalShares > 0) {
      ownership = await computeEffectiveOwnership(orgNumber, year, totalShares, personKeys);
    }
  }

  return rawRoles.map((role) => {
    const key =
      role.holderType === "PERSON" ? personKey(role.personName ?? "", role.birthYear) : null;
    const own = key ? ownership.get(key) : undefined;

    let effectiveShares: number | null = null;
    let effectivePercent: number | null = null;
    let directShares: number | null = null;
    let heldVia: string | null = null;

    if (role.holderType === "PERSON") {
      // Person with no ownership found still reads as an explicit "no shares".
      const effectiveFraction = own ? own.directFraction + own.indirectFraction : 0;
      effectiveShares = Math.round(effectiveFraction * totalShares);
      effectivePercent = effectiveFraction * 100;
      directShares = own ? Math.round(own.directFraction * totalShares) : 0;
      heldVia = own && own.via.size > 0 ? [...own.via.values()].join(", ") : null;
    }

    return {
      holderType: role.holderType,
      personIdentityKey: role.personIdentityKey,
      holderName: role.holderName,
      holderOrgNumber: role.holderOrgNumber,
      birthDate: role.birthDate,
      roleType: role.roleType,
      roleTypeLabel: role.roleTypeLabel,
      isBoardRole: role.isBoardRole,
      deregistered: role.deregistered,
      effectiveShares,
      effectivePercent,
      directShares,
      heldVia,
    };
  });
}
