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
 *   npx tsx scripts/bulk-ingest-filings.ts                       (diverse sample, 50 companies)
 *   npx tsx scripts/bulk-ingest-filings.ts --limit 100           (100 companies)
 *   npx tsx scripts/bulk-ingest-filings.ts --per-industry 2      (max 2 per industry)
 *   npx tsx scripts/bulk-ingest-filings.ts 918298037 923609016   (explicit org numbers)
 */
import { prisma } from "@/lib/prisma";
import {
  discoverAnnualReportFilingsForCompany,
  processPendingAnnualReportFilings,
} from "@/server/services/annual-report-financials-service";

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

  let discoveredTotal = 0;
  let failedCompanies = 0;

  for (const [index, orgNumber] of orgNumbers.entries()) {
    try {
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

  const processed = await processPendingAnnualReportFilings({ orgNumbers });

  const published = processed.filter((p) => "published" in p && p.published).length;
  const review = processed.length - published;

  console.log("");
  console.log("=== Ingest complete ===");
  console.log(`Companies failed discovery: ${failedCompanies}`);
  console.log(`Filings processed:          ${processed.length}`);
  console.log(`  auto-published:           ${published}`);
  console.log(`  sent to manual review:    ${review}`);
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
