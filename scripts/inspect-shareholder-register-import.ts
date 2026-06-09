import "./_load-env";

import { prisma } from "@/lib/prisma";

async function main() {
  const imports = await prisma.shareholderRegisterImport.findMany({
    orderBy: { taxYear: "asc" },
    select: {
      taxYear: true,
      status: true,
      importedRowCount: true,
      skippedRowCount: true,
      fileSizeBytes: true,
      completedAt: true,
    },
  });

  const totals = imports.reduce(
    (acc, item) => ({
      importedRows: acc.importedRows + item.importedRowCount,
      skippedRows: acc.skippedRows + item.skippedRowCount,
      fileSizeBytes: acc.fileSizeBytes + (item.fileSizeBytes ?? BigInt(0)),
    }),
    { importedRows: 0, skippedRows: 0, fileSizeBytes: BigInt(0) },
  );

  const latestIssuerProbe = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM "ShareholderRegisterHolding"
    WHERE "taxYear" = 2025 AND "issuerOrgNumber" = '910747711'
  `;
  const latestShareholderProbe = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM "ShareholderRegisterHolding"
    WHERE "taxYear" = 2025 AND "shareholderOrgNumber" = '910747711'
  `;
  const size = await prisma.$queryRaw<
    Array<{ holding_total_size: string; holding_table_size: string }>
  >`
    SELECT
      pg_size_pretty(pg_total_relation_size('"ShareholderRegisterHolding"')) AS holding_total_size,
      pg_size_pretty(pg_relation_size('"ShareholderRegisterHolding"')) AS holding_table_size
  `;

  console.log(
    JSON.stringify(
      {
        imports,
        totals: {
          importedRows: totals.importedRows,
          skippedRows: totals.skippedRows,
          fileSizeBytes: totals.fileSizeBytes.toString(),
        },
        probes: {
          ownersOfOrkla2025: latestIssuerProbe[0]?.count?.toString() ?? "0",
          companiesOwnedByOrkla2025: latestShareholderProbe[0]?.count?.toString() ?? "0",
        },
        size: size[0] ?? null,
      },
      (_, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
