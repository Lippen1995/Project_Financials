/**
 * Flags published CANICA 2024 line items whose stored value is implausible
 * relative to its statement page — the signature of an extraction/publish
 * corruption (truncation to leading digit-groups, or multi-number fusion).
 *
 * Heuristic, per (scope,page) statement block:
 *   - TRUNCATED: value has <= 6 digits while the page median value has >= 9
 *     digits (a billion-NOK statement with a 4-digit line item is corrupt).
 *   - FUSED: value > 1e12 (>1000 billion NOK — implausible for any single line).
 * Zero values are reported separately (could be legitimate).
 */
import { prisma } from "@/lib/prisma";

const ORG = "938701237";

function digits(v: bigint): number {
  return v < 0n ? (-v).toString().length : v.toString().length;
}

async function main() {
  const company = await prisma.company.findFirstOrThrow({ where: { orgNumber: ORG }, select: { id: true } });
  const rows = await prisma.publishedFinancialLineItem.findMany({
    where: { companyId: company.id, fiscalYear: 2024 },
    orderBy: [{ statementScope: "asc" }, { sourcePage: "asc" }, { sortOrder: "asc" }],
    select: { statementScope: true, metricKey: true, rawLabel: true, value: true, sourcePage: true },
  });

  const byBlock = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.statementScope}|${r.sourcePage ?? "?"}`;
    (byBlock.get(k) ?? byBlock.set(k, []).get(k)!).push(r);
  }

  let truncated = 0, fused = 0, total = 0, zeros = 0;
  for (const [block, blockRows] of byBlock) {
    const nonZero = blockRows.filter((r) => r.value !== null && r.value !== 0n);
    const medDigits = (() => {
      const ds = nonZero.map((r) => digits(r.value!)).sort((a, b) => a - b);
      return ds.length ? ds[Math.floor(ds.length / 2)]! : 0;
    })();
    const suspects = blockRows.filter((r) => {
      if (r.value === null) return false;
      total++;
      if (r.value === 0n) { zeros++; return false; }
      const d = digits(r.value);
      if (d <= 6 && medDigits >= 9) { truncated++; return true; }
      if (r.value > 1_000_000_000_000n) { fused++; return true; }
      return false;
    });
    if (suspects.length) {
      console.log(`\n── ${block}  (page-median ${medDigits} digits) ──`);
      for (const s of suspects) {
        const kind = s.value! > 1_000_000_000_000n ? "FUSED   " : "TRUNC   ";
        console.log(`   ${kind} ${String(s.value).padStart(15)}  ${(s.metricKey ?? "(unmapped)").padEnd(32)} «${s.rawLabel ?? ""}»`);
      }
    }
  }
  console.log(`\n=== ${truncated + fused} suspect of ${total} non-null values  (truncated ${truncated}, fused ${fused}, plus ${zeros} zero-valued) ===`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
