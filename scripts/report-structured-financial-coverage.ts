import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { prisma } from "@/lib/prisma";
import {
  buildStructuredFinancialCoverageReport,
  formatStructuredFinancialCoverageMarkdown,
} from "@/server/services/structured-financial-coverage-service";
import {
  selectStructuredFinancialCloseoutSample,
  STRUCTURED_FINANCIAL_CLOSEOUT_SAMPLE_PROFILE,
} from "@/server/services/structured-financial-sampling-service";

type OutputFormat = "markdown" | "json";

function parseOptions(argv: string[]) {
  let format: OutputFormat = "markdown";
  let output: string | null = null;
  let sampleProfile: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--format") {
      if (value !== "markdown" && value !== "json") {
        throw new Error("--format må være markdown eller json.");
      }
      format = value;
      index += 1;
    } else if (argument === "--output") {
      if (!value || value.startsWith("--")) {
        throw new Error("--output krever en filsti.");
      }
      output = value;
      index += 1;
    } else if (argument === "--sample-profile") {
      if (value !== STRUCTURED_FINANCIAL_CLOSEOUT_SAMPLE_PROFILE) {
        throw new Error(
          `--sample-profile må være ${STRUCTURED_FINANCIAL_CLOSEOUT_SAMPLE_PROFILE}.`,
        );
      }
      sampleProfile = value;
      index += 1;
    } else {
      throw new Error(`Ukjent argument: ${argument}`);
    }
  }

  return { format, output, sampleProfile };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const sample = options.sampleProfile
    ? selectStructuredFinancialCloseoutSample(
        (
          await prisma.company.findMany({
            select: {
              orgNumber: true,
              legalForm: true,
              status: true,
            },
            orderBy: { orgNumber: "asc" },
          })
        ).map((company) => ({
          ...company,
          companyStatus: company.status,
        })),
      )
    : null;
  const sampleOrgNumbers = sample?.selected.map((company) => company.orgNumber);
  const states = await prisma.structuredFinancialFetchState.findMany({
    where: sampleOrgNumbers
      ? { company: { orgNumber: { in: sampleOrgNumbers } } }
      : undefined,
    orderBy: { lastCheckedAt: "desc" },
    select: {
      status: true,
      lastCheckedAt: true,
      unavailableReason: true,
      latestFiscalYear: true,
      company: {
        select: {
          legalForm: true,
          status: true,
          financialStatements: {
            where: {
              sourceSystem: "BRREG",
              sourceEntityType: "structuredAnnualAccounts",
            },
            orderBy: [{ fiscalYear: "desc" }, { fetchedAt: "desc" }],
            take: 1,
            select: {
              fiscalYear: true,
              revenue: true,
              operatingProfit: true,
              netIncome: true,
              equity: true,
              assets: true,
              rawPayload: true,
            },
          },
        },
      },
    },
  });
  if (sample && states.length !== sample.selected.length) {
    throw new Error(
      `Closeout-rapporten mangler kildekontroll for ${sample.selected.length - states.length} av ${sample.selected.length} valgte virksomheter.`,
    );
  }

  const report = buildStructuredFinancialCoverageReport(
    states.map((state) => ({
      status:
        state.status === "ERROR" && state.company.financialStatements.length > 0
          ? "STALE"
          : state.status,
      checkedAt: state.lastCheckedAt,
      legalForm: state.company.legalForm,
      companyStatus: state.company.status,
      unavailableReason: state.unavailableReason,
      latestFiscalYear: state.latestFiscalYear,
      statement: state.company.financialStatements[0] ?? null,
    })),
    new Date(),
    sample
      ? {
          profile: sample.profile,
          targetSize: sample.targetSize,
          selectedSize: sample.selected.length,
          shortfall: sample.shortfall,
          poolSize: sample.poolSize,
          poolFingerprint: sample.poolFingerprint,
          selectionFingerprint: sample.selectionFingerprint,
          strata: sample.strata,
        }
      : null,
  );
  const content =
    options.format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : formatStructuredFinancialCoverageMarkdown(report);

  if (options.output) {
    const outputPath = resolve(options.output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, "utf8");
    console.log(outputPath);
  } else {
    process.stdout.write(content);
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
