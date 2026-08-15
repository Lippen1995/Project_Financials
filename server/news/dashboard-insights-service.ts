import { DdRoomStatus, WorkspaceStatus, WorkspaceType, WorkspaceWatchStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { INDIRECT_TRANSFERABLE_EVENT_TYPES } from "@/server/news/company-exposure-rules";
import {
  areSameInvestorStory,
  computeCompanyEventFeedRank,
} from "@/server/news/company-event-feed-ranking";
import {
  classifyNewsDataType,
  type NewsDataType,
} from "@/server/news/news-data-type";

const DEFAULT_LIMIT = 8;
const PERSONAL_LOOKBACK_DAYS = 90;
const FALLBACK_LOOKBACK_DAYS = 45;
const CONTEXT_DOCUMENT_LOOKBACK_DAYS = 120;
const MIN_PERSONAL_INVESTOR_VALUE = 45;
const MIN_FALLBACK_INVESTOR_VALUE = 55;
const MIN_INDIRECT_EXPOSURE_SCORE = 0.7;
const MAX_ITEMS_PER_COMPANY = 2;
const PROMINENT_COMPANY_MIN_EMPLOYEES = 1_000;
const PROMINENT_COMPANY_MIN_REVENUE = 1_000_000_000;
const OBX_INDEX_URL = "https://live.euronext.com/en/markets/oslo/equities-by-index/obx";
const OBX_CACHE_MS = 12 * 60 * 60 * 1000;

const MACRO_EVENT_TYPES = new Set([
  "commodity_price_exposure",
  "interest_rate_exposure",
  "macro_news",
  "regulatory_change",
  "sector_news",
]);

const MACRO_DOCUMENT_SOURCE_IDS = new Set([
  "reuters-business",
  "dn",
  "e24",
  "nrk-okonomi",
  "bbc-business",
  "guardian-business",
  "guardian-world",
  "scmp-business",
  "asiafinancial",
  "ecb-press",
  "federalreserve-press",
  "norgesbank",
  "ssb-business-financials",
  "ssb-tech-innovation",
  "ssb-bank-finance",
  "ssb-energy-industry",
  "google-news-ai-software",
  "google-news-semiconductors",
  "google-news-bank-insurance-capital-markets",
  "google-news-robotics-automation",
  "semiengineering",
  "siliconangle",
  "sodir-news",
  "sodir-production",
  "sodir-drilling-permits",
  "sodir-exploration-results",
  "eia-today",
  "eia-press",
  "eia-petroleum-weekly",
  "iea-news",
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
  dataType: NewsDataType;
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
  noveltyScore: number;
  severityScore: number;
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
  exposureType: string;
  exposureScore: number;
  companyPriority: number;
  score: number;
};

type MacroDocument = {
  id: string;
  sourceId: string;
  title: string;
  summary: string | null;
  canonicalUrl: string;
  publishedAt: Date | null;
  fetchedAt: Date;
  source: {
    id: string;
    name: string;
    qualityScore: number;
    metadata: unknown;
  };
};

type MacroDocumentCandidate = {
  document: MacroDocument;
  score: number;
  contextLabel: string;
  dataType: NewsDataType;
};

let obxCache: { expiresAt: number; companyIds: string[] } | null = null;

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function eventDateWindow(days: number) {
  const threshold = daysAgo(days);
  return {
    OR: [
      { eventDate: { gte: threshold } },
      {
        eventDate: null,
        lastSeen: { gte: threshold },
      },
    ],
  };
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

export async function refreshObxCompanyIds() {
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
          ...eventDateWindow(FALLBACK_LOOKBACK_DAYS),
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
    dataType: classifyNewsDataType({
      eventType: event.eventType,
      exposureType: candidate.exposureType,
      sourceId: document?.source.id,
    }),
  };
}

function normalizeDocumentTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/\beuropean union\b/g, "europe")
    .replace(/\beuropean\b/g, "europe")
    .replace(/\beu\b/g, "europe")
    .replace(/\s[-–]\s[^-–]+$/u, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textIncludesAny(text: string, values: string[]) {
  return keywordHits(text, values) > 0;
}

function keywordHits(text: string, values: string[]) {
  return values.filter((value) => {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
  }).length;
}

function sourceTierScore(metadata: unknown) {
  const tier = metadataObject(metadata).tier;
  switch (tier) {
    case "primary":
      return 0.94;
    case "regulatory":
      return 0.9;
    case "premium_media":
      return 0.8;
    case "industry":
      return 0.72;
    default:
      return 0.6;
  }
}

function macroDocumentContext(text: string, sourceName: string) {
  if (textIncludesAny(text, ["oil", "gas", "petroleum", "crude", "brent", "lng", "offshore", "norsk sokkel", "north sea"])) {
    return "Energy markets";
  }
  if (textIncludesAny(text, ["semiconductor", "semiconductors", "chip", "chips", "nvidia", "asml", "tsmc", "amd", "broadcom"])) {
    return "Technology markets";
  }
  if (textIncludesAny(text, ["ai", "artificial intelligence", "datacenter", "data center"])) {
    return "AI markets";
  }
  if (textIncludesAny(text, ["interest rate", "inflation", "central bank", "fed", "ecb", "norges bank"])) {
    return "Macro markets";
  }
  return sourceName;
}

function scoreMacroDocument(document: MacroDocument): MacroDocumentCandidate | null {
  const normalizedText = normalizeDocumentTitle(`${document.title} ${document.summary ?? ""}`);
  const marketTerms = ["stock", "stocks", "share", "shares", "equities", "nasdaq", "market", "markets", "investor", "investors", "wall street"];
  const movementTerms = ["fall", "falls", "drop", "drops", "slump", "slumps", "tumble", "tumbles", "selloff", "sell off", "sell-off", "rout", "weak", "caution", "concern", "jitters", "forecast"];
  const technologyTerms = ["ai", "artificial intelligence", "semiconductor", "semiconductors", "chip", "chips", "nvidia", "amd", "broadcom", "asml", "tsmc", "memory", "datacenter", "data center"];
  const macroTerms = ["gdp", "growth", "economy", "inflation", "interest rate", "central bank", "recession", "consumer", "investment", "capex", "productivity"];
  const policyTerms = ["chips act", "sovereignty", "tariff", "export control", "regulation", "funding", "subsidy", "supply demand", "supply-demand"];
  const energyTerms = ["oil", "gas", "petroleum", "crude", "brent", "wti", "lng", "offshore", "north sea", "norsk sokkel", "production", "supply", "demand", "inventory", "inventories", "discovery", "licence", "license", "drilling"];

  const marketHitCount = keywordHits(normalizedText, marketTerms);
  const movementHitCount = keywordHits(normalizedText, movementTerms);
  const technologyHitCount = keywordHits(normalizedText, technologyTerms);
  const macroHitCount = keywordHits(normalizedText, macroTerms);
  const policyHitCount = keywordHits(normalizedText, policyTerms);
  const energyHitCount = keywordHits(normalizedText, energyTerms);

  const hasMarketMove = marketHitCount > 0 && movementHitCount > 0;
  const hasTechnologyMarketSignal = technologyHitCount >= 1 && (hasMarketMove || policyHitCount > 0 || macroHitCount > 0);
  const hasMacroMarketSignal = macroHitCount > 0 && (marketHitCount > 0 || movementHitCount > 0 || policyHitCount > 0);
  const hasEnergyMarketSignal = energyHitCount >= 2;
  const isTrustedMacroSource = MACRO_DOCUMENT_SOURCE_IDS.has(document.sourceId);

  if (!hasTechnologyMarketSignal && !hasMacroMarketSignal && !hasEnergyMarketSignal && !(isTrustedMacroSource && hasMarketMove)) {
    return null;
  }

  const keywordScore = Math.min(
    1,
    technologyHitCount * 0.16 +
      macroHitCount * 0.14 +
      marketHitCount * 0.08 +
      movementHitCount * 0.12 +
      policyHitCount * 0.1 +
      energyHitCount * 0.12,
  );
  const sourceScore = Math.max(document.source.qualityScore ?? 0, sourceTierScore(document.source.metadata));
  const freshnessScore = decay(document.publishedAt ?? document.fetchedAt, 7);
  const score = keywordScore * 0.48 + sourceScore * 0.28 + freshnessScore * 0.24;

  if (score < 0.48) return null;

  const context = macroDocumentContext(normalizedText, document.source.name);
  const sourceDataType = classifyNewsDataType({ sourceId: document.sourceId });

  return {
    document,
    score,
    contextLabel: context,
    dataType:
      sourceDataType === "company"
        ? (hasMacroMarketSignal && !hasTechnologyMarketSignal) ||
          (hasMarketMove && technologyHitCount === 0)
          ? "macro"
          : "industry"
        : sourceDataType,
  };
}

function toMacroInsightItem(candidate: MacroDocumentCandidate): InsightItem {
  const date = candidate.document.publishedAt ?? candidate.document.fetchedAt;
  return {
    id: `macro:${candidate.document.id}`,
    title: candidate.document.title,
    summary: candidate.document.summary,
    contextLabel: candidate.contextLabel,
    publishedAt: date.toISOString(),
    href: candidate.document.canonicalUrl,
    sourceLabel: candidate.document.source.name,
    companyLabel: null,
    dataType: candidate.dataType,
    visual: {
      type: "textual",
      eyebrow: candidate.document.source.name,
      value: candidate.contextLabel,
    },
  };
}

function scoreCandidate(event: CandidateEvent, exposureScore: number, companyPriority: number) {
  return (
    computeCompanyEventFeedRank(event) * 0.72 +
    Math.min(Math.max(exposureScore, 0), 1) * 0.12 +
    Math.min(companyPriority, 1.2) * 0.16
  );
}

function rankedUniqueItems(candidates: InsightCandidate[], limit: number) {
  const seenEvents = new Set<string>();
  const selectedEvents: CandidateEvent[] = [];
  const companyCounts = new Map<string, number>();
  const items: InsightItem[] = [];

  for (const candidate of [...candidates].sort((left, right) => right.score - left.score)) {
    if (seenEvents.has(candidate.event.id)) continue;
    if (selectedEvents.some((event) => areSameInvestorStory(event, candidate.event))) continue;
    const companyCount = companyCounts.get(candidate.event.companyId) ?? 0;
    if (companyCount >= MAX_ITEMS_PER_COMPANY) continue;

    seenEvents.add(candidate.event.id);
    selectedEvents.push(candidate.event);
    companyCounts.set(candidate.event.companyId, companyCount + 1);
    items.push(toInsightItem(candidate));

    if (items.length >= limit) break;
  }

  return items;
}

function appendMacroDocumentItems(items: InsightItem[], candidates: MacroDocumentCandidate[], limit: number) {
  const seenTitles = new Set(items.map((item) => normalizeDocumentTitle(item.title)));
  const nextItems = [...items];

  for (const candidate of [...candidates].sort((left, right) => right.score - left.score)) {
    const titleKey = normalizeDocumentTitle(candidate.document.title);
    if (!titleKey || seenTitles.has(titleKey)) continue;
    if ([...seenTitles].some((seenTitle) => areLikelySameMacroStory(titleKey, seenTitle))) continue;

    seenTitles.add(titleKey);
    nextItems.push(toMacroInsightItem(candidate));

    if (nextItems.length >= limit) break;
  }

  return nextItems;
}

function titleTokens(value: string) {
  const stopWords = new Set(["the", "and", "for", "with", "from", "that", "this", "after", "into", "over", "under", "home"]);
  return value.split(" ").filter((token) => token.length >= 3 && !stopWords.has(token));
}

function areLikelySameMacroStory(left: string, right: string) {
  if (left.includes(right) || right.includes(left)) return true;
  const sharedTechnologyPolicyStory =
    textIncludesAny(left, ["europe"]) &&
    textIncludesAny(right, ["europe"]) &&
    textIncludesAny(left, ["sovereignty"]) &&
    textIncludesAny(right, ["sovereignty"]) &&
    textIncludesAny(left, ["chip", "chips", "ai", "cloud", "technology", "tech"]) &&
    textIncludesAny(right, ["chip", "chips", "ai", "cloud", "technology", "tech"]);
  if (sharedTechnologyPolicyStory) return true;

  const leftTokens = new Set(titleTokens(left));
  const rightTokens = new Set(titleTokens(right));
  if (leftTokens.size < 4 || rightTokens.size < 4) return false;

  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const smaller = Math.min(leftTokens.size, rightTokens.size);
  return overlap / smaller >= 0.5;
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
        ...eventDateWindow(PERSONAL_LOOKBACK_DAYS),
      },
      include: eventInclude,
      orderBy: [{ eventDate: { sort: "desc", nulls: "last" } }, { lastSeen: "desc" }],
      take: limit * 8,
    }),
    prisma.companyEventExposure.findMany({
      where: {
        companyId: { in: companyIds },
        active: true,
        exposureType: { not: "direct" },
        exposureScore: { gte: MIN_INDIRECT_EXPOSURE_SCORE },
        event: {
          status: "ACTIVE",
          eventType: { in: [...INDIRECT_TRANSFERABLE_EVENT_TYPES] },
          investorValueScore: { gte: MIN_PERSONAL_INVESTOR_VALUE },
          ...eventDateWindow(PERSONAL_LOOKBACK_DAYS),
        },
      },
      include: {
        event: {
          include: eventInclude,
        },
      },
      orderBy: [
        { event: { eventDate: { sort: "desc", nulls: "last" } } },
        { exposureScore: "desc" },
      ],
      take: limit * 8,
    }),
  ]);

  const candidates: InsightCandidate[] = directEvents.map((event) => {
    const companyPriority = priorityByCompany.get(event.companyId) ?? 0;
    return {
      event,
      exposureType: "direct",
      exposureScore: 0.96,
      companyPriority,
      score: scoreCandidate(event, 0.96, companyPriority),
    };
  });

  for (const row of exposureRows) {
    const companyPriority = priorityByCompany.get(row.companyId) ?? 0;
    candidates.push({
      event: row.event,
      exposureType: row.exposureType,
      exposureScore: row.exposureScore,
      companyPriority,
      score: scoreCandidate(row.event, row.exposureScore, companyPriority),
    });
  }

  return candidates;
}

