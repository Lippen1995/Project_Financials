/**
 * Drains the structured Brreg financials queue.
 *
 * The app enqueues companies that have no financials in the database; this
 * worker is what actually calls Brønnøysundregistrene. Run it on a schedule.
 *
 *   npm run financials:drain-queue -- --limit 100
 *   npm run financials:drain-queue -- --depth-only
 */
import "@/lib/env";

import { prisma } from "@/lib/prisma";
import {
  drainStructuredFinancialsQueue,
  getStructuredFinancialsQueueDepth,
} from "@/server/services/structured-financials-queue-service";

function parseArgs(argv: string[]) {
  const limitIndex = argv.indexOf("--limit");
  const limit =
    limitIndex >= 0 && argv[limitIndex + 1] ? Number(argv[limitIndex + 1]) : 25;

  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) {
    throw new Error("--limit må være et heltall mellom 1 og 5000.");
  }

  return {
    limit,
    depthOnly: argv.includes("--depth-only"),
    withoutLease: argv.includes("--without-lease"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const before = await getStructuredFinancialsQueueDepth();
  console.log(
    `Kø: ${before.pending} i kø · ${before.dueForRefresh} klar for henting · ${before.errors} med feil · ${before.total} totalt`,
  );

  if (args.depthOnly) return;

  const result = await drainStructuredFinancialsQueue({
    limit: args.limit,
    withoutLease: args.withoutLease,
  });

  if (result.skipped) {
    console.log(`Hoppet over: ${result.skippedReason ?? "ukjent årsak"}`);
    return;
  }

  console.log(
    `Behandlet ${result.claimed} virksomheter på ${result.durationMs} ms: ` +
      `${result.available} med regnskap · ${result.unavailable} uten · ${result.failed} feilet`,
  );

  for (const company of result.companies) {
    const years = company.fiscalYears.length ? company.fiscalYears.join(", ") : "–";
    const error = company.errorCode ? ` (${company.errorCode})` : "";
    console.log(`  ${company.orgNumber}  ${company.status}${error}  år: ${years}`);
  }

  const after = await getStructuredFinancialsQueueDepth();
  console.log(
    `Kø etter: ${after.pending} i kø · ${after.dueForRefresh} klar for henting · ${after.errors} med feil`,
  );
}

main()
  .catch((error) => {
    console.error("Draining feilet:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
