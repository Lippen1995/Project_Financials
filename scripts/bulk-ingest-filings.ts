/**
 * Bulk-ingests a diverse set of annual report filings to build a rich base
 * for reviewer activity and, downstream, training data.
 *
 * Why diversity matters: a model learns far more from 50 different kinds of
 * report (varied industries, sizes, scanned vs digital) than from 50 copies
 * of the same layout. This script deliberately spreads its selection across
 * industry codes rather than taking the first N companies it finds.
 *
 * For each selected company it:
 *   1. Discovers available annual report filings from Brreg.
 *   2. Processes every pending filing through the extraction pipeline.
 *
 * Filings that the pipeline cannot auto-publish land in the manual review
 * queue — which is exactly where reviewer corrections (and therefore
 * training labels) come from.
 *
 * Usage:
 *   npx tsx scripts/bulk-ingest-filings.ts                            (diverse sample, 50 companies)
 *   npx tsx scripts/bulk-ingest-filings.ts --limit 100              (100 companies)
 *   npx tsx scripts/bulk-ingest-filings.ts --per-industry 2         (max 2 per industry)
 *   npx tsx scripts/bulk-ingest-filings.ts 918298037 923609016      (explicit org numbers)
 *   npx tsx scripts/bulk-ingest-filings.ts 938701237 --max-filings 3 (at most 3 filings total)
 */
import "./_load-env";

import { prisma } from "@/lib/prisma";
import {
  discoverAnnualReportFilingsForCompany,
  processAnnualReportFiling,
} from "@/server/services/annual-report-financials-service";
import { BrregCompanyProvider } from "@/integrations/brreg/brreg-company-provider";
import { upsertCompanySnapshot } from "@/server/persistence/company-repository";
import {
  completeIngestionRun,
  createIngestionRun,
  updateIngestionRunProgress,
} from "@/server/services/ingestion-run-service";

const companyProvider = new BrregCompanyProvider();

/**
 * Ensures a company row exists for the given org number. When an explicit
 * org number is passed that the database has never seen, we fetch it from
 * Brreg's company registry and create it — otherwise filing discovery has
 * nothing to attach to. Returns false if Brreg has no such company.
 */
async function ensureCompanyExists(orgNumber: string): Promise<boolean> {
  const existing = await prisma.company.findUnique({
    where: { orgNumber },
    select: { id: true },
  });
  if (existing) return true;

  const company = await companyProvider.getCompany(orgNumber);
  if (!company) return false;
  await upsertCompanySnapshot(company);
  return true;
}

