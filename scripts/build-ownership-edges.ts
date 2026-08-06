import "./_load-env";

import { prisma } from "@/lib/prisma";
import {
  buildAllOwnershipEdges,
  buildOwnershipEdgesForYear,
  type OwnershipEdgeBuildResult,
} from "@/server/ownership/ownership-edge-builder";

function parseYear(): number | null {
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--year=")) {
      const value = Number.parseInt(arg.slice("--year=".length), 10);
      if (!Number.isInteger(value)) {
        throw new Error(`Ugyldig --year=${arg.slice("--year=".length)}`);
      }
      return value;
    }
  }
  return null;
}

function logResult(result: OwnershipEdgeBuildResult) {
  console.log(
    `${result.taxYear}: ${result.edgeCount.toLocaleString("nb-NO")} kanter ` +
      `(${result.subsidiaryCount.toLocaleString("nb-NO")} datter, ` +
      `${result.associatedCount.toLocaleString("nb-NO")} tilknyttet, ` +
      `${result.minorityCount.toLocaleString("nb-NO")} minoritet); ` +
      `${result.semanticSnapshot.financialPositionCount.toLocaleString("nb-NO")} ` +
      `offentlige finansielle posisjoner og ` +
      `${result.semanticSnapshot.membershipCount.toLocaleString("nb-NO")} ` +
      `gruppemedlemskap i publisert semantisk snapshot`,
  );
}

async function main() {
  const year = parseYear();
  if (year !== null) {
    console.log(`Bygger eierskapskanter for ${year}...`);
    logResult(await buildOwnershipEdgesForYear(year));
    return;
  }

  console.log("Bygger eierskapskanter for alle tilgjengelige skatteår...");
  const results = await buildAllOwnershipEdges();
  if (results.length === 0) {
    console.log("Ingen register-data funnet å bygge kanter fra.");
    return;
  }
  for (const result of results) {
    logResult(result);
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
