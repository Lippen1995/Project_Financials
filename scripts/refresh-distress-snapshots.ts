import { prisma } from "@/lib/prisma";
import { refreshAllDistressSnapshots } from "@/server/services/distress-analysis-service";

/**
 * Recomputes distress snapshots from statements already in the database — no Brreg calls. Run this
 * after a migration that adds snapshot columns, so the distress module has values to show.
 */
async function main() {
  const result = await refreshAllDistressSnapshots({
    onProgress: (processed, total) => {
      if (processed % 100 === 0 || processed === total) {
        console.log(`${processed}/${total}`);
      }
    },
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
