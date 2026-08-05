/**
 * Bootstrap the extraction metric registry (MetricAlias) from the published
 * fasit. Every PublishedFinancialLineItem is a reviewer-verified
 * (rawLabel -> metricKey) pair — i.e. supervised alias training data. The
 * extraction registry (loadMetricDefinitions -> MetricAlias) is far narrower
 * than the keys reviewers actually map to (CANICA: 31/69 keys absent), which
 * caps canonical recall regardless of OCR quality. This derives the missing
 * aliases so the machine can produce those keys.
 *
 * DRY RUN by default — prints what it WOULD insert. Pass `--apply` to write.
 * Usage: npx tsx scripts/bootstrap-metric-aliases-from-fasit.ts [--apply]
 */
import { prisma } from "@/lib/prisma";
import { normalizeNorwegianText } from "@/lib/norwegian-text";

const APPLY = process.argv.includes("--apply");

function statementFamilyOf(statementType: string): "INCOME_STATEMENT" | "BALANCE_SHEET" | "NOTE" | null {
  if (statementType === "INCOME_STATEMENT") return "INCOME_STATEMENT";
  if (statementType === "BALANCE_SHEET") return "BALANCE_SHEET";
  if (statementType === "NOTE") return "NOTE";
  return null; // CASH_FLOW etc. — no matching family in the extraction registry
}

/** Clean a fasit rawLabel into an alias: drop trailing note refs ("Sum varer 12,"
 *  -> "Sum varer") and dates, collapse whitespace. */
function cleanAlias(raw: string): string {
  return raw
    .replace(/\s+\d[\d.,]*\s*$/g, "") // trailing note number / date fragment
    .replace(/[.,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const facts = await prisma.publishedFinancialLineItem.findMany({
    where: { rawLabel: { not: null } },
    select: { metricKey: true, rawLabel: true, statementType: true },
  });

  // Candidate (metricKey, statementFamily, normalizedAlias) -> raw alias.
  type Cand = { metricKey: string; statementFamily: string; alias: string; normalizedAlias: string };
  const candByKey = new Map<string, Cand>();
  for (const f of facts) {
    if (!f.metricKey) continue;
    const family = statementFamilyOf(f.statementType);
    if (!family) continue;
    const alias = cleanAlias(f.rawLabel!);
    const normalizedAlias = normalizeNorwegianText(alias);
    if (normalizedAlias.length < 4) continue; // too short to be a safe alias
    if (/^\d/.test(normalizedAlias)) continue; // starts with a digit — noise
    const dedup = `${f.metricKey}::${family}::${normalizedAlias}`;
    if (!candByKey.has(dedup)) candByKey.set(dedup, { metricKey: f.metricKey, statementFamily: family, alias, normalizedAlias });
  }

  // Drop ones already present in MetricAlias.
  const existing = await prisma.metricAlias.findMany({ select: { metricKey: true, normalizedAlias: true, liabilitySection: true } });
  const existingSet = new Set(existing.map((e) => `${e.metricKey}::${e.normalizedAlias}::${e.liabilitySection ?? ""}`));
  const toInsert = [...candByKey.values()].filter(
    (c) => !existingSet.has(`${c.metricKey}::${c.normalizedAlias}::`),
  );

  const byMetric = new Map<string, Cand[]>();
  for (const c of toInsert) (byMetric.get(c.metricKey) ?? byMetric.set(c.metricKey, []).get(c.metricKey)!).push(c);

  console.log(`${APPLY ? "APPLYING" : "DRY RUN"} — ${toInsert.length} new aliases across ${byMetric.size} metricKeys (from ${facts.length} fasit facts)\n`);
  for (const [mk, cands] of [...byMetric].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${mk}: ${cands.map((c) => `«${c.alias}»`).join(", ")}`);
  }

  if (APPLY && toInsert.length > 0) {
    const res = await prisma.metricAlias.createMany({
      data: toInsert.map((c) => ({
        metricKey: c.metricKey,
        alias: c.alias,
        normalizedAlias: c.normalizedAlias,
        statementFamily: c.statementFamily,
        isActive: true,
      })),
      skipDuplicates: true,
    });
    console.log(`\nInserted ${res.count} MetricAlias rows.`);
  } else if (!APPLY) {
    console.log(`\n(dry run — re-run with --apply to insert)`);
  }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
