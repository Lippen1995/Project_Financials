import { prisma } from "@/lib/prisma";
import { discoverAnnualReportFilingsForCompany } from "@/server/services/annual-report-financials-service";

type CliOptions = {
  limit: number | null;
  delayMs: number;
  skipCheckedWithinHours: number | null;
};

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = { limit: null, delayMs: 150, skipCheckedWithinHours: 24 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--limit") options.limit = Number(argv[++index]);
    else if (arg === "--delay-ms") options.delayMs = Number(argv[++index]);
    else if (arg === "--skip-checked-within-hours") options.skipCheckedWithinHours = Number(argv[++index]);
    else if (arg === "--no-skip") options.skipCheckedWithinHours = null;
    else throw new Error(`Ukjent argument: ${arg}`);
  }
  return options;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));

  const checkedCutoff =
    options.skipCheckedWithinHours !== null
      ? new Date(Date.now() - options.skipCheckedWithinHours * 3_600_000)
      : null;

  const companies = await prisma.company.findMany({
    where: checkedCutoff
      ? {
          OR: [
            { financialCoverage: null },
            { financialCoverage: { lastCheckedAt: { lt: checkedCutoff } } },
            { financialCoverage: { lastCheckedAt: null } },
          ],
        }
      : {},
    select: { orgNumber: true },
    orderBy: { orgNumber: "asc" },
    ...(options.limit ? { take: options.limit } : {}),
  });

  console.log(`Discovery: ${companies.length} selskaper (delay ${options.delayMs}ms)`);

  let discoveredFilings = 0;
  let companiesWithFilings = 0;
  let failures = 0;

  for (const [index, company] of companies.entries()) {
    try {
      const result = await discoverAnnualReportFilingsForCompany(company.orgNumber);
      discoveredFilings += result.discoveredFilings;
      if (result.discoveredFilings > 0) companiesWithFilings += 1;
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`FEIL ${company.orgNumber}: ${message}`);
    }
    if ((index + 1) % 100 === 0) {
      console.log(
        `[${index + 1}/${companies.length}] filings=${discoveredFilings} medFilings=${companiesWithFilings} feil=${failures}`,
      );
    }
    if (options.delayMs > 0) await sleep(options.delayMs);
  }

  console.log(
    JSON.stringify(
      { checkedCompanies: companies.length, discoveredFilings, companiesWithFilings, failures },
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
