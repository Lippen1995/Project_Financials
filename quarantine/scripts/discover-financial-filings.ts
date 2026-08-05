import { prisma } from "@/lib/prisma";
import { discoverAnnualReportFilingsForCompany } from "@/server/services/annual-report-financials-service";

async function main() {
  const orgNumbers = process.argv.slice(2);
  const targets =
    orgNumbers.length > 0
      ? orgNumbers
      : (
          await prisma.company.findMany({
            select: { orgNumber: true },
            orderBy: { orgNumber: "asc" },
          })
        ).map((company) => company.orgNumber);

  const results = [];
  for (const orgNumber of targets) {
    results.push(await discoverAnnualReportFilingsForCompany(orgNumber));
  }

  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
