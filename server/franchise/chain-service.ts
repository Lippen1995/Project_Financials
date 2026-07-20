import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Read side of the franchise layer. Chains are materialised by chain-discovery; here we join
 * back to the live RegistrySubunit mirror (for current outlet name/status/address) and to the
 * Company table (for operator names), the same join style as subunit-search-service.
 */

export type ChainSummary = {
  slug: string;
  name: string;
  nameKey: string;
  naceCode: string | null;
  naceDescription: string | null;
  storeCount: number;
  activeStoreCount: number;
  operatorCount: number;
  municipalityCount: number;
  confidence: number | null;
  builtAt: Date;
};

export type ChainStore = {
  orgNumber: string;
  name: string;
  status: string;
  addressStreet: string | null;
  postalCode: string | null;
  postalPlace: string | null;
  municipality: string | null;
  operatorOrgNumber: string | null;
  operatorName: string | null;
};

export type ChainOperator = {
  orgNumber: string;
  name: string | null;
  storeCount: number;
};

export type ChainProfile = ChainSummary & {
  stores: ChainStore[];
  operators: ChainOperator[];
};

const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;

/** List discovered chains, largest first. */
export async function listChains(
  options: { nacePrefix?: string; minStores?: number; limit?: number } = {},
): Promise<ChainSummary[]> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
  const naceFilter = options.nacePrefix
    ? Prisma.sql`AND "naceCode" LIKE ${`${options.nacePrefix}%`}`
    : Prisma.empty;
  const minStoresFilter =
    options.minStores != null ? Prisma.sql`AND "storeCount" >= ${options.minStores}` : Prisma.empty;

  return prisma.$queryRaw<ChainSummary[]>(Prisma.sql`
    SELECT
      "slug",
      "name",
      "nameKey",
      "naceCode",
      "naceDescription",
      "storeCount",
      "activeStoreCount",
      "operatorCount",
      "municipalityCount",
      "confidence"::float8 AS "confidence",
      "builtAt"
    FROM "RetailChain"
    WHERE TRUE
    ${naceFilter}
    ${minStoresFilter}
    ORDER BY "storeCount" DESC, "name" ASC
    LIMIT ${limit}
  `);
}

/**
 * Full franchise profile: the chain plus all its outlets (joined to the live mirror) and the
 * distinct operating companies behind them. Returns null if the slug is unknown.
 */
export async function getChainProfile(slug: string): Promise<ChainProfile | null> {
  const chains = await prisma.$queryRaw<Array<ChainSummary & { id: string }>>(Prisma.sql`
    SELECT
      "id",
      "slug",
      "name",
      "nameKey",
      "naceCode",
      "naceDescription",
      "storeCount",
      "activeStoreCount",
      "operatorCount",
      "municipalityCount",
      "confidence"::float8 AS "confidence",
      "builtAt"
    FROM "RetailChain"
    WHERE "slug" = ${slug}
    LIMIT 1
  `);
  const chain = chains[0];
  if (!chain) return null;

  const stores = await prisma.$queryRaw<ChainStore[]>(Prisma.sql`
    SELECT
      s."orgNumber",
      s."name",
      s."status"::text AS "status",
      s."addressStreet",
      s."postalCode",
      s."postalPlace",
      s."municipality",
      m."operatorOrgNumber",
      c."name" AS "operatorName"
    FROM "ChainMembership" m
    JOIN "RegistrySubunit" s ON s."orgNumber" = m."subunitOrgNumber"
    LEFT JOIN "Company" c ON c."orgNumber" = m."operatorOrgNumber"
    WHERE m."chainId" = ${chain.id}
    ORDER BY (s."status" = 'ACTIVE') DESC, s."name" ASC
  `);

  const operators = await prisma.$queryRaw<ChainOperator[]>(Prisma.sql`
    SELECT
      m."operatorOrgNumber" AS "orgNumber",
      COALESCE(re."name", c."name") AS "name",
      count(*)::int AS "storeCount"
    FROM "ChainMembership" m
    LEFT JOIN "RegistryEntity" re ON re."orgNumber" = m."operatorOrgNumber"
    LEFT JOIN "Company" c ON c."orgNumber" = m."operatorOrgNumber"
    WHERE m."chainId" = ${chain.id} AND m."operatorOrgNumber" IS NOT NULL
    GROUP BY m."operatorOrgNumber", re."name", c."name"
    ORDER BY count(*) DESC, COALESCE(re."name", c."name") ASC
  `);

  const { id: _id, ...summary } = chain;
  return { ...summary, stores, operators };
}

/** Which chain (if any) an outlet belongs to — reverse lookup for a company/outlet page. */
export async function getChainForSubunit(orgNumber: string): Promise<ChainSummary | null> {
  const rows = await prisma.$queryRaw<ChainSummary[]>(Prisma.sql`
    SELECT
      rc."slug",
      rc."name",
      rc."nameKey",
      rc."naceCode",
      rc."naceDescription",
      rc."storeCount",
      rc."activeStoreCount",
      rc."operatorCount",
      rc."municipalityCount",
      rc."confidence"::float8 AS "confidence",
      rc."builtAt"
    FROM "ChainMembership" m
    JOIN "RetailChain" rc ON rc."id" = m."chainId"
    WHERE m."subunitOrgNumber" = ${orgNumber}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

function compactChainText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9æøå]+/g, "");
}

function chainMatchScore(query: string, chain: ChainSummary): number {
  const compactQuery = compactChainText(query);
  const candidates = [chain.name, chain.nameKey, chain.slug]
    .map(compactChainText)
    .filter(Boolean);
  if (candidates.some((candidate) => compactQuery === candidate)) return 1_000;

  const embeddedLength = candidates
    .filter((candidate) => compactQuery.includes(candidate))
    .reduce((best, candidate) => Math.max(best, candidate.length), 0);
  if (embeddedLength > 0) return 800 + embeddedLength;

  const queryTokens = new Set(
    query
      .normalize("NFKD")
      .toLowerCase()
      .match(/[a-z0-9æøå]+/g) ?? [],
  );
  const chainTokens = chain.nameKey
    .normalize("NFKD")
    .toLowerCase()
    .match(/[a-z0-9æøå]+/g) ?? [];
  const overlap = chainTokens.filter((token) => queryTokens.has(token)).length;
  return overlap > 0 ? (overlap / chainTokens.length) * 100 : 0;
}

/** Select the most specific discovered chain mentioned in a natural-language question. */
export function selectChainForQuery(
  query: string,
  chains: ChainSummary[],
): ChainSummary | null {
  return (
    chains
      .map((chain) => ({ chain, score: chainMatchScore(query, chain) }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || b.chain.storeCount - a.chain.storeCount)[0]?.chain ?? null
  );
}

/** Resolve a natural-language chain reference and load every known operating company. */
export async function findChainProfile(query: string): Promise<ChainProfile | null> {
  const chain = selectChainForQuery(query, await listChains({ limit: MAX_LIST_LIMIT }));
  return chain ? getChainProfile(chain.slug) : null;
}
