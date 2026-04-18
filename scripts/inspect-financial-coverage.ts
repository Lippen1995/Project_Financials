import { prisma } from "@/lib/prisma";
import { inspectCompanyFinancialCoverage } from "@/server/services/annual-report-financials-service";
import { readListFlag, readNumberFlag } from "@/scripts/financial-script-utils";

async function main() {
  const result = await inspectCompanyFinancialCoverage({
    orgNumbers: readListFlag("org"),
    limit: readNumberFlag("limit"),
    onlyDue: process.argv.includes("--only-due"),
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
