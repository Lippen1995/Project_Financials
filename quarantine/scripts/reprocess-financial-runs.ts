import { prisma } from "@/lib/prisma";
import { reprocessAnnualReportFilingsByCriteria } from "@/server/services/annual-report-financials-service";
import {
  readFlag,
  readListFlag,
  readNumberFlag,
  readPositionalArgs,
} from "@/scripts/financial-script-utils";

async function main() {
  const filingIds = readPositionalArgs();
  const result = await reprocessAnnualReportFilingsByCriteria({
    filingIds: filingIds.length > 0 ? filingIds : undefined,
    orgNumbers: readListFlag("org"),
    parserVersions: readListFlag("parser"),
    fiscalYearFrom: readNumberFlag("year-from"),
    fiscalYearTo: readNumberFlag("year-to"),
    maxQualityScore: readNumberFlag("max-quality"),
    limit: readNumberFlag("limit"),
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
