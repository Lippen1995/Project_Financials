/**
 * Ingest the operating companies (hovedenheter) behind mirrored underenheter into the
 * Company table, so store searches surface the operator name and the rest of the app
 * (financials, ownership, distress) can enrich them. Reads the distinct
 * RegistrySubunit.parentOrgNumber values, fetches each enhet from Brreg, and upserts via
 * the shared normalized company path.
 *
 * Scope it — resolving every operator in the full register is hundreds of thousands of
 * API calls. Filter by the subunit's NACE and/or name (a chain), or pass --all to force.
 *
 * Usage:
 *   npm run brreg:ingest-subunit-operators -- --nace=47.11          # grocery operators
 *   npm run brreg:ingest-subunit-operators -- --name="REMA 1000"     # one chain
 *   npm run brreg:ingest-subunit-operators -- --nace=47.11 --refresh # re-fetch existing too
 */
import { Prisma } from "@prisma/client";

import { BrregCompanyProvider } from "@/integrations/brreg/brreg-company-provider";
import { prisma } from "@/lib/prisma";
import { upsertCompanySnapshot } from "@/server/persistence/company-repository";

const provider = new BrregCompanyProvider();
const DEFAULT_CONCURRENCY = 6;
const MAX_UNFILTERED = 5000;

function parseArgs() {
  let nacePrefix: string | null = null;
  let name: string | null = null;
  let limit = Infinity;
  let concurrency = DEFAULT_CONCURRENCY;
  let refresh = false;
  let activeOnly = false;
  let all = false;
  for (const arg of process.argv.slice(2)) {
    const nace = arg.match(/^--nace=(.+)$/);
    if (nace) nacePrefix = nace[1];
    const nameArg = arg.match(/^--name=(.+)$/);
    if (nameArg) name = nameArg[1];
    const lim = arg.match(/^--limit=(\d+)$/);
    if (lim) limit = Number(lim[1]);
    const conc = arg.match(/^--concurrency=(\d+)$/);
    if (conc) concurrency = Math.max(1, Number(conc[1]));
    if (arg === "--refresh") refresh = true;
    if (arg === "--active-only") activeOnly = true;
    if (arg === "--all") all = true;
  }
  return { nacePrefix, name, limit, concurrency, refresh, activeOnly, all };
}

async function collectOperatorOrgNumbers(opts: {
  nacePrefix: string | null;
  name: string | null;
  activeOnly: boolean;
  refresh: boolean;
}): Promise<string[]> {
  const filters: Prisma.Sql[] = [Prisma.sql`s."parentOrgNumber" IS NOT NULL`];
  if (opts.nacePrefix) filters.push(Prisma.sql`s."naceCode" LIKE ${`${opts.nacePrefix}%`}`);
  if (opts.name) filters.push(Prisma.sql`s."name" ILIKE ${`%${opts.name}%`}`);
  if (opts.activeOnly) filters.push(Prisma.sql`s."status" = 'ACTIVE'`);
  if (!opts.refresh) {
    filters.push(
      Prisma.sql`NOT EXISTS (SELECT 1 FROM "Company" c WHERE c."orgNumber" = s."parentOrgNumber")`,
    );
  }

  const rows = await prisma.$queryRaw<Array<{ org: string }>>(Prisma.sql`
    SELECT DISTINCT s."parentOrgNumber" AS org
    FROM "RegistrySubunit" s
    WHERE ${Prisma.join(filters, " AND ")}
    ORDER BY s."parentOrgNumber"
  `);
  return rows.map((row) => row.org);
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<{ ok: number; failed: number }> {
  let next = 0;
  let ok = 0;
  let failed = 0;
  const total = items.length;

  async function loop() {
    while (next < items.length) {
      const item = items[next++];
      try {
        await worker(item);
        ok += 1;
      } catch {
        failed += 1;
      }
      if ((ok + failed) % 25 === 0 || ok + failed === total) {
        process.stdout.write(`\r  processed ${ok + failed}/${total} (ok ${ok}, failed ${failed})`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, loop));
  return { ok, failed };
}

async function main() {
  const opts = parseArgs();
  const startedAt = Date.now();

  if (!opts.nacePrefix && !opts.name && !opts.all) {
    console.error(
      "Refusing to resolve every operator in the register. Narrow with --nace=… or --name=…, or pass --all to override.",
    );
    process.exitCode = 1;
    return;
  }

  console.log("Collecting distinct operator org numbers…");
  let operators = await collectOperatorOrgNumbers(opts);
  if (Number.isFinite(opts.limit)) operators = operators.slice(0, opts.limit);

  console.log(`Operators to ingest: ${operators.length}${opts.refresh ? " (including existing)" : " (missing from Company)"}`);
  if (operators.length === 0) {
    console.log("Nothing to do.");
    return;
  }
  if (!opts.nacePrefix && !opts.name && operators.length > MAX_UNFILTERED && !opts.all) {
    console.error(`${operators.length} operators exceeds the ${MAX_UNFILTERED} safety cap. Narrow the filter or pass --all.`);
    process.exitCode = 1;
    return;
  }

  const { ok, failed } = await runPool(operators, opts.concurrency, async (orgNumber) => {
    const company = await provider.getCompany(orgNumber);
    if (!company) throw new Error(`no enhet for ${orgNumber}`);
    await upsertCompanySnapshot(company);
  });

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  process.stdout.write("\n");
  console.log(`Done: upserted ${ok} operators (${failed} failed) in ${seconds}s`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
