import { prisma } from "@/lib/prisma";
import { processAnnualReportFiling } from "@/server/services/annual-report-financials-service";

type CliOptions = {
  limit: number;
  fromYear: number | null;
  toYear: number | null;
  orgNumbers: string[];
  shardIndex: number;
  shardCount: number;
  delayMs: number;
};

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    limit: 25,
    fromYear: null,
    toYear: null,
    orgNumbers: [],
    shardIndex: 0,
    shardCount: 1,
    delayMs: 2000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--limit") options.limit = Number(argv[++index]);
    else if (arg === "--from-year") options.fromYear = Number(argv[++index]);
    else if (arg === "--to-year") options.toYear = Number(argv[++index]);
    else if (arg === "--org") options.orgNumbers.push(argv[++index]);
    else if (arg === "--delay-ms") options.delayMs = Number(argv[++index]);
    else if (arg === "--shard") {
      // Format: i/n — statisk partisjonering slik at flere workere kan kjøre parallelt uten overlapp.
      const [shardIndex, shardCount] = String(argv[++index]).split("/").map(Number);
      options.shardIndex = shardIndex;
      options.shardCount = shardCount;
    } else throw new Error(`Ukjent argument: ${arg}`);
  }
  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new Error("--limit må være et positivt tall");
  }
  if (
    !Number.isInteger(options.shardIndex) ||
    !Number.isInteger(options.shardCount) ||
    options.shardCount < 1 ||
    options.shardIndex < 0 ||
    options.shardIndex >= options.shardCount
  ) {
    throw new Error("--shard må være på formen i/n med 0 <= i < n");
  }
  return options;
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2));

  const candidates = await prisma.annualReportFiling.findMany({
    where: {
      status: { in: ["DISCOVERED", "DOWNLOADED", "PREFLIGHTED"] },
      ...(options.fromYear || options.toYear
        ? {
            fiscalYear: {
              ...(options.fromYear ? { gte: options.fromYear } : {}),
              ...(options.toYear ? { lte: options.toYear } : {}),
            },
          }
        : {}),
      ...(options.orgNumbers.length ? { company: { orgNumber: { in: options.orgNumbers } } } : {}),
    },
    // Newest fiscal years first: most valuable coverage in the app.
    orderBy: [{ fiscalYear: "desc" }, { discoveredAt: "asc" }],
    take: options.limit * options.shardCount,
    select: {
      id: true,
      fiscalYear: true,
      company: { select: { orgNumber: true, name: true } },
    },
  });

  const pending = candidates
    .filter((_, index) => index % options.shardCount === options.shardIndex)
    .slice(0, options.limit);

  console.log(
    `Batch: ${pending.length} filing(er) (limit ${options.limit}, shard ${options.shardIndex}/${options.shardCount}, nyeste år først)`,
  );

  const summary = { published: 0, review: 0, skipped: 0, failed: 0 };
  const failures: { orgNumber: string; fiscalYear: number; error: string }[] = [];

  for (const [index, filing] of pending.entries()) {
    const startedAt = Date.now();
    const label = `${filing.company.orgNumber} ${filing.company.name} ${filing.fiscalYear}`;
    try {
      const result = await processAnnualReportFiling(filing.id);
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      if ("skipped" in result && result.skipped) {
        summary.skipped += 1;
        console.log(`[${index + 1}/${pending.length}] ${label} → SKIPPED (${result.reason})`);
      } else if (result.published) {
        summary.published += 1;
        console.log(
          `[${index + 1}/${pending.length}] ${label} → PUBLISHED ` +
            `(confidence ${(result as { confidenceScore?: number }).confidenceScore?.toFixed?.(3) ?? "n/a"}, ${seconds}s)`,
        );
      } else {
        summary.review += 1;
        console.log(
          `[${index + 1}/${pending.length}] ${label} → REVIEW ` +
            `(confidence ${(result as { confidenceScore?: number }).confidenceScore?.toFixed?.(3) ?? "n/a"}, ${seconds}s)`,
        );
      }
    } catch (error) {
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      const message = error instanceof Error ? error.message : String(error);
      summary.failed += 1;
      failures.push({ orgNumber: filing.company.orgNumber, fiscalYear: filing.fiscalYear, error: message });
      console.log(`[${index + 1}/${pending.length}] ${label} → FAILED (${seconds}s): ${message}`);
    }
    if (options.delayMs > 0 && index < pending.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
  }

  console.log(JSON.stringify({ summary, failures }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