async function getFallbackCandidates(limit: number): Promise<InsightCandidate[]> {
  // OBX membership must be populated by a background sync. Until that local
  // read model exists, the request path uses stored macro/prominent events.
  const obxCompanyIds: string[] = [];

  const [obxEvents, macroEvents] = await Promise.all([
    obxCompanyIds.length > 0
      ? prisma.companyEvent.findMany({
          where: {
            companyId: { in: obxCompanyIds },
            status: "ACTIVE",
            investorValueScore: { gte: MIN_FALLBACK_INVESTOR_VALUE },
            ...eventDateWindow(FALLBACK_LOOKBACK_DAYS),
          },
          include: eventInclude,
          orderBy: [{ eventDate: { sort: "desc", nulls: "last" } }, { lastSeen: "desc" }],
          take: limit * 6,
        })
      : Promise.resolve([]),
    prisma.companyEvent.findMany({
      where: {
        status: "ACTIVE",
        eventType: { in: [...MACRO_EVENT_TYPES] },
        investorValueScore: { gte: MIN_FALLBACK_INVESTOR_VALUE },
        ...eventDateWindow(FALLBACK_LOOKBACK_DAYS),
      },
      include: eventInclude,
      orderBy: [{ eventDate: { sort: "desc", nulls: "last" } }, { lastSeen: "desc" }],
      take: limit * 6,
    }),
  ]);

  const fallbackEvents = [...obxEvents, ...macroEvents];

  if (fallbackEvents.length < limit * 2) {
    const prominentCompanyEvents = await prisma.companyEvent.findMany({
      where: {
        status: "ACTIVE",
        eventType: { not: "low_signal_mention" },
        investorValueScore: { gte: MIN_FALLBACK_INVESTOR_VALUE },
        ...eventDateWindow(FALLBACK_LOOKBACK_DAYS),
        company: {
          OR: [
            { employeeCount: { gte: PROMINENT_COMPANY_MIN_EMPLOYEES } },
            { revenue: { gte: PROMINENT_COMPANY_MIN_REVENUE } },
          ],
        },
      },
      include: eventInclude,
      orderBy: [{ eventDate: { sort: "desc", nulls: "last" } }, { lastSeen: "desc" }],
      take: limit * 8,
    });

    fallbackEvents.push(...(prominentCompanyEvents ?? []));
  }

  return fallbackEvents.map((event) => {
    const companyPriority = MACRO_EVENT_TYPES.has(event.eventType) ? 0.3 : 0.35;
    return {
      event,
      exposureType: "direct",
      exposureScore: 0.82,
      companyPriority,
      score: scoreCandidate(event, 0.82, companyPriority),
    };
  });
}

