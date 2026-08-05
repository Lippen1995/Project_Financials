import { prisma } from "@/lib/prisma";
import { BoardReportExtractionService } from "@/server/services/board-report-extraction-service";

function valueFor(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const filingId = valueFor("filing-id");
  const orgNumber = valueFor("org-number");
  const yearValue = valueFor("year");
  const asJson = hasFlag("json");
  const persist = !hasFlag("no-persist");
  const publish = persist && hasFlag("publish");

  if (!filingId && !(orgNumber && yearValue)) {
    throw new Error(
      "Use --filing-id=<id> or both --org-number=<9 digits> and --year=<yyyy>.",
    );
  }
  if (filingId && (orgNumber || yearValue)) {
    throw new Error("Choose either --filing-id or --org-number/--year, not both.");
  }

  const service = new BoardReportExtractionService();
  const outcome = filingId
    ? await service.extractForFiling(filingId, { persist, publish })
    : await service.extractForCompanyYear(orgNumber!, Number(yearValue), { persist, publish });

  if (asJson) {
    process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
    return;
  }

  const { result } = outcome;
  process.stdout.write("Board report extraction\n");
  process.stdout.write(`Status: ${result.status}\n`);
  process.stdout.write(`Filing: ${result.filingId ?? "n/a"}\n`);
  process.stdout.write(`Organization/year: ${result.orgNumber ?? "n/a"}/${result.fiscalYear ?? "n/a"}\n`);
  process.stdout.write(`Route: ${result.route}\n`);
  process.stdout.write(`Pages: ${result.pageStart ?? "n/a"}-${result.pageEnd ?? "n/a"}\n`);
  process.stdout.write(`Confidence: ${(result.confidence * 100).toFixed(1)}%\n`);
  process.stdout.write(`Extraction ID: ${outcome.extractionId ?? "not persisted"}\n`);
  process.stdout.write(`Published: ${outcome.published ? "yes" : "no"}\n`);
  if (result.warnings.length > 0) {
    process.stdout.write("Warnings:\n");
    for (const warning of result.warnings) {
      process.stdout.write(`- ${warning.code}: ${warning.message}\n`);
    }
  }
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
