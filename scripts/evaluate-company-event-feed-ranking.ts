import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const DAY_MS = 86_400_000;

function numericArg(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  const parsed = raw ? Number(raw.slice(prefix.length)) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const [{ prisma }, ranking] = await Promise.all([
    import("@/lib/prisma"),
    import("@/server/news/company-event-feed-ranking"),
  ]);
  const limit = Math.min(numericArg("limit", 30), 200);
  const now = new Date();

  const events = await prisma.companyEvent.findMany({
    where: {
      status: "ACTIVE",
      eventType: { not: "low_signal_mention" },
      evidence: { some: { document: { sourceId: "oslobors" } } },
    },
    include: {
      company: {
        select: { name: true },
      },
    },
    take: 5_000,
  });

  const selectDiverse = (sorted: typeof events) => {
    const selected: typeof events = [];
    const companyCounts = new Map<string, number>();

    for (const event of sorted) {
      if (selected.some((candidate) => ranking.areSameInvestorStory(candidate, event))) continue;
      const companyCount = companyCounts.get(event.companyId) ?? 0;
      if (companyCount >= 2) continue;
      companyCounts.set(event.companyId, companyCount + 1);
      selected.push(event);
      if (selected.length >= limit) break;
    }

    return selected;
  };

  const staticTop = selectDiverse(
    [...events].sort(
      (left, right) =>
        right.investorValueScore - left.investorValueScore ||
        right.lastSeen.getTime() - left.lastSeen.getTime(),
    ),
  );
  const rankedTop = selectDiverse(
    [...events].sort(
      (left, right) =>
        ranking.computeCompanyEventFeedRank(right, now) -
          ranking.computeCompanyEventFeedRank(left, now) ||
        right.lastSeen.getTime() - left.lastSeen.getTime(),
    ),
  );

  const summarize = (items: typeof events) => {
    const stages = items.reduce<Record<string, number>>((counts, event) => {
      const stage = ranking.classifyCompanyEventStage(event);
      counts[stage] = (counts[stage] ?? 0) + 1;
      return counts;
    }, {});
    const eventTypes = items.reduce<Record<string, number>>((counts, event) => {
      counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
      return counts;
    }, {});

    return {
      companies: new Set(items.map((event) => event.companyId)).size,
      medianAgeDays: Number(
        median(
          items.map(
            (event) =>
              Math.max(0, now.getTime() - ranking.companyEventEffectiveDate(event).getTime()) /
              DAY_MS,
          ),
        ).toFixed(1),
      ),
      stages,
      eventTypes: Object.fromEntries(
        Object.entries(eventTypes).sort((left, right) => right[1] - left[1]),
      ),
      items: items.map((event) => ({
        rank: Number(ranking.computeCompanyEventFeedRank(event, now).toFixed(3)),
        investorValueScore: Math.round(event.investorValueScore),
        stage: ranking.classifyCompanyEventStage(event),
        eventType: event.eventType,
        company: event.company.name,
        title: event.title,
      })),
    };
  };

  console.log(JSON.stringify({
    generatedAt: now.toISOString(),
    eventPopulation: events.length,
    limit,
    staticRanking: summarize(staticTop),
    feedRanking: summarize(rankedTop),
  }, null, 2));

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
