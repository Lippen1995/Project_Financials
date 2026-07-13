import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { slugify } from "@/lib/utils";
import { prisma } from "@/lib/prisma";

/**
 * Franchise / retail-chain discovery.
 *
 * Brønnøysund has no franchise concept, so a "chain" is a *derived* grouping of underenheter
 * (physical outlets, mirrored in RegistrySubunit) that share a brand — the franchise layer on
 * top of the location layer. Store names follow "BRAND [store-no/location]"
 * ("REMA 1000 Majorstuen", "KIWI 372 Grünerløkka", "COOP EXTRA Storo"), so the brand is the
 * leading token(s).
 *
 * The hard part is telling a brand suffix from a per-store suffix without a hand-list:
 *   - "rema" + "1000"  → "1000" recurs on ~every rema outlet  → part of brand → "rema 1000"
 *   - "kiwi" + "372"   → the number differs per store          → not brand     → "kiwi"
 *   - "coop" + "extra"/"mega"/"prix" → each banner recurs      → part of brand → distinct chains
 *   - "meny" + "sandvika" → the location differs per store      → not brand     → "meny"
 *
 * One data-driven rule covers all four: include the second token in the brand key only if it
 * *recurs* across the first-token group (frequency, not word-vs-number). This is a two-pass
 * clustering, materialised into RetailChain + ChainMembership and rebuilt after each subunit
 * import — the same "materialise + rebuild" shape as OwnershipEdge.
 */

export type SubunitRow = {
  orgNumber: string;
  name: string;
  parentOrgNumber: string | null;
  naceCode: string | null;
  naceDescription: string | null;
  status: string;
  municipalityNumber: string | null;
};

export type ChainCluster = {
  nameKey: string;
  displayName: string;
  slug: string;
  naceCode: string | null;
  naceDescription: string | null;
  storeCount: number;
  activeStoreCount: number;
  operatorCount: number;
  municipalityCount: number;
  confidence: number;
  members: Array<{ orgNumber: string; operatorOrgNumber: string | null }>;
};

export type ClusterOptions = {
  /** Minimum outlets for a cluster to count as a chain. */
  minStores?: number;
  /** Minimum distinct operating companies (franchisees) — unless the cluster is large. */
  minOperators?: number;
  /** A single-operator cluster this large is still a chain (e.g. a wholly-owned banner). */
  singleOperatorStoreFloor?: number;
  /** Absolute count for a second token to be considered part of the brand. */
  secondTokenMinCount?: number;
  /** Share of the first-token group for a second token to be considered part of the brand. */
  secondTokenMinShare?: number;
  /** Max tokens in a brand key. */
  maxBrandTokens?: number;
};

const DEFAULTS = {
  minStores: 5,
  minOperators: 2,
  singleOperatorStoreFloor: 10,
  secondTokenMinCount: 3,
  secondTokenMinShare: 0.05,
  maxBrandTokens: 2,
} satisfies Required<ClusterOptions>;

/** Lowercase, keep letters + digits (incl. æøå/é/ü in place names), collapse the rest to spaces. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function tokenize(name: string): string[] {
  const normalized = normalizeName(name);
  return normalized.length === 0 ? [] : normalized.split(" ");
}

/**
 * Pass 1: for each leading token, count how often each second token appears. Used to decide
 * whether a second token is part of the brand (recurring) or a per-store suffix (rare).
 */
export function buildSecondTokenIndex(rows: SubunitRow[]): {
  secondCounts: Map<string, Map<string, number>>;
  groupSizes: Map<string, number>;
} {
  const secondCounts = new Map<string, Map<string, number>>();
  const groupSizes = new Map<string, number>();
  for (const row of rows) {
    const tokens = tokenize(row.name);
    if (tokens.length === 0) continue;
    const first = tokens[0];
    groupSizes.set(first, (groupSizes.get(first) ?? 0) + 1);
    if (tokens.length < 2) continue;
    const second = tokens[1];
    let inner = secondCounts.get(first);
    if (!inner) {
      inner = new Map();
      secondCounts.set(first, inner);
    }
    inner.set(second, (inner.get(second) ?? 0) + 1);
  }
  return { secondCounts, groupSizes };
}

/**
 * Pass 2: derive the brand key for one name given the second-token index. Returns null for
 * names with no usable leading token.
 */
export function deriveBrandKey(
  name: string,
  index: { secondCounts: Map<string, Map<string, number>>; groupSizes: Map<string, number> },
  options: ClusterOptions = {},
): string | null {
  const opts = { ...DEFAULTS, ...options };
  const tokens = tokenize(name);
  if (tokens.length === 0) return null;

  const key = [tokens[0]];
  if (tokens.length >= 2 && opts.maxBrandTokens >= 2) {
    const first = tokens[0];
    const second = tokens[1];
    const count = index.secondCounts.get(first)?.get(second) ?? 0;
    const groupSize = index.groupSizes.get(first) ?? 0;
    const share = groupSize > 0 ? count / groupSize : 0;
    if (count >= opts.secondTokenMinCount && share >= opts.secondTokenMinShare) {
      key.push(second);
    }
  }
  return key.join(" ");
}