function parseIntArg(flag: string, fallback: number): number {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  const value = Number(process.argv[idx + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Selects a diverse set of org numbers from the Company table. Round-robins
 * across industry codes so the result spans many sectors rather than
 * clustering in whichever industry happens to have the most companies.
 */
async function selectDiverseOrgNumbers(input: {
  limit: number;
  perIndustry: number;
}): Promise<string[]> {
  const companies = await prisma.company.findMany({
    where: { status: "ACTIVE" },
    select: { orgNumber: true, industryCodeId: true, name: true },
    orderBy: { revenue: "desc" },
  });

  // Bucket by industry, capped at `perIndustry` each.
  const byIndustry = new Map<string, string[]>();
  for (const company of companies) {
    const key = company.industryCodeId ?? "UNKNOWN";
    const bucket = byIndustry.get(key) ?? [];
    if (bucket.length < input.perIndustry) {
      bucket.push(company.orgNumber);
      byIndustry.set(key, bucket);
    }
  }

  // Round-robin across buckets until we hit the limit.
  const buckets = [...byIndustry.values()];
  const selected: string[] = [];
  let cursor = 0;
  while (selected.length < input.limit && buckets.some((b) => b.length > 0)) {
    const bucket = buckets[cursor % buckets.length]!;
    const next = bucket.shift();
    if (next) selected.push(next);
    cursor++;
  }
  return selected;
}

async function main() {
  const explicitOrgNumbers = process.argv
    .slice(2)
    .filter((arg) => /^\d{9}$/.test(arg));

  const limit = parseIntArg("--limit", 50);
  const perIndustry = parseIntArg("--per-industry", 3);
  const maxFilings = parseIntArg("--max-filings", Infinity);

  const orgNumbers =
    explicitOrgNumbers.length > 0
      ? explicitOrgNumbers
      : await selectDiverseOrgNumbers({ limit, perIndustry });

  if (orgNumbers.length === 0) {
    console.log("No companies to ingest. Pass org numbers explicitly or seed the Company table first.");
    return;
  }

  console.log("=== Bulk filing ingest ===");
  console.log(`Companies selected: ${orgNumbers.length}`);
  console.log(
    explicitOrgNumbers.length > 0
      ? "Source: explicit org numbers from command line"
      : `Source: diverse sample (limit ${limit}, max ${perIndustry} per industry)`,
  );
  console.log("");

  // Record the run so the admin UI can show live progress even after this
  // terminal is closed.
  const run = await createIngestionRun({
    totalCompanies: orgNumbers.length,
    triggeredBy: "bulk-ingest-script",
  });
  console.log(`Ingestion run id: ${run.id}`);
  console.log("");

  let discoveredTotal = 0;
  let failedCompanies = 0;

  for (const [index, orgNumber] of orgNumbers.entries()) {
    try {
      const companyReady = await ensureCompanyExists(orgNumber);
      if (!companyReady) {
        failedCompanies++;
        console.warn(
          `[${index + 1}/${orgNumbers.length}] ${orgNumber}: not found in Brreg company registry — skipped`,
        );
        continue;
      }
      const result = await discoverAnnualReportFilingsForCompany(orgNumber);
      discoveredTotal += result.discoveredFilings;
      console.log(
        `[${index + 1}/${orgNumbers.length}] ${orgNumber} ${result.companyName}: ` +
          `${result.discoveredFilings} filing(s) discovered`,
      );
    } catch (error) {
      failedCompanies++;
      console.warn(
        `[${index + 1}/${orgNumbers.length}] ${orgNumber}: discovery failed — ` +
          `${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  console.log("");
  console.log(`Discovered ${discoveredTotal} filing(s) across ${orgNumbers.length} companies.`);
  console.log("Processing pending filings through the extraction pipeline…");
  console.log("");

  // Process filing by filing so the run's progress counter advances one
  // step at a time — a company with 14 filings must not look stuck at 0.
  const pendingFilings = await prisma.annualReportFiling.findMany({
    where: {
      company: { orgNumber: { in: orgNumbers } },
      status: { in: ["DISCOVERED", "DOWNLOADED", "PREFLIGHTED"] },
    },
    select: { id: true, fiscalYear: true, company: { select: { orgNumber: true } } },
    orderBy: [{ companyId: "asc" }, { fiscalYear: "desc" }],
    ...(Number.isFinite(maxFilings) ? { take: maxFilings } : {}),
  });

  // The progress bar targets the actual number of filings we will process.
  await updateIngestionRunProgress(run.id, { totalFilings: pendingFilings.length });

  let processedTotal = 0;
  let publishedTotal = 0;
  let reviewTotal = 0;
  let failedFilingsTotal = 0;

  for (const [index, filing] of pendingFilings.entries()) {
    let published = 0;
    let review = 0;
    let failed = 0;
    try {
      const result = await processAnnualReportFiling(filing.id);
      if ("published" in result && result.published) {
        published = 1;
      } else {
        review = 1;
      }
    } catch (error) {
      failed = 1;
      console.warn(
        `  filing ${filing.id} (${filing.fiscalYear}) failed — ` +
          `${error instanceof Error ? error.message : "unknown error"}`,
      );
    }

    processedTotal += 1;
    publishedTotal += published;
    reviewTotal += review;
    failedFilingsTotal += failed;

    // Advance the run counter after every filing so the admin widget moves.
    await updateIngestionRunProgress(run.id, {
      processedFilingsDelta: 1,
      publishedCountDelta: published,
      reviewCountDelta: review,
      failedCountDelta: failed,
    });
    console.log(
      `[${index + 1}/${pendingFilings.length}] ${filing.company.orgNumber} ${filing.fiscalYear}: ` +
        `${published ? "published" : review ? "review" : "failed"}`,
    );
  }

  await completeIngestionRun({
    runId: run.id,
    status: "COMPLETED",
    notes: `${processedTotal} filings — ${publishedTotal} published, ${reviewTotal} review, ${failedFilingsTotal} failed.`,
  });

  console.log("");
  console.log("=== Ingest complete ===");
  console.log(`Companies failed discovery: ${failedCompanies}`);
  console.log(`Filings processed:          ${processedTotal}`);
  console.log(`  auto-published:           ${publishedTotal}`);
  console.log(`  sent to manual review:    ${reviewTotal}`);
  console.log(`  failed:                   ${failedFilingsTotal}`);
  console.log("");
  console.log("Next: review the queue at /admin/annual-report-reviews — each");
  console.log("review you complete becomes training data for the in-house models.");
}

main()
  .catch((error) => {
    console.error("Bulk ingest failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
