/**
 * Idempotent MetricAlias quality migration. Two systematic defects in the
 * bootstrapped registry capped canonical recall badly:
 *
 *  1. Wrong statementFamily. The fasit-bootstrap copied each alias's family from
 *     the published row's statementType, but many balance-sheet items were
 *     published as INCOME_STATEMENT. findCanonicalMetricKey filters by family, so
 *     those balance aliases (other_equity, property_plant_and_equipment,
 *     receivables_from_group_companies, marketable_securities, …) were
 *     unreachable on balance pages and the rows were dropped entirely. We retag
 *     each alias to the family implied by its KEY (code definition first, else a
 *     name-based classifier), never trusting the per-row statementType.
 *
 *  2. "Sum X" total lines claimed by the detail key. financial_income carried
 *     the alias "sum finansinntekter" (and financial_expense "sum finanskostnader"),
 *     tying total_financial_income/_expense's alias by length and winning the tie
 *     by order — so the total line mapped to the detail key. Those aliases belong
 *     only to the total key. Also drops retained_earnings ← "annen egenkapital"
 *     ("Annen egenkapital" is other_equity; retained_earnings is "Opptjent
 *     egenkapital").
 *
 * DRY RUN by default; pass --apply to write. Safe to re-run.
 * Usage: npx tsx scripts/fix-alias-quality.ts [--apply]
 */
import "./_load-env";

import { prisma } from "@/lib/prisma";
import {
  defaultMetricDefinitions,
  type MetricDefinition,
} from "@/integrations/brreg/annual-report-financials/taxonomy";

const APPLY = process.argv.includes("--apply");

const codeFamily = new Map<string, MetricDefinition["statementFamily"]>(
  defaultMetricDefinitions.map((definition) => [definition.key, definition.statementFamily]),
);

const BALANCE_RE =
  /(retained|software|asset|equity|liabilit|cash|receivable|payable|inventory|capital|debt|goodwill|securit|investment|propert|equipment|provision|reserve|premium|bond|deposit|share|fordring|eiendel|gjeld|egenkapital)/;
const INCOME_RE =
  /(revenue|_income|expense|profit|_cost|operating|payroll|depreciat|amortiz|ebit|financial_items|interest|tax_expense|inntekt|kostnad|resultat)/;

// Keys the name-regexes misclassify: net_income_to_common_shareholders is an
// income-statement line ("Årsresultat etter minoritetsinteresser") but matches
// the balance regex via "share(holders)".
const FAMILY_OVERRIDES: Record<string, "INCOME_STATEMENT" | "BALANCE_SHEET"> = {
  net_income_to_common_shareholders: "INCOME_STATEMENT",
  // Appropriation lines (disponeringer) print at the bottom of the INCOME
  // statement even though the name-regex reads them as equity/balance terms.
  transfer_to_equity: "INCOME_STATEMENT",
  other_transfers_to_equity: "INCOME_STATEMENT",
  ordinary_dividends: "INCOME_STATEMENT",
};

function truthFamily(key: string): "INCOME_STATEMENT" | "BALANCE_SHEET" | "NOTE" | null {
  const override = FAMILY_OVERRIDES[key];
  if (override) return override;
  const code = codeFamily.get(key);
  if (code) return code;
  if (BALANCE_RE.test(key)) return "BALANCE_SHEET";
  if (INCOME_RE.test(key)) return "INCOME_STATEMENT";
  return null;
}

// (metricKey, normalizedAlias) pairs to deactivate — aliases that belong to a
// different (usually total/other) key.
const BAD_ALIASES: Array<{ metricKey: string; normalizedAlias: string }> = [
  { metricKey: "financial_income", normalizedAlias: "sum finansinntekter" },
  { metricKey: "financial_expense", normalizedAlias: "sum finanskostnader" },
  { metricKey: "retained_earnings", normalizedAlias: "annen egenkapital" },
];

async function main() {
  // 1. Family retag.
  const rows = await prisma.metricAlias.findMany({
    where: { isActive: true },
    select: { id: true, metricKey: true, statementFamily: true },
  });
  const familyFixes = rows.flatMap((row) => {
    const truth = truthFamily(row.metricKey);
    if (!truth || row.statementFamily === truth || row.statementFamily === "NOTE") return [];
    return [{ id: row.id, key: row.metricKey, from: row.statementFamily, to: truth }];
  });

  // 2. Bad-alias deactivation.
  const badRows = await prisma.metricAlias.findMany({
    where: { isActive: true, OR: BAD_ALIASES },
    select: { id: true, metricKey: true, alias: true },
  });

  console.log(`${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Family retag: ${familyFixes.length} rows`);
  const byTransition = new Map<string, number>();
  for (const fix of familyFixes) {
    const k = `${fix.key}: ${fix.from} -> ${fix.to}`;
    byTransition.set(k, (byTransition.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...byTransition].sort()) console.log(`  x${n} ${k}`);
  console.log(`Deactivate bad aliases: ${badRows.length} rows`);
  for (const r of badRows) console.log(`  ${r.metricKey} «${r.alias}»`);

  if (APPLY) {
    for (const fix of familyFixes) {
      await prisma.metricAlias.update({
        where: { id: fix.id },
        data: { statementFamily: fix.to },
      });
    }
    if (badRows.length > 0) {
      await prisma.metricAlias.updateMany({
        where: { id: { in: badRows.map((r) => r.id) } },
        data: { isActive: false },
      });
    }
    console.log(`\nApplied ${familyFixes.length} family retags, deactivated ${badRows.length} bad aliases.`);
  } else {
    console.log("\n(dry run — re-run with --apply)");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