/** Most frequent value; ties broken by first-seen order. */
function mode<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  let best: T | null = null;
  let bestCount = 0;
  for (const value of values) {
    const next = (counts.get(value) ?? 0) + 1;
    counts.set(value, next);
    if (next > bestCount) {
      best = value;
      bestCount = next;
    }
  }
  return best;
}

/**
 * Cluster underenheter into candidate chains. Pure (no DB) so it can be unit-tested on
 * fixtures. Clusters below the size/operator thresholds are dropped.
 */
export function clusterSubunits(rows: SubunitRow[], options: ClusterOptions = {}): ChainCluster[] {
  const opts = { ...DEFAULTS, ...options };
  const index = buildSecondTokenIndex(rows);

  const groups = new Map<string, SubunitRow[]>();
  for (const row of rows) {
    const key = deriveBrandKey(row.name, index, opts);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const clusters: ChainCluster[] = [];
  const usedSlugs = new Set<string>();

  for (const [nameKey, members] of groups) {
    const storeCount = members.length;
    const operators = new Set(members.map((m) => m.parentOrgNumber).filter(Boolean) as string[]);
    const operatorCount = operators.size;

    const passesOperators =
      operatorCount >= opts.minOperators || storeCount >= opts.singleOperatorStoreFloor;
    if (storeCount < opts.minStores || !passesOperators) continue;

    const activeStoreCount = members.filter((m) => m.status === "ACTIVE").length;
    const municipalityCount = new Set(
      members.map((m) => m.municipalityNumber).filter(Boolean) as string[],
    ).size;

    // Display label: the most common original-cased prefix among members, so we surface
    // "REMA 1000" / "Meny" as written rather than a lowercased key.
    const keyTokenCount = nameKey.split(" ").length;
    const displayName =
      mode(
        members.map((m) => {
          const originalTokens = m.name.trim().split(/\s+/).slice(0, keyTokenCount);
          return originalTokens.join(" ");
        }),
      ) ?? nameKey;

    const naceCode = mode(members.map((m) => m.naceCode).filter(Boolean) as string[]);
    const naceDescription = naceCode
      ? (members.find((m) => m.naceCode === naceCode)?.naceDescription ?? null)
      : null;
    const naceConsistency = naceCode
      ? members.filter((m) => m.naceCode === naceCode).length / storeCount
      : 0;

    // Heuristic 0–1 signal of how franchise-like the cluster is: operator spread dominates
    // (many franchisees), then raw size, then how coherent the industry code is.
    const confidence = Number(
      (
        0.5 * Math.min(1, operatorCount / 10) +
        0.3 * Math.min(1, storeCount / 30) +
        0.2 * naceConsistency
      ).toFixed(3),
    );

    let slug = slugify(displayName) || slugify(nameKey) || `chain-${clusters.length + 1}`;
    if (usedSlugs.has(slug)) {
      let suffix = 2;
      while (usedSlugs.has(`${slug}-${suffix}`)) suffix += 1;
      slug = `${slug}-${suffix}`;
    }
    usedSlugs.add(slug);

    clusters.push({
      nameKey,
      displayName,
      slug,
      naceCode,
      naceDescription,
      storeCount,
      activeStoreCount,
      operatorCount,
      municipalityCount,
      confidence,
      members: members.map((m) => ({ orgNumber: m.orgNumber, operatorOrgNumber: m.parentOrgNumber })),
    });
  }

  clusters.sort((a, b) => b.storeCount - a.storeCount);
  return clusters;
}

/**
 * Consumer-facing sectors where "chain / franchise" is a meaningful concept — the default scope
 * for discovery. Over the *whole* register the leading-token clustering is dominated by housing
 * co-ownerships (SAMEIET/BORETTSLAGET), professions (TANNLEGE/LEGE) and personal names, none of
 * which are franchises; restricting to these NACE prefixes keeps the output franchise-shaped.
 *   45 vehicle trade · 47 retail · 55 accommodation · 56 food & beverage service ·
 *   96.02 hairdressing/beauty · 96.04 physical wellbeing (gyms)
 */
export const DEFAULT_CHAIN_NACE_PREFIXES = ["45", "47", "55", "56", "96.02", "96.04"];

/**
 * Load candidate outlets from the local mirror. Pass a list of NACE prefixes to scope by sector
 * (matched as `LIKE 'prefix%'`, OR-ed); pass null/empty to scan the whole register.
 */
export async function loadCandidateSubunits(
  nacePrefixes?: string[] | null,
): Promise<SubunitRow[]> {
  const prefixes = (nacePrefixes ?? []).map((p) => p.trim()).filter((p) => p.length > 0);
  const naceFilter =
    prefixes.length > 0
      ? Prisma.sql`WHERE (${Prisma.join(
          prefixes.map((p) => Prisma.sql`"naceCode" LIKE ${`${p}%`}`),
          " OR ",
        )})`
      : Prisma.empty;
  return prisma.$queryRaw<SubunitRow[]>(Prisma.sql`
    SELECT
      "orgNumber",
      "name",
      "parentOrgNumber",
      "naceCode",
      "naceDescription",
      "status"::text AS "status",
      "municipalityNumber"
    FROM "RegistrySubunit"
    ${naceFilter}
  `);
}

const CHAIN_BATCH = 1000; // 15 cols → 15000 binds, under Postgres' 32767 limit
const MEMBERSHIP_BATCH = 5000; // 5 cols → 25000 binds

/**
 * Replace all AUTO chains with a freshly discovered set. MANUAL chains (and their
 * memberships) are preserved — the AUTO delete cascades only to AUTO memberships.
 *
 * Raw parameterised SQL rather than the Prisma client, for the same reason the ingest
 * scripts use it: the Windows dev server locks the query-engine DLL and blocks
 * `prisma generate`, so this must not depend on regenerating the client.
 */
export async function persistChains(clusters: ChainCluster[]): Promise<void> {
  await prisma.$executeRawUnsafe('DELETE FROM "RetailChain" WHERE "source" = \'AUTO\'');

  const now = new Date();
  const membershipTuples: Prisma.Sql[] = [];

  for (let i = 0; i < clusters.length; i += CHAIN_BATCH) {
    const slice = clusters.slice(i, i + CHAIN_BATCH);
    const chainTuples = slice.map((c) => {
      const chainId = randomUUID();
      for (const member of c.members) {
        membershipTuples.push(Prisma.sql`(
          ${member.orgNumber}, ${chainId}, ${member.operatorOrgNumber},
          ${"NAME_PREFIX"}::"ChainMatchMethod", ${now}
        )`);
      }
      return Prisma.sql`(
        ${chainId}, ${c.slug}, ${c.displayName}, ${c.nameKey}, ${c.naceCode}, ${c.naceDescription},
        ${c.storeCount}, ${c.activeStoreCount}, ${c.operatorCount}, ${c.municipalityCount},
        ${"AUTO"}::"ChainSource", ${c.confidence}, ${now}, ${now}, ${now}
      )`;
    });

    if (chainTuples.length > 0) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "RetailChain" (
          "id", "slug", "name", "nameKey", "naceCode", "naceDescription",
          "storeCount", "activeStoreCount", "operatorCount", "municipalityCount",
          "source", "confidence", "builtAt", "createdAt", "updatedAt"
        ) VALUES ${Prisma.join(chainTuples)}
      `);
    }
  }

  for (let i = 0; i < membershipTuples.length; i += MEMBERSHIP_BATCH) {
    const slice = membershipTuples.slice(i, i + MEMBERSHIP_BATCH);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ChainMembership" (
        "subunitOrgNumber", "chainId", "operatorOrgNumber", "matchMethod", "builtAt"
      ) VALUES ${Prisma.join(slice)}
      ON CONFLICT ("subunitOrgNumber") DO UPDATE SET
        "chainId" = EXCLUDED."chainId",
        "operatorOrgNumber" = EXCLUDED."operatorOrgNumber",
        "matchMethod" = EXCLUDED."matchMethod",
        "builtAt" = EXCLUDED."builtAt"
    `);
  }
}

export type DiscoverResult = {
  candidateCount: number;
  chainCount: number;
  membershipCount: number;
  clusters: ChainCluster[];
};

/**
 * Full pipeline: load candidates → cluster → persist.
 *
 * `nacePrefixes`: a list scopes discovery to those sectors; omitting it uses
 * DEFAULT_CHAIN_NACE_PREFIXES; passing null scans the whole register (noisy — see the constant).
 */
export async function discoverChains(
  options: ClusterOptions & { nacePrefixes?: string[] | null } = {},
): Promise<DiscoverResult> {
  const { nacePrefixes, ...clusterOptions } = options;
  const scope = nacePrefixes === undefined ? DEFAULT_CHAIN_NACE_PREFIXES : nacePrefixes;
  const rows = await loadCandidateSubunits(scope);
  const clusters = clusterSubunits(rows, clusterOptions);
  await persistChains(clusters);
  return {
    candidateCount: rows.length,
    chainCount: clusters.length,
    membershipCount: clusters.reduce((sum, c) => sum + c.storeCount, 0),
    clusters,
  };
}
