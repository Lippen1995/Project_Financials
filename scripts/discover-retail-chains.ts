import "./_load-env";

import { prisma } from "@/lib/prisma";
import { discoverChains, type ClusterOptions } from "@/server/franchise/chain-discovery";

/**
 * Discover retail chains / franchises by clustering the underenhet mirror, and materialise
 * them into RetailChain + ChainMembership. Run after `brreg:ingest-subunits`.
 *
 * Usage:
 *   npm run franchise:discover-chains                       # whole register
 *   npm run franchise:discover-chains -- --nace=47.11       # grocery outlets only
 *   npm run franchise:discover-chains -- --min-stores=8 --min-operators=3
 */
function parseArgs(): ClusterOptions & { nacePrefix: string | null } {
  const out: ClusterOptions & { nacePrefix: string | null } = { nacePrefix: null };
  for (const arg of process.argv.slice(2)) {
    const nace = arg.match(/^--nace=(.+)$/);
    if (nace) out.nacePrefix = nace[1];
    const minStores = arg.match(/^--min-stores=(\d+)$/);
    if (minStores) out.minStores = Number(minStores[1]);
    const minOperators = arg.match(/^--min-operators=(\d+)$/);
    if (minOperators) out.minOperators = Number(minOperators[1]);
    const floor = arg.match(/^--single-operator-floor=(\d+)$/);
    if (floor) out.singleOperatorStoreFloor = Number(floor[1]);
  }
  return out;
}

async function main() {
  const options = parseArgs();
  const startedAt = Date.now();

  console.log(
    `Discovering chains${options.nacePrefix ? ` (NACE ${options.nacePrefix})` : ""}…`,
  );
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
