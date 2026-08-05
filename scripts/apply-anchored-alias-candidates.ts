/**
 * Applies the curated alias decisions for the anchored gold-set candidates
 * (output/ml-datasets/anchored-gold-set/alias-candidates.json, batch of
 * 2026-07-04). Candidates were value-verified by anchored partition folding;
 * curation decides canonical alias vs as_reported key per the NG lesson —
 * never apply a bootstrap wholesale.
 *
 * Dry run by default; --apply inserts. Idempotent (skips existing aliases).
 */
import { prisma } from "@/lib/prisma";
import { normalizeNorwegianText } from "@/lib/norwegian-text";

type Curated = {
  metricKey: string;
  statementFamily: "INCOME_STATEMENT" | "BALANCE_SHEET";
  aliases: string[];
};

const CURATED: Curated[] = [
  // OCR/wrapped-label variants of canonical concepts.
  {
    metricKey: "cash_and_cash_equivalents",
    statementFamily: "BALANCE_SHEET",
    // Wrapped "Bankinnskudd, kontanter og lignende" (documented PROFF case).
    aliases: ["og lignende bankinnskudd kontanter o"],
  },
  {
    metricKey: "payroll_expense",
    statementFamily: "INCOME_STATEMENT",
    aliases: ["lennskostnad"], // ø→e OCR garble
  },
  {
    metricKey: "trade_payables",
    statementFamily: "BALANCE_SHEET",
    aliases: ["leverandergjeld"], // ø→e OCR garble
  },
  // Appropriation section (disponeringer/overføringer) — transfer TO equity.
  {
    metricKey: "transfer_to_equity",
    statementFamily: "INCOME_STATEMENT",
    aliases: [
      "avsatt til annen egenkapital",
      "overforinger annen egenkapital",
      "overforinger til/fra annen egenkapital",
      "disponeringer avsatt til annen egenkapital",
      "overforinger avsatt til annen egenkapital",
      "disponeringer overforinger til/fra annen egenkapital",
      "annen egenkapital", // INCOME family only — never collides with the balance line
    ],
  },
  {
    metricKey: "other_transfers_to_equity",
    statementFamily: "INCOME_STATEMENT",
    aliases: ["overfort fra annen egenkapital", "disponeringer overfort fra annen egenkapital"],
  },
  // Genuine statutory lines without canonical keys → as_reported family.
  {
    metricKey: "as_reported_udekket_tap",
    statementFamily: "BALANCE_SHEET",
    aliases: ["udekket tap"],
  },
  {
    metricKey: "as_reported_driftslosore_inventar_verktoy_kontormaskiner",
    statementFamily: "BALANCE_SHEET",
    aliases: [
      "driftslosore inventar verktoy kontormaskiner ol",
      "driftslosore inventar verktoy kontormaskiner",
    ],
  },
  {
    metricKey: "as_reported_konserngjeld",
    statementFamily: "BALANCE_SHEET",
    aliases: ["konserngjeld"],
  },
  {
    metricKey: "as_reported_andre_finansielle_instrumenter",
    statementFamily: "BALANCE_SHEET",
    aliases: ["andre finansielle instrumenter"],
  },
  {
    metricKey: "as_reported_leieinntekt",
    statementFamily: "INCOME_STATEMENT",
    aliases: ["leieinntekt"],
  },
  {
    metricKey: "as_reported_overforinger_tilleggsutbytte",
    statementFamily: "INCOME_STATEMENT",
    aliases: ["overforinger tilleggsutbytte"],
  },
];

async function main() {
  const apply = process.argv.includes("--apply");
  let inserted = 0;
  let skipped = 0;

  for (const group of CURATED) {
    for (const alias of group.aliases) {
      const existing = await prisma.metricAlias.findFirst({
        where: { alias: { equals: alias, mode: "insensitive" } },
      });
      if (existing) {
        skipped += 1;
        console.log(`SKIP (finnes som ${existing.metricKey}): "${alias}"`);
        continue;
      }
      console.log(`${apply ? "INSERT" : "would insert"} ${group.metricKey} ← "${alias}"`);
      if (apply) {
        await prisma.metricAlias.create({
          data: {
            metricKey: group.metricKey,
            alias,
            normalizedAlias: normalizeNorwegianText(alias),
            statementFamily: group.statementFamily,
            isActive: true,
          },
        });
      }
      inserted += 1;
    }
  }

  console.log(JSON.stringify({ apply, inserted, skipped }, null, 2));
  if (!apply) console.log("(dry run — kjør med --apply for å skrive)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
