import { DdRoomStatus, WorkspaceStatus, WorkspaceType, WorkspaceWatchStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 8;
const PERSONAL_LOOKBACK_DAYS = 90;
const FALLBACK_LOOKBACK_DAYS = 45;
const MIN_PERSONAL_INVESTOR_VALUE = 45;
const MIN_FALLBACK_INVESTOR_VALUE = 55;
const MIN_INDIRECT_EXPOSURE_SCORE = 0.7;
const MAX_ITEMS_PER_COMPANY = 2;
const OBX_INDEX_URL = "https://live.euronext.com/en/markets/oslo/equities-by-index/obx";
const OBX_CACHE_MS = 12 * 60 * 60 * 1000;

const MACRO_EVENT_TYPES = new Set([
  "commodity_price_exposure",
  "interest_rate",
  "macro_news",
  "regulatory_change",
  "sector_news",
]);

export type InsightVisual =
  | {
      type: "image";
      imageUrl: string;
      imageAlt: string;
    }
  | {
      type: "textual";
      eyebrow: string | null;
      value: string;
    };

export type InsightItem = {
  id: string;
  title: string;
  summary: string | null;
  contextLabel: string | null;
  publishedAt: string;
  href: string;
  sourceLabel: string | null;
  companyLabel: string | null;
  visual: InsightVisual | null;
};

type CompanyPriority = {
  companyId: string;
  score: number;
};

type EvidenceInput = {
  document: {
    title: string;
    canonicalUrl: string;
    publishedAt: Date | null;
    metadata: unknown;
    source: {
      id: string;
      name: string;
    };
  };
};

type CandidateEvent = {
  id: string;
  companyId: string;
  eventType: string;
  title: string;
  summary: string | null;
  eventDate: Date | null;
  lastSeen: Date;
  investorValueScore: number;
  confidenceScore: number;
  company: {
    id: string;
    slug: string;
    name: string;
    industryCode: {
      title: string;
    } | null;
  };
  evidence: EvidenceInput[];
};

type InsightCandidate = {
  event: CandidateEvent;
  exposureScore: number;
  companyPriority: number;
  score: number;
};

let obxCache: { expiresAt: number; companyIds: string[] } | null = null;

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function decay(date: Date | null | undefined, halfLifeDays: number) {
  if (!date) return 0;
  const ageDays = Math.max(0, (Date.now() - date.getTime()) / 86_400_000);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(asa|as|plc|limited|ltd|holdings?|group|gruppen|bank)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseObxConstituentNames(html: string) {
  const names = new Set<string>();
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(html))) {
    const cells = Array.from(rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi))
      .map((match) => match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const isinIndex = cells.findIndex((cell) => /^[A-Z]{2}[A-Z0-9]{10}$/.test(cell));
    if (isinIndex > 0) {
      names.add(cells[isinIndex - 1]);
    }
  }

  return [...names];
}

async function fetchObxConstituentNames() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(OBX_INDEX_URL, {
      signal: controller.signal,
      headers: { accept: "text/html" },
      next: { revalidate: 43_200 },
    });
    if (!response.ok) return [];
    return parseObxConstituentNames(await response.text());
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function getObxCompanyIds() {
  if (obxCache && obxCache.expiresAt > Date.now()) {
    return obxCache.companyIds;
  }

  const constituentNames = await fetchObxConstituentNames();
  if (constituentNames.length === 0) {
    obxCache = { expiresAt: Date.now() + OBX_CACHE_MS, companyIds: [] };
    return [];
  }

  const recentEventCompanies = await prisma.company.findMany({
    where: {
      companyEvents: {
        some: {
          status: "ACTIVE",
          investorValueScore: { gte: MIN_FALLBACK_INVESTOR_VALUE },
          lastSeen: { gte: daysAgo(FALLBACK_LOOKBACK_DAYS) },
        },
      },
    },
    select: { id: true, name: true },
    take: 500,
  });

  const normalizedObxNames = constituentNames.map(normalizeName).filter(Boolean);
  const companyIds = recentEventCompanies
    .filter((company) => {
      const name = normalizeName(company.name);
      return normalizedObxNames.some((obxName) => name.includes(obxName) || obxName.includes(name));
    })
    .map((company) => company.id);

  obxCache = { expiresAt: Date.now() + OBX_CACHE_MS, companyIds };
  return companyIds;
}

