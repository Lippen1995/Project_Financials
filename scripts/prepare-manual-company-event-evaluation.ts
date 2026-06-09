import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type Candidate = {
  id: string;
  companyId: string;
  companyName: string;
  organizationNumber: string;
  eventType: string;
  title: string;
  summary: string | null;
  eventDate: string | null;
  investorValueScore: number;
  confidenceScore: number;
  status: string;
  sources: Array<{
    sourceId: string;
    sourceName: string;
    title: string;
    summary: string | null;
    excerpt: string | null;
    url: string;
  }>;
  exposures: Array<{
    companyName: string;
    exposureType: string;
    exposureScore: number;
    rationale: string | null;
  }>;
};

function numericArg(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  const parsed = raw ? Number(raw.slice(prefix.length)) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function sourceFamily(candidate: Candidate) {
  return candidate.sources[0]?.sourceId ?? "unknown";
}

function selectCompanyCandidates(candidates: Candidate[], perCompany: number) {
  const sorted = [...candidates].sort(
    (left, right) =>
      right.investorValueScore - left.investorValueScore ||
      right.confidenceScore - left.confidenceScore,
  );
  const selected: Candidate[] = [];
  const usedTypes = new Set<string>();
  const usedSources = new Set<string>();

  const take = (predicate: (candidate: Candidate) => boolean) => {
    const candidate = sorted.find(
      (item) => !selected.includes(item) && predicate(item),
    );
    if (!candidate) return;
    selected.push(candidate);
    usedTypes.add(candidate.eventType);
    usedSources.add(sourceFamily(candidate));
  };

  take((candidate) => candidate.investorValueScore >= 65);
  take(
    (candidate) =>
      candidate.investorValueScore >= 40 &&
      candidate.investorValueScore < 65 &&
      !usedTypes.has(candidate.eventType),
  );
  take(
    (candidate) =>
      candidate.investorValueScore < 40 &&
      !usedTypes.has(candidate.eventType),
  );

  while (selected.length < perCompany) {
    const candidate =
      sorted.find(
        (item) =>
          !selected.includes(item) &&
          !usedTypes.has(item.eventType) &&
          !usedSources.has(sourceFamily(item)),
      ) ??
      sorted.find(
        (item) => !selected.includes(item) && !usedTypes.has(item.eventType),
      ) ??
      sorted.find((item) => !selected.includes(item));
    if (!candidate) break;
    selected.push(candidate);
    usedTypes.add(candidate.eventType);
    usedSources.add(sourceFamily(candidate));
  }

  return selected;
}

async function main() {
  const { prisma } = await import("@/lib/prisma");
  const companyLimit = Math.min(numericArg("companies", 20), 50);
  const perCompany = Math.min(numericArg("per-company", 5), 10);

  const events = await prisma.companyEvent.findMany({
    where: {
      status: "ACTIVE",
      eventType: { not: "low_signal_mention" },
      evidence: { some: {} },
    },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          orgNumber: true,
        },
      },
      evidence: {
        include: {
          document: {
            include: {
              source: {
                select: { id: true, name: true },
              },
            },
          },
        },
        orderBy: { relevanceScore: "desc" },
        take: 3,
      },
      exposures: {
        include: {
          company: { select: { name: true } },
        },
        orderBy: { exposureScore: "desc" },
        take: 3,
      },
      feedback: {
        where: { action: "rated" },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: [{ lastSeen: "desc" }, { investorValueScore: "desc" }],
    take: 10_000,
  });

  const candidates: Candidate[] = events
    .filter((event) => event.feedback.length === 0)
    .map((event) => ({
      id: event.id,
      companyId: event.companyId,
      companyName: event.company.name,
      organizationNumber: event.company.orgNumber,
      eventType: event.eventType,
      title: event.title,
      summary: event.summary,
      eventDate: event.eventDate?.toISOString() ?? null,
      investorValueScore: event.investorValueScore,
      confidenceScore: event.confidenceScore,
      status: event.status,
      sources: event.evidence.map((evidence) => ({
        sourceId: evidence.document.sourceId,
        sourceName: evidence.document.source.name,
        title: evidence.document.title,
        summary: evidence.document.summary,
        excerpt: evidence.excerpt,
        url: evidence.document.canonicalUrl,
      })),
      exposures: event.exposures.map((exposure) => ({
        companyName: exposure.company.name,
        exposureType: exposure.exposureType,
        exposureScore: exposure.exposureScore,
        rationale: exposure.rationale,
      })),
    }));

  const byCompany = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const current = byCompany.get(candidate.companyId) ?? [];
    current.push(candidate);
    byCompany.set(candidate.companyId, current);
  }

  const selectedCompanies = [...byCompany.entries()]
    .filter(([, companyEvents]) => companyEvents.length >= perCompany)
    .sort((left, right) => {
      const leftDiversity = new Set(left[1].map((event) => event.eventType)).size;
      const rightDiversity = new Set(right[1].map((event) => event.eventType)).size;
      return rightDiversity - leftDiversity || right[1].length - left[1].length;
    })
    .slice(0, companyLimit);

  const selected = selectedCompanies.flatMap(([, companyEvents]) =>
    selectCompanyCandidates(companyEvents, perCompany),
  );

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        requestedCompanies: companyLimit,
        requestedPerCompany: perCompany,
        eventPopulation: candidates.length,
        selectedCompanies: selectedCompanies.length,
        selectedEvents: selected.length,
        events: selected,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
