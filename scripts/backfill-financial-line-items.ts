/**
 * Projects stored structured Brreg statements into the FinancialLineItem
 * substrate that metric mapping reads.
 *
 * Idempotent — rerunning replaces each statement's rows rather than
 * duplicating, so it is safe to run after any ingestion batch.
 *
 *   npm run financials:backfill-line-items
 *   npm run financials:backfill-line-items -- --limit 500
 *   npm run financials:backfill-line-items -- --coverage-only
 */
import "@/lib/env";

import { prisma } from "@/lib/prisma";
import {
  backfillStructuredLineItems,
  getLineItemCoverage,
} from "@/server/services/financial-line-item-service";

function parseArgs(argv: string[]) {
  const limitIndex = argv.indexOf("--limit");
  const limit =
    limitIndex >= 0 && argv[limitIndex + 1] ? Number(argv[limitIndex + 1]) : undefined;

  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error("--limit må være et positivt heltall.");
  }

  return { limit, coverageOnly: argv.includes("--coverage-only") };
}

function logCoverage(label: string, coverage: Awaited<ReturnType<typeof getLineItemCoverage>>) {
  console.log(
    `${label}: ${coverage.total} linjeposter · ${coverage.mapped} mappet · ` +
      `${coverage.unmapped} umappet · ${coverage.distinctMetricKeys} distinkte nøkler · ` +
      `${coverage.distinctUnmappedLabels} umappede kildelabels`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  logCoverage("Før", await getLineItemCoverage());
  if (args.coverageOnly) return;

  const startedAt = Date.now();
  const result = await backfillStructuredLineItems({ limit: args.limit });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(
    `Behandlet ${result.statementsScanned} regnskap på ${seconds}s: ` +
      `${result.statementsWithItems} ga linjeposter, ${result.lineItemsWritten} rader skrevet.`,
  );

  if (result.unknownKeys.length > 0) {
    console.log(
      `Nøkler uten oppføring i det kanoniske registeret (${result.unknownKeys.length}): ` +
        result.unknownKeys.join(", "),
    );
    console.log(
      "Disse er lagret, men klassifiseringen av oppstilling er en antakelse. Legg dem i registeret via /admin/metric-mapping.",
    );
  }

  logCoverage("Etter", await getLineItemCoverage());
}

main()
  .catch((error) => {
    console.error("Backfill feilet:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