async function getMacroDocumentCandidates(limit: number): Promise<MacroDocumentCandidate[]> {
  const documents = await prisma.sourceDocument.findMany({
    where: {
      sourceId: { in: [...MACRO_DOCUMENT_SOURCE_IDS] },
      OR: [
        { publishedAt: { gte: daysAgo(CONTEXT_DOCUMENT_LOOKBACK_DAYS) } },
        {
          publishedAt: null,
          fetchedAt: { gte: daysAgo(CONTEXT_DOCUMENT_LOOKBACK_DAYS) },
        },
      ],
    },
    include: {
      source: {
        select: {
          id: true,
          name: true,
          qualityScore: true,
          metadata: true,
        },
      },
    },
    orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
    take: limit * 12,
  });

  return documents.flatMap((document) => {
    const candidate = scoreMacroDocument(document);
    return candidate ? [candidate] : [];
  });
}

export async function getDashboardRelevantInsights(userId: string, limit = DEFAULT_LIMIT): Promise<InsightItem[]> {
  const resolvedLimit = Math.min(Math.max(limit, 1), 10);
  const priorities = await getPersonalCompanyPriorities(userId);
  const personalCandidates = await getPersonalCandidates(priorities, resolvedLimit);
  const fallbackCandidates = await getFallbackCandidates(resolvedLimit);
  const eventItems = rankedUniqueItems([...personalCandidates, ...fallbackCandidates], resolvedLimit);
  const macroDocumentCandidates = await getMacroDocumentCandidates(resolvedLimit);
  const contextualItems = appendMacroDocumentItems([], macroDocumentCandidates, resolvedLimit);
  if (contextualItems.length === 0) return eventItems;

  const minimumContextualQuota = Math.max(1, Math.ceil(resolvedLimit * 0.25));
  const openSlots = Math.max(0, resolvedLimit - eventItems.length);
  const contextualQuota = Math.min(
    contextualItems.length,
    Math.max(minimumContextualQuota, openSlots),
  );
  return [
    ...eventItems.slice(0, Math.max(0, resolvedLimit - contextualQuota)),
    ...contextualItems.slice(0, contextualQuota),
  ];
}

export function clearDashboardInsightsCachesForTest() {
  obxCache = null;
}