async function getPersonalCompanyPriorities(userId: string): Promise<CompanyPriority[]> {
  const workspace = await prisma.workspace.findFirst({
    where: {
      personalOwnerId: userId,
      type: WorkspaceType.PERSONAL,
      status: WorkspaceStatus.ACTIVE,
    },
    select: {
      id: true,
      watches: {
        where: { status: WorkspaceWatchStatus.ACTIVE },
        select: {
          companyId: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      ddRooms: {
        where: { status: DdRoomStatus.ACTIVE },
        select: {
          primaryCompanyId: true,
          lastActivityAt: true,
        },
      },
    },
  });

  if (!workspace) return [];

  const priorities = new Map<string, number>();

  for (const watch of workspace.watches) {
    const recency = Math.max(decay(watch.updatedAt, 30), decay(watch.createdAt, 45));
    priorities.set(watch.companyId, Math.max(priorities.get(watch.companyId) ?? 0, 0.7 + recency * 0.05));
  }

  for (const room of workspace.ddRooms) {
    const recency = decay(room.lastActivityAt, 21);
    priorities.set(room.primaryCompanyId, Math.max(priorities.get(room.primaryCompanyId) ?? 0, 1 + recency * 0.15));
  }

  return [...priorities.entries()].map(([companyId, score]) => ({ companyId, score: Math.min(score, 1.2) }));
}

function evidenceDate(event: CandidateEvent) {
  return event.eventDate ?? event.evidence[0]?.document.publishedAt ?? event.lastSeen;
}

function firstEvidence(event: CandidateEvent) {
  return event.evidence[0]?.document ?? null;
}

function metadataObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function imageFromEvidence(event: CandidateEvent): InsightVisual | null {
  const document = firstEvidence(event);
  if (!document) return null;
  const metadata = metadataObject(document.metadata);
  const imageUrl = typeof metadata.imageUrl === "string" ? metadata.imageUrl : null;
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return null;
  return {
    type: "image",
    imageUrl,
    imageAlt: event.title,
  };
}

function textualVisual(event: CandidateEvent): InsightVisual {
  const document = firstEvidence(event);
  return {
    type: "textual",
    eyebrow: document?.source.name ?? event.company.industryCode?.title ?? null,
    value: event.company.name,
  };
}

function contextLabel(event: CandidateEvent) {
  if (event.company.name) return event.company.name;
  if (event.company.industryCode?.title) return event.company.industryCode.title;
  return firstEvidence(event)?.source.name ?? null;
}

function fallbackSummary(event: CandidateEvent) {
  const document = firstEvidence(event);
  if (event.summary) return event.summary;
  if (document?.title && document.title !== event.title) return document.title;
  return document?.source.name ? `Kilde: ${document.source.name}` : null;
}

function toInsightItem(candidate: InsightCandidate): InsightItem {
  const event = candidate.event;
  const document = firstEvidence(event);
  return {
    id: event.id,
    title: event.title,
    summary: fallbackSummary(event),
    contextLabel: contextLabel(event),
    publishedAt: evidenceDate(event).toISOString(),
    href: `/companies/${event.company.slug}?tab=nyheter`,
    sourceLabel: document?.source.name ?? null,
    companyLabel: event.company.name,
    visual: imageFromEvidence(event) ?? textualVisual(event),
  };
}

function scoreCandidate(event: CandidateEvent, exposureScore: number, companyPriority: number) {
  const investorValue = Math.min(event.investorValueScore / 100, 1);
  const confidence = Math.min(Math.max(event.confidenceScore, 0), 1);
  const freshness = decay(evidenceDate(event), 14);

  return (
    investorValue * 0.5 +
    Math.min(Math.max(exposureScore, 0), 1) * 0.2 +
    confidence * 0.1 +
    freshness * 0.1 +
    Math.min(companyPriority, 1.2) * 0.1
  );
}

function rankedUniqueItems(candidates: InsightCandidate[], limit: number) {
  const seenEvents = new Set<string>();
  const companyCounts = new Map<string, number>();
  const items: InsightItem[] = [];

  for (const candidate of [...candidates].sort((left, right) => right.score - left.score)) {
    if (seenEvents.has(candidate.event.id)) continue;
    const companyCount = companyCounts.get(candidate.event.companyId) ?? 0;
    if (companyCount >= MAX_ITEMS_PER_COMPANY) continue;

    seenEvents.add(candidate.event.id);
    companyCounts.set(candidate.event.companyId, companyCount + 1);
    items.push(toInsightItem(candidate));

    if (items.length >= limit) break;
  }

  return items;
}

const eventInclude = {
  company: {
    select: {
      id: true,
      slug: true,
      name: true,
      industryCode: {
        select: { title: true },
      },
    },
  },
  evidence: {
    include: {
      document: {
        include: {
          source: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: { relevanceScore: "desc" as const },
    take: 1,
  },
};

async function getPersonalCandidates(priorities: CompanyPriority[], limit: number): Promise<InsightCandidate[]> {
  if (priorities.length === 0) return [];
  const priorityByCompany = new Map(priorities.map((priority) => [priority.companyId, priority.score]));
  const companyIds = priorities.map((priority) => priority.companyId);

  const [directEvents, exposureRows] = await Promise.all([
    prisma.companyEvent.findMany({
      where: {
        companyId: { in: companyIds },
        status: "ACTIVE",
        investorValueScore: { gte: MIN_PERSONAL_INVESTOR_VALUE },
        lastSeen: { gte: daysAgo(PERSONAL_LOOKBACK_DAYS) },
      },
      include: eventInclude,
      orderBy: [{ investorValueScore: "desc" }, { lastSeen: "desc" }],
      take: limit * 3,
    }),
    prisma.companyEventExposure.findMany({
      where: {
        companyId: { in: companyIds },
        exposureScore: { gte: MIN_INDIRECT_EXPOSURE_SCORE },
        event: {
          status: "ACTIVE",
          investorValueScore: { gte: MIN_PERSONAL_INVESTOR_VALUE },
          lastSeen: { gte: daysAgo(PERSONAL_LOOKBACK_DAYS) },
        },
      },
      include: {
        event: {
          include: eventInclude,
        },
      },
      orderBy: [{ exposureScore: "desc" }, { event: { lastSeen: "desc" } }],
      take: limit * 3,
    }),
  ]);

  const candidates: InsightCandidate[] = directEvents.map((event) => {
    const companyPriority = priorityByCompany.get(event.companyId) ?? 0;
    return {
      event,
      exposureScore: 0.96,
      companyPriority,
      score: scoreCandidate(event, 0.96, companyPriority),
    };
  });

  for (const row of exposureRows) {
    const companyPriority = priorityByCompany.get(row.companyId) ?? 0;
    candidates.push({
      event: row.event,
      exposureScore: row.exposureScore,
      companyPriority,
      score: scoreCandidate(row.event, row.exposureScore, companyPriority),
    });
  }

  return candidates;
}

async function getFallbackCandidates(limit: number): Promise<InsightCandidate[]> {
  const obxCompanyIds = await getObxCompanyIds();

  const [obxEvents, macroEvents] = await Promise.all([
    obxCompanyIds.length > 0
      ? prisma.companyEvent.findMany({
          where: {
            companyId: { in: obxCompanyIds },
            status: "ACTIVE",
            investorValueScore: { gte: MIN_FALLBACK_INVESTOR_VALUE },
            lastSeen: { gte: daysAgo(FALLBACK_LOOKBACK_DAYS) },
          },
          include: eventInclude,
          orderBy: [{ investorValueScore: "desc" }, { lastSeen: "desc" }],
          take: limit * 2,
        })
      : Promise.resolve([]),
    prisma.companyEvent.findMany({
      where: {
        status: "ACTIVE",
        eventType: { in: [...MACRO_EVENT_TYPES] },
        investorValueScore: { gte: MIN_FALLBACK_INVESTOR_VALUE },
        lastSeen: { gte: daysAgo(FALLBACK_LOOKBACK_DAYS) },
      },
      include: eventInclude,
      orderBy: [{ investorValueScore: "desc" }, { lastSeen: "desc" }],
      take: limit * 2,
    }),
  ]);

  return [...obxEvents, ...macroEvents].map((event) => {
    const companyPriority = MACRO_EVENT_TYPES.has(event.eventType) ? 0.45 : 0.35;
    return {
      event,
      exposureScore: 0.82,
      companyPriority,
      score: scoreCandidate(event, 0.82, companyPriority),
    };
  });
}

export async function getDashboardRelevantInsights(userId: string, limit = DEFAULT_LIMIT): Promise<InsightItem[]> {
  const resolvedLimit = Math.min(Math.max(limit, 1), 10);
  const priorities = await getPersonalCompanyPriorities(userId);
  const personalCandidates = await getPersonalCandidates(priorities, resolvedLimit);
  const personalItems = rankedUniqueItems(personalCandidates, resolvedLimit);

  if (personalItems.length >= resolvedLimit) {
    return personalItems;
  }

  const fallbackCandidates = await getFallbackCandidates(resolvedLimit);

  return rankedUniqueItems([...personalCandidates, ...fallbackCandidates], resolvedLimit);
}

export function clearDashboardInsightsCachesForTest() {
  obxCache = null;
}
