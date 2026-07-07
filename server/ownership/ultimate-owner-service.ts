import { prisma } from "@/lib/prisma";
import { CONTROL_THRESHOLD_PERCENT } from "@/server/ownership/ownership-thresholds";

/**
 * The person or company that ultimately stands behind a corporate shareholder,
 * found by walking the controlling-ownership chain (>50 %) up to its terminal.
 *
 * - A `COMPANY` terminal is a konsernspiss: no single owner controls it (e.g. a
 *   listed company like Orkla), so the chain stops there.
 * - A `PERSON` terminal is a natural person who controls the terminal company.
 *
 * `orgNumber` is set for company terminals (persons have no org number).
 */
export type UltimateOwner = {
  name: string;
  orgNumber: string | null;
  type: "PERSON" | "COMPANY";
  ownershipPercent: number | null;
};

type ChainRow = { start: string; terminal: string };
type NameRow = { org: string; name: string };
type PersonRow = { issuer: string; name: string; pct: number | null };

/**
 * Resolve the ultimate owner behind each corporate shareholder.
 *
 * The walk uses the materialised `OwnershipEdge` control graph (SUBSIDIARY edges,
 * >50 %). Each company has at most one controlling corporate parent, so the upward
 * chain is a simple path; a cycle guard on the accumulated path protects against
 * broken data. At the terminal company we check the register directly for a
 * controlling natural person, since persons are not present in `OwnershipEdge`.
 *
 * Returns a map keyed by the *starting* shareholder org number. Entries where the
 * shareholder is its own ultimate owner (a konsernspiss with no controlling person)
 * are omitted — there is nothing new to show for those.
 *
 * Batched into three queries regardless of input size. Never throws for missing
 * data: an empty map is returned when no edges/holdings exist for the year.
 */
export async function resolveUltimateOwners(
  shareholderOrgNumbers: string[],
  taxYear: number,
): Promise<Map<string, UltimateOwner>> {
  const result = new Map<string, UltimateOwner>();
  const orgs = Array.from(new Set(shareholderOrgNumbers.filter(Boolean)));
  if (orgs.length === 0) return result;

  // 1. Walk up the controlling chain to the terminal company for each shareholder.
  const chain = await prisma.$queryRawUnsafe<ChainRow[]>(
    `WITH RECURSIVE chain AS (
       SELECT o AS start, o AS current, 0 AS depth, ARRAY[o] AS path
       FROM unnest($1::text[]) AS o
       UNION ALL
       SELECT c.start, e."ownerOrgNumber", c.depth + 1, c.path || e."ownerOrgNumber"
       FROM chain c
       JOIN "OwnershipEdge" e
         ON e."taxYear" = $2
        AND e."issuerOrgNumber" = c.current
        AND e."relationship" = 'SUBSIDIARY'
       WHERE c.depth < 20 AND NOT e."ownerOrgNumber" = ANY(c.path)
     )
     SELECT DISTINCT ON (start) start, current AS terminal
     FROM chain
     ORDER BY start, depth DESC`,
    orgs,
    taxYear,
  );

  const terminalByStart = new Map(chain.map((row) => [row.start, row.terminal]));
  const terminals = Array.from(new Set(chain.map((row) => row.terminal)));
  if (terminals.length === 0) return result;

  // 2. Human-readable names for the terminal companies.
  const nameRows = await prisma.$queryRawUnsafe<NameRow[]>(
    `SELECT DISTINCT ON ("issuerOrgNumber") "issuerOrgNumber" AS org, "issuerName" AS name
     FROM "ShareholderRegisterHolding"
     WHERE "taxYear" = $1 AND "issuerOrgNumber" = ANY($2)`,
    taxYear,
    terminals,
  );
  const nameByOrg = new Map(nameRows.map((row) => [row.org, row.name]));

  // 3. Controlling natural person (>50 %) at each terminal, if any. Persons are
  //    aggregated across share classes by identity (name + birth year + place).
  const personRows = await prisma.$queryRawUnsafe<PersonRow[]>(
    `SELECT issuer, name, pct FROM (
       SELECT
         h."issuerOrgNumber" AS issuer,
         h."shareholderName" AS name,
         (sum(h."numberOfShares")::numeric * 100
           / NULLIF(max(h."totalCompanyShares"), 0)::numeric) AS pct,
         row_number() OVER (
           PARTITION BY h."issuerOrgNumber" ORDER BY sum(h."numberOfShares") DESC
         ) AS rn
       FROM "ShareholderRegisterHolding" h
       WHERE h."taxYear" = $1
         AND h."issuerOrgNumber" = ANY($2)
         AND h."shareholderOrgNumber" IS NULL
       GROUP BY h."issuerOrgNumber", h."shareholderName",
                h."shareholderBirthYear", h."postalPlace"
     ) g
     WHERE g.rn = 1`,
    taxYear,
    terminals,
  );
  const controllingPersonByIssuer = new Map<string, PersonRow>();
  for (const row of personRows) {
    const pct = row.pct === null ? null : Number(row.pct);
    if (pct !== null && pct > CONTROL_THRESHOLD_PERCENT) {
      controllingPersonByIssuer.set(row.issuer, { ...row, pct });
    }
  }

  for (const start of orgs) {
    const terminal = terminalByStart.get(start);
    if (!terminal) continue;

    const person = controllingPersonByIssuer.get(terminal);
    if (person) {
      result.set(start, {
        name: person.name,
        orgNumber: null,
        type: "PERSON",
        ownershipPercent: person.pct,
      });
      continue;
    }

    // Company terminal. Skip when the shareholder is its own konsernspiss — there
    // is no owner "behind" it to surface.
    if (terminal === start) continue;
    result.set(start, {
      name: nameByOrg.get(terminal) ?? terminal,
      orgNumber: terminal,
      type: "COMPANY",
      ownershipPercent: null,
    });
  }

  return result;
}
