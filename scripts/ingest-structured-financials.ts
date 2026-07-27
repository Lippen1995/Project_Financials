import { prisma } from "@/lib/prisma";
import { findChainProfile } from "@/server/franchise/chain-service";
import {
  selectStructuredFinancialCloseoutSample,
  STRUCTURED_FINANCIAL_CLOSEOUT_SAMPLE_PROFILE,
} from "@/server/services/structured-financial-sampling-service";
import { ingestStructuredFinancialsForCompany } from "@/server/services/structured-financials-service";

type CliOptions = {
  limit: number | null;
  delayMs: number;
  orgNumbers: string[];
  chainQuery: string | null;
  refresh: boolean;
  sampleProfile: string | null;
};

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    limit: null,
    delayMs: 400,
    orgNumbers: [],
    chainQuery: null,
    refresh: false,
    sampleProfile: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} krever en verdi.`);
      }
      index += 1;
      return value;
    };

    if (arg === "--limit") options.limit = Number(nextValue());
    else if (arg === "--delay-ms") options.delayMs = Number(nextValue());
    else if (arg === "--org") options.orgNumbers.push(nextValue());
    else if (arg === "--chain") options.chainQuery = nextValue();
    else if (arg === "--refresh") options.refresh = true;
    else if (arg === "--sample-profile") options.sampleProfile = nextValue();
    else throw new Error(`Ukjent argument: ${arg}`);
  }

  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit <= 0)) {
    throw new Error("--limit må være et positivt heltall.");
  }
  if (!Number.isInteger(options.delayMs) || options.delayMs < 0) {
    throw new Error("--delay-ms må være et ikke-negativt heltall.");
  }
  const invalidOrgNumber = options.orgNumbers.find((orgNumber) => !/^\d{9}$/.test(orgNumber));
  if (invalidOrgNumber) {
    throw new Error(`Ugyldig organisasjonsnummer: ${invalidOrgNumber}.`);
  }
  if (
    options.sampleProfile !== null &&
    options.sampleProfile !== STRUCTURED_FINANCIAL_CLOSEOUT_SAMPLE_PROFILE
  ) {
    throw new Error(
      `Ukjent utvalgsprofil: ${options.sampleProfile}.`,
    );
  }
  if (
    options.sampleProfile &&
    (options.orgNumbers.length > 0 || options.chainQuery || options.limit)
  ) {
    throw new Error(
      "--sample-profile kan ikke kombineres med --org, --chain eller --limit.",
    );
  }
  return options;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const chainProfile = options.chainQuery
    ? await findChainProfile(options.chainQuery)
    : null;
  if (options.chainQuery && !chainProfile) {
    throw new Error(`Fant ingen kjede som matcher «${options.chainQuery}».`);
  }
  const chainOrgNumbers = chainProfile?.operators.map((operator) => operator.orgNumber) ?? [];
  const requestedOrgNumbers = [...new Set([...options.orgNumbers, ...chainOrgNumbers])];
  const dueAt = new Date();

  let companies: Array<{ orgNumber: string }>;
  if (options.sampleProfile) {
    const pool = await prisma.company.findMany({
      select: {
        orgNumber: true,
        legalForm: true,
        status: true,
        structuredFinancialFetchState: {
          select: { nextCheckAt: true },
        },
      },
      orderBy: { orgNumber: "asc" },
    });
    const sample = selectStructuredFinancialCloseoutSample(
      pool.map((company) => ({
        ...company,
        companyStatus: company.status,
      })),
    );
    companies = sample.selected
      .filter(
        (company) =>
          options.refresh ||
          !company.structuredFinancialFetchState ||
          company.structuredFinancialFetchState.nextCheckAt <= dueAt,
      )
      .map(({ orgNumber }) => ({ orgNumber }));
    console.log(
      JSON.stringify({
        sampleProfile: sample.profile,
        poolFingerprint: sample.poolFingerprint,
        selectionFingerprint: sample.selectionFingerprint,
        targetSize: sample.targetSize,
        selectedSize: sample.selected.length,
        dueForSourceCheck: companies.length,
        strata: sample.strata.map(({ id, target, selected }) => ({
          id,
          target,
          selected,
        })),
      }),
    );
  } else {
    companies = await prisma.company.findMany({
      where: {
        ...(requestedOrgNumbers.length ? { orgNumber: { in: requestedOrgNumbers } } : {}),
        // Resume from the persisted source-health cache. Available, empty and
        // failed checks all carry an explicit nextCheckAt, avoiding retry loops.
        ...(options.refresh || options.orgNumbers.length
          ? {}
          : {
              OR: [
                { structuredFinancialFetchState: { is: null } },
                {
                  structuredFinancialFetchState: {
                    is: { nextCheckAt: { lte: dueAt } },
                  },
                },
              ],
            }),
      },
      select: { orgNumber: true },
      orderBy: { orgNumber: "asc" },
      ...(options.limit ? { take: options.limit } : {}),
    });
  }

  console.log(
    `Structured ingestion: ${companies.length} selskaper${chainProfile ? ` i ${chainProfile.name}` : ""} (delay ${options.delayMs}ms)`,
  );

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
      if (result.status === "ERROR" || result.status === "STALE") failures += 1;
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
