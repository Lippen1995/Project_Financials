import type { EventClassification } from "@/server/news/company-event-taxonomy";
import { classifyCompanyEventStage } from "@/server/news/company-event-feed-ranking";

export type ScoreSourceInput = {
  id: string;
  sourceType?: string | null;
  qualityScore?: number | null;
  metadata?: unknown;
};

export type InvestorValueScoreInput = {
  entityConfidence: number;
  materialityScore: number;
  sourceCredibilityScore: number;
  financialImpactScore: number;
  strategicImpactScore: number;
  riskImpactScore: number;
  noveltyScore: number;
  timelinessScore: number;
  userRelevanceScore: number;
  evidenceStrengthScore: number;
  lowSignalPenalty?: number;
  duplicatePenalty?: number;
};

export type InvestorValueScoreResult = InvestorValueScoreInput & {
  investorValueScore: number;
  uncappedInvestorValueScore?: number;
  valueCap?: number;
  routineDisclosure?: boolean;
};

const PRIMARY_SOURCE_TYPES = new Set(["newsweb", "brreg", "financials"]);
const REGULATORY_SOURCE_TYPES = new Set(["regulator"]);
const INTERNAL_SOURCE_TYPES = new Set(["internal"]);
const INDUSTRY_SOURCE_IDS = new Set([
  "sodir-news",
  "sodir-production",
  "sodir-drilling-permits",
  "sodir-exploration-results",
  "eia-today",
  "eia-press",
  "eia-petroleum-weekly",
  "iea-news",
  "google-news-energy-majors",
  "google-news-us-shale",
  "google-news-upstream",
]);

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function sourceTier(metadata: unknown) {
  const tier = asObject(metadata).tier;
  return typeof tier === "string" ? tier : null;
}

function tierBaselineScore(tier: string | null) {
  switch (tier) {
    case "primary":
      return 0.94;
    case "regulatory":
      return 0.9;
    case "premium_media":
      return 0.8;
    case "industry":
      return 0.74;
    case "internal":
      return 0.84;
    default:
      return 0.58;
  }
}

