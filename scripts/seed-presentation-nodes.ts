/**
 * One-shot seed: builds the initial presentation-node layer from the built-in
 * canonicalMetricLayout. One node per layout group (Driftsinntekter,
 * Driftskostnader, ...), with every canonical key assigned to its group's node.
 * Skips entirely if any nodes already exist, so re-running is a no-op.
 *
 * Run with:
 *   npx tsx scripts/seed-presentation-nodes.ts
 */
import "./_load-env";

import { prisma } from "@/lib/prisma";
import {
  canonicalMetricLayout,
  metricLayoutGroupLabels,
  type MetricLayoutGroup,
} from "@/server/financials/canonical-taxonomy";

async function main() {
  const existing = await prisma.presentationNode.count();
  if (existing > 0) {
    console.log(`PresentationNode already has ${existing} rows — skipping seed.`);
    return;
  }

  // Groups in first-appearance (statement) order.
  const groupOrder: MetricLayoutGroup[] = [];
  for (const entry of canonicalMetricLayout) {
    if (!groupOrder.includes(entry.group)) groupOrder.push(entry.group);
  }

  let created = 0;
  let assigned = 0;

  for (let i = 0; i < groupOrder.length; i++) {
    const group = groupOrder[i];
    const keys = canonicalMetricLayout.filter((e) => e.group === group);
    const family = keys[0]?.family ?? "INCOME_STATEMENT";

    const node = await prisma.presentationNode.create({
      data: {
        label: metricLayoutGroupLabels[group],
        kind: "LINE",
        positionX: family === "INCOME_STATEMENT" ? 360 : 760,
        positionY: i * 130,
      },
    });
    created += 1;

    await prisma.presentationNodeKey.createMany({
      data: keys.map((e) => ({ metricKey: e.key, nodeId: node.id })),
      skipDuplicates: true,
    });
    assigned += keys.length;
  }

  console.log(`Seeded ${created} presentation nodes and ${assigned} key assignments.`);
}

main()
  .catch((error) => {
    console.error("Failed to seed presentation nodes:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
