import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { buildCompanyEventStoryKey } from "@/server/news/company-event-feed-ranking";
import { eventInvestorValueCap } from "@/server/news/company-event-scoring";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nestedNumber(value: unknown, path: string[]) {
  let cursor = value;
  for (const part of path) cursor = asObject(cursor)[part];
  return typeof cursor === "number" && Number.isFinite(cursor) ? cursor : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("@/lib/prisma");
  const events = await prisma.companyEvent.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      companyId: true,
      eventType: true,
      title: true,
      eventDate: true,
      lastSeen: true,
      investorValueScore: true,
      confidenceScore: true,
      metadata: true,
    },
  });

  let capped = 0;
  let routine = 0;
  for (const event of events) {
    const policy = eventInvestorValueCap(event);
    const investorValueScore = Math.min(event.investorValueScore, policy.valueCap);
    const entityConfidence =
      nestedNumber(event.metadata, ["scoreComponents", "entityConfidence"]) ??
      event.confidenceScore;
    if (investorValueScore < event.investorValueScore) capped += 1;
    if (policy.routineDisclosure) routine += 1;
    if (!apply) continue;

    await prisma.companyEvent.update({
      where: { id: event.id },
      data: {
        relevanceScore: Math.min(100, Math.max(0, entityConfidence * 100)),
        investorValueScore,
        routineDisclosure: policy.routineDisclosure,
        storyKey: buildCompanyEventStoryKey({
          companyId: event.companyId,
          eventType: event.eventType,
          title: event.title,
          eventDate: event.eventDate ?? event.lastSeen,
        }),
      },
    });
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    events: events.length,
    capped,
    routine,
  }, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