export function clampScore(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function computeSourceCredibilityScore(source: ScoreSourceInput | null | undefined) {
  if (!source) return 0.42;
  const tier = sourceTier(source.metadata);
  const baseline = tierBaselineScore(tier);
  if (typeof source.qualityScore === "number") {
    return clampScore(source.qualityScore * 0.88 + baseline * 0.12, 0, 1);
  }
  if (PRIMARY_SOURCE_TYPES.has(source.sourceType ?? "")) return 0.92;
  if (REGULATORY_SOURCE_TYPES.has(source.sourceType ?? "")) return 0.9;
  if (INTERNAL_SOURCE_TYPES.has(source.sourceType ?? "")) return 0.84;
  if (INDUSTRY_SOURCE_IDS.has(source.id)) return 0.82;
  if (source.id.includes("reuters")) return 0.84;
  if (tier) return baseline;
  return 0.58;
}

export function computeTimelinessScore(eventDate?: Date | null, now = new Date()) {
  if (!eventDate) return 0.35;
  const ageDays = Math.max(0, (now.getTime() - eventDate.getTime()) / 86_400_000);
  if (ageDays <= 2) return 1;
  if (ageDays <= 7) return 0.86;
  if (ageDays <= 30) return 0.64;
  if (ageDays <= 90) return 0.42;
  return 0.22;
}

export function computeEvidenceStrengthScore(input: { entityConfidence: number; eventTypeScore: number; evidenceCount?: number }) {
  const countBoost = Math.min(0.16, Math.max(0, (input.evidenceCount ?? 1) - 1) * 0.04);
  return clampScore((input.entityConfidence * 0.55 + input.eventTypeScore * 0.45 + countBoost), 0, 1);
}

export function computeNoveltyScore(input: { duplicateCount?: number; isFollowUp?: boolean }) {
  if (input.isFollowUp) return 0.38;
  const duplicateCount = input.duplicateCount ?? 0;
  if (duplicateCount <= 0) return 0.82;
  if (duplicateCount <= 2) return 0.62;
  return 0.42;
}

export function computeUserRelevanceScore(value?: number | null) {
  return clampScore(value ?? 0, 0, 1);
}

export function computeLowSignalPenalty(input: {
  entityConfidence: number;
  eventType: string;
  mentionContext?: string | null;
  lowSignalPenalty?: number;
  userRelevanceScore?: number | null;
  source?: ScoreSourceInput | null;
  sourceSectorMismatch?: boolean;
}) {
  let penalty = input.lowSignalPenalty ?? 0;
  if (input.eventType === "low_signal_mention") penalty += 0.18;
  if (input.mentionContext === "body") penalty += 0.08;
  if (input.entityConfidence < 0.65) penalty += 0.08;
  const tier = sourceTier(input.source?.metadata);
  const searchLikeSource = input.source?.sourceType === "search_rss" || tier === "industry";
  if (searchLikeSource && (input.userRelevanceScore ?? 0) < 0.15) penalty += 0.44;
  else if (searchLikeSource && (input.userRelevanceScore ?? 0) < 0.25) penalty += 0.3;
  else if (searchLikeSource && (input.userRelevanceScore ?? 0) < 0.35) penalty += 0.14;
  if (searchLikeSource && input.sourceSectorMismatch) penalty += 0.22;
  return clampScore(penalty, 0, 1);
}

export function computeDuplicatePenalty(input: { duplicateCount?: number; duplicateClusterSize?: number }) {
  const size = Math.max(input.duplicateCount ?? 0, input.duplicateClusterSize ?? 0);
  if (size <= 1) return 0;
  return clampScore(0.04 + Math.min(0.16, (size - 1) * 0.03), 0, 1);
}

export function eventInvestorValueCap(input: {
  eventType: string;
  title?: string | null;
}) {
  const title = (input.title ?? "").toLowerCase();
  const stage = classifyCompanyEventStage({
    eventType: input.eventType,
    title: input.title ?? "",
  });
  let cap = 100;

  if (input.eventType === "reporting_calendar") cap = 20;
  else if (input.eventType === "insider_transaction") cap = 45;
  else if (input.eventType === "annual_report") cap = 65;
  else if (input.eventType === "ownership_change") cap = 60;
  else if (input.eventType === "dividend" && /\bex[. -]?(?:dividend|utbytte)\b/.test(title)) cap = 45;

  if (/\b(?:employee|ansatt).*(?:share|aksje)/.test(title)) cap = Math.min(cap, 35);
  if (/\b(?:proxy|proxies|voting proxies|fullmakt)/.test(title)) cap = Math.min(cap, 20);
  if (stage === "administrative") cap = Math.min(cap, 50);
  if (stage === "routine") cap = Math.min(cap, 60);

  return {
    valueCap: cap,
    routineDisclosure: stage === "administrative" || stage === "routine",
  };
}

export function computeInvestorValueScore(
  input: InvestorValueScoreInput,
  policy: { valueCap?: number; routineDisclosure?: boolean } = {},
): InvestorValueScoreResult {
  const raw =
    0.18 * input.entityConfidence +
    0.16 * input.materialityScore +
    0.14 * input.sourceCredibilityScore +
    0.12 * input.financialImpactScore +
    0.1 * input.strategicImpactScore +
    0.1 * input.riskImpactScore +
    0.08 * input.noveltyScore +
    0.06 * input.timelinessScore +
    0.04 * input.userRelevanceScore +
    0.02 * input.evidenceStrengthScore -
    (input.lowSignalPenalty ?? 0) -
    (input.duplicatePenalty ?? 0);

  const uncappedInvestorValueScore = clampScore(raw * 100);
  const valueCap = policy.valueCap ?? 100;
  return {
    ...input,
    investorValueScore: Math.min(uncappedInvestorValueScore, valueCap),
    uncappedInvestorValueScore,
    valueCap,
    routineDisclosure: policy.routineDisclosure ?? false,
  };
}

export function scoreCompanyEvent(input: {
  companyId: string;
  eventDate?: Date | null;
  source?: ScoreSourceInput | null;
  classification: EventClassification;
  entityConfidence: number;
  mentionContext?: string | null;
  lowSignalPenalty?: number;
  userRelevanceScore?: number | null;
  sourceSectorMismatch?: boolean;
  evidenceCount?: number;
  duplicateCount?: number;
  title?: string | null;
  now?: Date;
}) {
  const sourceCredibilityScore = computeSourceCredibilityScore(input.source);
  const evidenceStrengthScore = computeEvidenceStrengthScore({
    entityConfidence: input.entityConfidence,
    eventTypeScore: input.classification.eventTypeScore,
    evidenceCount: input.evidenceCount,
  });
  const noveltyScore = computeNoveltyScore({ duplicateCount: input.duplicateCount });
  const timelinessScore = computeTimelinessScore(input.eventDate, input.now);
  const userRelevanceScore = computeUserRelevanceScore(input.userRelevanceScore);
  const lowSignalPenalty = computeLowSignalPenalty({
    entityConfidence: input.entityConfidence,
    eventType: input.classification.eventType,
    mentionContext: input.mentionContext,
    lowSignalPenalty: input.lowSignalPenalty,
    userRelevanceScore,
    source: input.source,
    sourceSectorMismatch: input.sourceSectorMismatch,
  });
  const duplicatePenalty = computeDuplicatePenalty({ duplicateCount: input.duplicateCount });

  const valuePolicy = eventInvestorValueCap({
    eventType: input.classification.eventType,
    title: input.title,
  });

  return computeInvestorValueScore({
    entityConfidence: input.entityConfidence,
    materialityScore: input.classification.materialityScore,
    sourceCredibilityScore,
    financialImpactScore: input.classification.financialImpactScore,
    strategicImpactScore: input.classification.strategicImpactScore,
    riskImpactScore: input.classification.riskImpactScore,
    noveltyScore,
    timelinessScore,
    userRelevanceScore,
    evidenceStrengthScore,
    lowSignalPenalty,
    duplicatePenalty,
  }, valuePolicy);
}
