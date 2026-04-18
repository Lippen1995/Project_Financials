import { prisma } from "@/lib/prisma";
import { getLatestPublishedStatementProvenance } from "@/server/services/annual-report-financials-service";
import { readNumberFlag, readPositionalArgs } from "@/scripts/financial-script-utils";

async function main() {
  const [orgNumber] = readPositionalArgs();
  if (!orgNumber) {
    throw new Error("Bruk: npm run financials:inspect-published-provenance -- <orgNumber> [--fiscal-year=2024]");
  }

  const result = await getLatestPublishedStatementProvenance(
    orgNumber,
    readNumberFlag("fiscal-year"),
  );

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
