import { importAndRefreshDistressFinancials } from "@/server/services/distress-analysis-service";
import { prisma } from "@/lib/prisma";

async function main() {
  const orgNumbers = process.argv.slice(2);

  if (orgNumbers.length === 0) {
    throw new Error("Oppgi minst ett organisasjonsnummer.");
  }

  for (const orgNumber of orgNumbers) {
    const result = await importAndRefreshDistressFinancials(orgNumber);
    console.log(
      JSON.stringify(
        {
          imported: result.orgNumber,
          companyName: result.companyName,
          statementsImported: result.statementsImported,
          documentYears: result.documentYears,
        },
        null,
        2,
      ),
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
