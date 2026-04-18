import { prisma } from "@/lib/prisma";
import { syncNewAnnualReportFilings } from "@/server/services/annual-report-financials-service";

async function main() {
  const orgNumbers = process.argv.slice(2);
  const result = await syncNewAnnualReportFilings({
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
