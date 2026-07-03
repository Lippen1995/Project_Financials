import { prisma } from "@/lib/prisma";
import { ingestStructuredFinancialsForCompany } from "@/server/services/structured-financials-service";

type CliOptions = {
  limit: number | null;
  delayMs: number;
  orgNumbers: string[];
  refresh: boolean;
};

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = { limit: null, delayMs: 400, orgNumbers: [], refresh: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--limit") options.limit = Number(argv[++index]);
    else if (arg === "--delay-ms") options.delayMs = Number(argv[++index]);
    else if (arg === "--org") options.orgNumbers.push(argv[++index]);
    else if (arg === "--refresh") options.refresh = true;
    else throw new Error(`Ukjent argument: ${arg}`);
  }
  return options;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));

  const companies = await prisma.company.findMany({
    where: {
      ...(options.orgNumbers.length ? { orgNumber: { in: options.orgNumbers } } : {}),
      // Resume: skip companies that already carry a structured statement,
      // unless --refresh (new filings arrive continuously through the year).
      ...(options.refresh || options.orgNumbers.length
        ? {}
        : {
            financialStatements: {
              none: { sourceEntityType: "structuredAnnualAccounts" },
            },
          }),
    },
    select: { orgNumber: true },
    orderBy: { orgNumber: "asc" },
    ...(options.limit ? { take: options.limit } : {}),
  });

  console.log(`Structured ingestion: ${companies.length} selskaper (delay ${options.delayMs}ms)`);

  let published = 0;
  let skippedReviewed = 0;
  let unavailable = 0;
  let failures = 0;

  for (const [index, company] of companies.entries()) {
    try {
      const result = await ingestStructuredFinancialsForCompany(company.orgNumber);
      published += result.published;
      skippedReviewed += result.skippedReviewed;
      if (result.unavailableReason) unavailable += 1;
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`FEIL ${company.orgNumber}: ${message}`);
    }
    if ((index + 1) % 200 === 0) {
      console.log(
        `[${index + 1}/${companies.length}] published=${published} reviewedSkip=${skippedReviewed} unavailable=${unavailable} feil=${failures}`,
      );
    }
    if (options.delayMs > 0) await sleep(options.delayMs);
  }

  console.log(
    JSON.stringify(
      { checkedCompanies: companies.length, published, skippedReviewed, unavailable, failures },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
