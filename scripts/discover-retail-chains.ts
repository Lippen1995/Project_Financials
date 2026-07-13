import "./_load-env";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_CHAIN_NACE_PREFIXES,
  discoverChains,
  type ClusterOptions,
} from "@/server/franchise/chain-discovery";

/**
 * Discover retail chains / franchises by clustering the underenhet mirror, and materialise
 * them into RetailChain + ChainMembership. Run after `brreg:ingest-subunits`.
 *
 * Scope: with no --nace, discovery covers the consumer-facing default sectors
 * (DEFAULT_CHAIN_NACE_PREFIXES). --nace takes one or more comma-separated prefixes.
 * --all-nace forces the whole register (noisy — housing co-ownerships, professions, names).
 *
 * Usage:
 *   npm run franchise:discover-chains                       # default consumer sectors
 *   npm run franchise:discover-chains -- --nace=47          # retail trade only
 *   npm run franchise:discover-chains -- --nace=47,56,55    # retail + food service + hotels
 *   npm run franchise:discover-chains -- --all-nace         # whole register (noisy)
 *   npm run franchise:discover-chains -- --min-stores=8 --min-operators=3
 */
type CliOptions = ClusterOptions & { nacePrefixes?: string[] | null };

function parseArgs(): CliOptions {
  const out: CliOptions = {};
  for (const arg of process.argv.slice(2)) {
    const nace = arg.match(/^--nace=(.+)$/);
    if (nace) out.nacePrefixes = nace[1].split(",").map((p) => p.trim()).filter(Boolean);
    if (arg === "--all-nace") out.nacePrefixes = null;
    const minStores = arg.match(/^--min-stores=(\d+)$/);
    if (minStores) out.minStores = Number(minStores[1]);
    const minOperators = arg.match(/^--min-operators=(\d+)$/);
    if (minOperators) out.minOperators = Number(minOperators[1]);
    const floor = arg.match(/^--single-operator-floor=(\d+)$/);
    if (floor) out.singleOperatorStoreFloor = Number(floor[1]);
  }
  return out;
}

function describeScope(nacePrefixes?: string[] | null): string {
  if (nacePrefixes === null) return "whole register";
  const prefixes = nacePrefixes ?? DEFAULT_CHAIN_NACE_PREFIXES;
  return `NACE ${prefixes.join(", ")}`;
}

async function main() {
  const options = parseArgs();
  const startedAt = Date.now();

  console.log(`Discovering chains (${describeScope(options.nacePrefixes)})…`);
  const result = await discoverChains(options);

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `Scanned ${result.candidateCount.toLocaleString("nb-NO")} outlets → ` +
      `${result.chainCount.toLocaleString("nb-NO")} chains, ` +
      `${result.membershipCount.toLocaleString("nb-NO")} memberships in ${seconds}s`,
  );

  const top = result.clusters.slice(0, 25);
  if (top.length > 0) {
    console.log("\nTop chains by outlet count:");
    for (const c of top) {
      console.log(
        `  ${c.displayName.padEnd(28)} ${String(c.storeCount).padStart(5)} outlets · ` +
          `${String(c.operatorCount).padStart(4)} operators · ` +
          `${String(c.municipalityCount).padStart(3)} kommuner · conf ${c.confidence.toFixed(2)}`,
      );
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
