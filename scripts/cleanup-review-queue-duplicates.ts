/**
 * Cleans up duplicate review-queue rows created by reprocessing tests.
 *
 * Background: every time a filing is reprocessed, a new FinancialExtractionRun
 * is created, which in turn creates a new AnnualReportReview row. During the
 * ODL testing work many filings were reprocessed repeatedly, leaving the
 * review queue full of duplicate rows for the same company + fiscal year.
 * Those duplicates pollute both the queue UI and — more importantly — the
 * training data, because each review can emit training labels.
 *
 * SAFETY RULES (this script will never destroy real work):
 *   1. A review that a human has actually touched — it has at least one
 *      decision OR at least one reviewed fact — is NEVER deleted. Human
 *      effort is sacred.
 *   2. For each filing, the most recently updated review is kept as the
 *      "canonical" row even if untouched.
 *   3. Only untouched, non-canonical duplicates are eligible for deletion.
 *   4. DRY-RUN BY DEFAULT. Nothing is deleted unless you pass --apply.
 *
 * Usage:
 *   npx tsx scripts/cleanup-review-queue-duplicates.ts            (dry-run)
 *   npx tsx scripts/cleanup-review-queue-duplicates.ts --apply    (delete)
 */
import "./_load-env";

import { prisma } from "@/lib/prisma";

type ReviewRow = {
  id: string;
  filingId: string;
  companyId: string;
  fiscalYear: number;
  status: string;
  updatedAt: Date;
  decisionCount: number;
  reviewedFactCount: number;
};

async function main() {
  const apply = process.argv.includes("--apply");

  const reviews = await prisma.annualReportReview.findMany({
    select: {
      id: true,
      filingId: true,
      companyId: true,
      fiscalYear: true,
      status: true,
      updatedAt: true,
      _count: {
        select: { decisions: true, reviewedFacts: true },
      },
    },
  });

  const rows: ReviewRow[] = reviews.map((r) => ({
    id: r.id,
    filingId: r.filingId,
    companyId: r.companyId,
    fiscalYear: r.fiscalYear,
    status: r.status,
    updatedAt: r.updatedAt,
    decisionCount: r._count.decisions,
    reviewedFactCount: r._count.reviewedFacts,
  }));

  // Group by filing — duplicates are multiple reviews for the same filing.
  const byFiling = new Map<string, ReviewRow[]>();
  for (const row of rows) {
    const list = byFiling.get(row.filingId) ?? [];
    list.push(row);
    byFiling.set(row.filingId, list);
  }

  const deletable: ReviewRow[] = [];
  const protectedFromWork: ReviewRow[] = [];
  let groupsWithDuplicates = 0;

  for (const [, group] of byFiling) {
    if (group.length < 2) continue;
    groupsWithDuplicates++;

    // Sort newest-first so index 0 is the canonical keeper.
    group.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const canonical = group[0]!;

    for (const row of group) {
      const humanTouched = row.decisionCount > 0 || row.reviewedFactCount > 0;
      if (humanTouched) {
        protectedFromWork.push(row);
        continue;
      }
      if (row.id === canonical.id) {
        continue; // keep the canonical row
      }
      deletable.push(row);
    }
  }

  console.log("=== Review queue duplicate cleanup ===");
  console.log(`Total reviews:                ${rows.length}`);
  console.log(`Filings with duplicates:      ${groupsWithDuplicates}`);
  console.log(`Protected (human-touched):    ${protectedFromWork.length}`);
  console.log(`Deletable (untouched dupes):  ${deletable.length}`);
  console.log("");

  if (deletable.length === 0) {
    console.log("Nothing to clean up.");
    return;
  }

  // Show a compact preview grouped by company+year.
  const previewByKey = new Map<string, number>();
  for (const row of deletable) {
    const key = `${row.companyId} / ${row.fiscalYear}`;
    previewByKey.set(key, (previewByKey.get(key) ?? 0) + 1);
  }
  console.log("Deletable rows by company / fiscal year:");
  for (const [key, count] of [...previewByKey.entries()].sort()) {
    console.log(`  ${key}: ${count} duplicate(s)`);
  }
  console.log("");

  if (!apply) {
    console.log("DRY RUN — no rows deleted. Re-run with --apply to delete the rows above.");
    return;
  }

  const ids = deletable.map((r) => r.id);
  const result = await prisma.annualReportReview.deleteMany({
    where: { id: { in: ids } },
  });
  console.log(`Deleted ${result.count} duplicate review row(s).`);
}

main()
  .catch((error) => {
    console.error("Cleanup failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
