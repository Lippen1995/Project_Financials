import { prisma } from "@/lib/prisma";
import { backfillDistressFinancials } from "@/server/services/distress-analysis-service";

async function main() {
  const orgNumbers = process.argv.slice(2);
  const result = await backfillDistressFinancials({
    orgNumbers: orgNumbers.length > 0 ? orgNumbers : undefined,
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
