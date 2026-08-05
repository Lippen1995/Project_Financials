import { prisma } from "@/lib/prisma";
import { reprocessAnnualReportFilingById } from "@/server/services/annual-report-financials-service";
import { readFlag, readPositionalArgs } from "@/scripts/financial-script-utils";

async function main() {
  const [filingId] = readPositionalArgs();
  if (!filingId) {
    throw new Error("Bruk: npm run financials:reprocess-filing -- <filingId>");
  }

  const result = await reprocessAnnualReportFilingById(filingId, {
    note: readFlag("note"),
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
