/**
 * Curated metric aliases learned from the NORGESGRUPPEN FY2024 fasit (a large
 * IFRS konsern — the first published group with lease accounting, provisions,
 * and an income-statement appropriation section). The raw fasit bootstrap
 * (bootstrap-metric-aliases-from-fasit.ts) surfaces these but mixed with
 * same-label-multiple-key conflicts and one outright error
 * ("Andre immaterielle eiendeler" -> other_tangible_assets), so they are added
 * here by hand instead of applied wholesale. Each label below is unique to its
 * key (no conflict with the NGAAP aliases CANICA/PROFF rely on) and carries the
 * correct statementFamily.
 *
 * Idempotent; safe to re-run. Usage: npx tsx scripts/add-ng-fasit-aliases.ts
 */
import "./_load-env";

import { prisma } from "@/lib/prisma";
import { normalizeNorwegianText } from "@/lib/norwegian-text";

type Family = "INCOME_STATEMENT" | "BALANCE_SHEET";

const ALIASES: Array<{ metricKey: string; alias: string; family: Family }> = [
  // Income-statement appropriation section ("Overføringer og disponeringer").
  { metricKey: "ordinary_dividends", alias: "Ordinært utbytte", family: "INCOME_STATEMENT" },
  { metricKey: "transfer_to_equity", alias: "Sum overføringer og disponeringer", family: "INCOME_STATEMENT" },
  { metricKey: "other_transfers_to_equity", alias: "Overføringer til/fra annen egenkapital", family: "INCOME_STATEMENT" },
  // IFRS balance-sheet lines (leases, investment property, treasury shares,
  // commercial paper, inventory total) — generalise to every IFRS group.
  { metricKey: "right_of_uf_use_assets", alias: "Rett til bruk eiendel", family: "BALANCE_SHEET" },
  { metricKey: "long_term_lease_liabilities", alias: "Langsiktige leieforpliktelser", family: "BALANCE_SHEET" },
  { metricKey: "short_term_lease_liabilities", alias: "Kortsiktige leieforpliktelser", family: "BALANCE_SHEET" },
  { metricKey: "treasury_shares", alias: "Beholdning av egne aksjer", family: "BALANCE_SHEET" },
  { metricKey: "short_term_debt_credit_institutions", alias: "Sertifikatlån", family: "BALANCE_SHEET" },
  { metricKey: "total_inventory", alias: "Sum varer", family: "BALANCE_SHEET" },
  { metricKey: "property_plant_and_equipment", alias: "Investeringseiendom", family: "BALANCE_SHEET" },
];

async function main() {
  const existing = await prisma.metricAlias.findMany({
    select: { metricKey: true, normalizedAlias: true },
  });
  const have = new Set(existing.map((e) => `${e.metricKey}::${e.normalizedAlias}`));

  const toInsert = ALIASES.filter(
    (a) => !have.has(`${a.metricKey}::${normalizeNorwegianText(a.alias)}`),
  );

  console.log(`${ALIASES.length} curated aliases; ${toInsert.length} new to insert.`);
  for (const a of toInsert) console.log(`  ${a.metricKey} <- «${a.alias}» [${a.family}]`);

  if (toInsert.length > 0) {
    const res = await prisma.metricAlias.createMany({
      data: toInsert.map((a) => ({
        metricKey: a.metricKey,
        alias: a.alias,
        normalizedAlias: normalizeNorwegianText(a.alias),
        statementFamily: a.family,
        isActive: true,
      })),
      skipDuplicates: true,
    });
    console.log(`Inserted ${res.count} aliases.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
