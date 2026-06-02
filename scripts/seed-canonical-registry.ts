/**
 * One-shot seed: populates the CanonicalKey registry from the built-in code
 * skeleton (canonicalMetricLayout + requiredPublishMetricKeys). Idempotent —
 * skips entirely if any row already exists, so re-running is a no-op.
 *
 * Run with:
 *   npx tsx scripts/seed-canonical-registry.ts
 */
import "./_load-env";

import { prisma } from "@/lib/prisma";
import { seedCanonicalRegistry } from "@/server/services/canonical-registry-service";

async function main() {
  const inserted = await seedCanonicalRegistry();
  if (inserted === 0) {
    const existing = await prisma.canonicalKey.count();
    console.log(`CanonicalKey already has ${existing} rows — skipping seed.`);
    return;
  }
  console.log(`Seeded ${inserted} canonical keys into the registry.`);
}

main()
  .catch((error) => {
    console.error("Failed to seed canonical registry:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
