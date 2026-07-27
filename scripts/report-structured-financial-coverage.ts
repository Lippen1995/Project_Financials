import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { prisma } from "@/lib/prisma";
import {
  buildStructuredFinancialCoverageReport,
  formatStructuredFinancialCoverageMarkdown,
} from "@/server/services/structured-financial-coverage-service";

type OutputFormat = "markdown" | "json";

function parseOptions(argv: string[]) {
  let format: OutputFormat = "markdown";
  let output: string | null = null;

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
    } else {
      throw new Error(`Ukjent argument: ${argument}`);
    }
  }

  return { format, output };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const states = await prisma.structuredFinancialFetchState.findMany({
    orderBy: { lastCheckedAt: "desc" },
    select: {
      status: true,
      unavailableReason: true,
      latestFiscalYear: true,
      company: {
        select: {
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

  const report = buildStructuredFinancialCoverageReport(
    states.map((state) => ({
      status: state.status,
      unavailableReason: state.unavailableReason,
      latestFiscalYear: state.latestFiscalYear,
      statement: state.company.financialStatements[0] ?? null,
    })),
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
