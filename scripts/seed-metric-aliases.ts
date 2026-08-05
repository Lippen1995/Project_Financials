/**
 * One-shot seed: populates the editable MetricAlias table from the built-in
 * defaultMetricDefinitions. Skips insertion entirely if the table already has
 * rows, so it is safe to run more than once.
 *
 * Run with:
 *   npx tsx scripts/seed-metric-aliases.ts
 */
import "./_load-env";

import { prisma } from "@/lib/prisma";
import { normalizeNorwegianText } from "@/lib/norwegian-text";
import { defaultMetricDefinitions } from "@/server/financials/canonical-taxonomy";

async function main() {
  const existing = await prisma.metricAlias.count();
  if (existing > 0) {
    console.log(`MetricAlias already has ${existing} rows — skipping seed.`);
    return;
  }

  const rows = defaultMetricDefinitions.flatMap((definition) =>
    definition.aliases.map((alias) => ({
      metricKey: definition.key,
      alias,
      normalizedAlias: normalizeNorwegianText(alias),
      statementFamily: definition.statementFamily,
      liabilitySection: definition.liabilitySection ?? null,
    })),
  );

  const result = await prisma.metricAlias.createMany({
    data: rows,
    skipDuplicates: true,
  });

  console.log(
    `Seeded ${result.count} metric aliases across ${defaultMetricDefinitions.length} canonical keys.`,
  );
}

main()
  .catch((error) => {
    console.error("Failed to seed metric aliases:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
