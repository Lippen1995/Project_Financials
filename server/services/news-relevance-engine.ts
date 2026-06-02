import type { CompanyStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { readIpPortfolioCache } from "@/server/persistence/ip-cache";

export const NEWS_ENGINE_VERSION = "local-v2";
export const NEWS_FEATURE_VERSION = "v1";
export const NEWS_SCORE_VERSION = "v1";
export const NEWS_RELEVANCE_THRESHOLD = 0.35;
export type NewsFeedbackLabel = "RELEVANT" | "NOT_RELEVANT" | "WEAK_RELEVANT";

const LEGAL_SUFFIXES = [
  "as",
  "asa",
  "ans",
  "da",
  "sa",
  "ba",
  "kf",
  "sf",
  "fkf",
  "iks",
  "konsern",
  "group",
  "holding",
  "stiftelse",
];

const STOPWORDS = new Set([
  "and",
  "asa",
  "as",
  "av",
  "co",
  "company",
  "den",
  "det",
  "ei",
  "en",
  "et",
  "for",
  "fra",
  "group",
  "holding",
  "i",
  "med",
  "mot",
  "og",
  "on",
  "the",
  "til",
  "ved",
]);

const GROUP_HINT_KEYWORDS = [
  "konsern",
  "group",
  "subsidiary",
  "datterselskap",
  "søsterselskap",
  "mor selskap",
  "morselskap",
  "eid av",
  "controlled by",
];

const INNOVATION_KEYWORDS = [
  "patent",
  "patentsøknad",
  "patentsoknad",
  "patenttvist",
  "patentstrid",
  "patentstyret",
  "ip",
  "immaterielle rettigheter",
  "immaterialrett",
  "varemerke",
  "designregistrering",
  "lisens",
  "lisensiering",
  "teknologi",
  "fou",
  "forskning",
  "pilot",
  "prototype",
  "klinisk",
  "materialteknologi",
  "innovasjon",
];

const AUTHORITATIVE_MACRO_SOURCES = new Set([
  "norgesbank",
  "regjeringen",
  "finanstilsynet",
  "konkurransetilsynet",
  "oslobors",
  "sodir-news",
  "sodir-production",
  "sodir-drilling-permits",
  "sodir-exploration-results",
  "eia-today",
  "eia-press",
  "eia-petroleum-weekly",
]);

const SOURCE_QUALITY_WEIGHTS: Record<string, number> = {
  dn: 0.88,
  e24: 0.82,
  finansavisen: 0.8,
  hegnar: 0.68,
  "nrk-okonomi": 0.78,
  regjeringen: 0.9,
  oslobors: 0.92,
  norgesbank: 0.95,
  finanstilsynet: 0.94,
  konkurransetilsynet: 0.92,
  tu: 0.72,
  shifter: 0.7,
  kampanje: 0.62,
  na24: 0.67,
  "norsk-olje-gass": 0.72,
  "sodir-news": 0.94,
  "sodir-production": 0.96,
  "sodir-drilling-permits": 0.92,
  "sodir-exploration-results": 0.95,
  "eia-today": 0.96,
  "eia-press": 0.95,
  "eia-petroleum-weekly": 0.96,
  "google-news-oil-gas": 0.68,
  bygg: 0.66,
  "intrafish-no": 0.71,
  sysla: 0.7,
  upstream: 0.7,
  "reuters-business": 0.84,
};

const MACRO_THEMES: Array<{
  id: string;
  label: string;
  keywords: string[];
  favoredIndustryPrefixes?: string[];
  standaloneScope?: "global" | "industry";
}> = [
  {
    id: "rente",
    label: "Rente",
    keywords: [
      "rente",
      "styringsrente",
      "rentekutt",
      "renteheving",
      "norges bank",
      "inflasjon",
      "policy rate",
      "interest rate",
      "rate hike",
      "rate cut",
      "monetary policy",
    ],
    favoredIndustryPrefixes: ["64", "65", "66", "41", "42", "43", "68"],
    standaloneScope: "global",
  },
  {
    id: "energi",
    label: "Energi",
    keywords: [
      ...["energipris", "strompris", "oljepris", "gasspris", "kraftpris", "kraftmarked"],
      "oil price",
      "crude oil",
      "brent",
      "wti",
      "natural gas",
      "lng",
      "gas price",
      "energy market",
      "petroleum",
      "opec",
    ],
    favoredIndustryPrefixes: ["05", "06", "19", "20", "24", "35"],
    standaloneScope: "industry",
  },
  {
    id: "upstream",
    label: "Upstream",
    keywords: [
      "us shale",
      "shale",
      "permian",
      "bakken",
      "eagle ford",
      "exploration",
      "drilling",
      "well",
      "field development",
      "production",
      "reserves",
      "offshore",
      "subsea",
      "licence",
      "license",
      "leteboring",
      "boretillatelse",
      "produksjonstall",
    ],
    favoredIndustryPrefixes: ["05", "06", "09", "19"],
    standaloneScope: "industry",
  },
  {
    id: "regulering",
    label: "Regulering",
    keywords: ["regulering", "lov", "forskrift", "tilsyn", "compliance", "krav", "eu-direktiv"],
    favoredIndustryPrefixes: ["05", "06", "19", "35", "61", "62", "63", "64", "65", "66", "84", "86"],
    standaloneScope: "industry",
  },
  {
    id: "ma",
    label: "M&A",
    keywords: ["oppkjøp", "oppkjop", "fusjon", "emisjon", "ipo", "kapitalinnhenting", "overtakelse"],
  },
  {
    id: "konkurs",
    label: "Konkurs",
    keywords: ["konkurs", "rekonstruksjon", "avvikling", "insolvens", "gjeldsforhandling"],
  },
  {
    id: "geopolitikk",
    label: "Geopolitikk",
    keywords: ["toll", "sanksjoner", "eksportkontroll", "krig", "forsyningskjede", "supply chain"],
    favoredIndustryPrefixes: ["05", "06", "10", "19", "20", "21", "24", "25", "26", "27", "28", "29", "30", "35", "46"],
    standaloneScope: "industry",
  },
];

export type ArticleInput = {
  id: string;
  title: string;
  summary: string | null;
  url?: string;
  publishedAt?: Date;
  source?: string;
  category?: string | null;
};

export type CompanyInput = {
  id: string;
  name: string;
  orgNumber: string;
  employeeCount?: number | null;
  revenue?: number | null;
  addresses?: Array<{ city: string; region?: string | null }>;
  industryCode?: { code: string; title?: string | null; description?: string | null } | null;
};

type ContextRelationType = "OWNER" | "SUBSIDIARY" | "SISTER" | "ROLE_OVERLAP";
type CandidateReason =
  | "DIRECT_MENTION"
  | "GROUP_RELATION"
  | "PEER_MENTION"
  | "INDUSTRY_SIGNAL"
  | "MACRO_SIGNAL"
  | "IP_SIGNAL";
type PrimaryRelevanceType = "direct" | "group" | "peer" | "industry" | "macro" | "ip";

type ContextRelation = {
  companyId: string;
  name: string;
  orgNumber: string;
  aliases: string[];
  confidence: number;
  relationType: ContextRelationType;
};

type PeerCompany = {
  companyId: string;
  name: string;
  orgNumber: string;
  aliases: string[];
  confidence: number;
  industryPrefix: string | null;
};

type MacroHit = {
  id: string;
  label: string;
  strength: number;
};

export type CompanyNewsContext = {
  companyId: string;
  orgNumber: string;
  name: string;
  normalizedName: string;
  aliases: string[];
  websiteAliases: string[];
  brandSupportTokens: string[];
  industryCode: string | null;
  industryPrefixes: string[];
  sectorTokens: string[];
  parentTokens: string[];
  regionTokens: string[];
  sourceSignals: string[];
  groupRelations: ContextRelation[];
  peerCompanies: PeerCompany[];
  ipProfile: {
    hasPortfolio: boolean;
    tokens: string[];
    applicationNumbers: string[];
    ownerNames: string[];
  };
};

export type GeneratedNewsCandidate = {
  companyId: string;
  reasons: CandidateReason[];
  candidateScore: number;
  macroHits: MacroHit[];
};

export type NewsFeatureSet = {
  candidateReasons: CandidateReason[];
  candidateScore: number;
  directMentionScore: number;
  aliasMentionScore: number;
  groupScore: number;
  peerScore: number;
  industryScore: number;
  macroScore: number;
  ipScore: number;
  sourceQualityScore: number;
  titleWeight: number;
  summaryWeight: number;
  freshnessScore: number;
  ambiguityPenalty: number;
  confidenceScore: number;
  evidence: {
    directMatches: string[];
    aliasMatches: string[];
    groupMatches: Array<{ name: string; relationType: ContextRelationType; confidence: number }>;
    peerMatches: string[];
    industryMatches: string[];
    parentMatches: string[];
    macroThemes: string[];
    ipMatches: string[];
    innovationMatches: string[];
  };
};

export type RelevanceScore = {
  newsArticleId: string;
  companyId: string;
  totalScore: number;
  candidateScore: number;
  confidenceScore: number;
  directScore: number;
  sectorScore: number;
  macroScore: number;
  competitorScore: number;
  groupScore: number;
  ipScore: number;
  primaryType: PrimaryRelevanceType;
  reasons: string[];
  reasoning: string | null;
  tags: string[];
  evidence: NewsFeatureSet["evidence"];
  featureSet: NewsFeatureSet;
  scoredBy: string;
  engineVersion: string;
  featureVersion: string;
  scoreVersion: string;
};

export async function buildCompanyNewsContext(companyId: string): Promise<CompanyNewsContext | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      industryCode: true,
      addresses: { take: 2 },
    },
  });
  if (!company) return null;

  const aliases = buildCompanyAliases(company.name);
  const websiteAliases = buildWebsiteAliases(company.website);
  const brandSupportTokens = buildBrandSupportTokens(company.rawPayload);
  const regionTokens = buildRegionTokens(
    company.addresses.map((address) => ({ city: address.city, region: address.region })),
  );
  const industryProfile = await buildIndustryProfile(company.industryCode?.code ?? null);
  const [groupRelations, peerCompanies, ipProfile] = await Promise.all([
    buildGroupRelations(company.id),
    buildPeerCompanies(company.id, company.status, company.industryCode?.code ?? null, company.revenue, company.employeeCount, regionTokens),
    buildIpProfile(company.orgNumber),
  ]);

  const strategicPeerCompanies = buildStrategicPeerCompanies(industryProfile.prefixes);

  return {
    companyId: company.id,
    orgNumber: company.orgNumber,
    name: company.name,
    normalizedName: normalizeText(company.name),
    aliases: Array.from(new Set([...aliases, ...websiteAliases])),
    websiteAliases,
    brandSupportTokens,
    industryCode: company.industryCode?.code ?? null,
    industryPrefixes: industryProfile.prefixes,
    sectorTokens: industryProfile.sectorTokens,
    parentTokens: industryProfile.parentTokens,
    regionTokens,
    sourceSignals: [company.legalForm ?? "", company.orgNumber].filter(Boolean),
    groupRelations,
    peerCompanies: mergePeerCompanies(peerCompanies, strategicPeerCompanies),
    ipProfile,
  };
}

function buildStrategicPeerCompanies(industryPrefixes: string[]): PeerCompany[] {
  const oilAndGas = industryPrefixes.some((prefix) => ["05", "06", "09", "19"].includes(prefix));
  if (!oilAndGas) {
    return [];
  }

  return [
    "BP",
    "Shell",
    "ExxonMobil",
    "Exxon",
    "Chevron",
    "TotalEnergies",
    "ConocoPhillips",
    "Eni",
    "Repsol",
    "Aker BP",
    "Vaar Energi",
    "Harbour Energy",
    "Petrobras",
    "Saudi Aramco",
  ].map((name) => ({
    companyId: `strategic-peer:${normalizeText(name)}`,
    name,
    orgNumber: "",
    aliases: buildCompanyAliases(name),
    confidence: 0.5,
    industryPrefix: "06",
  }));
}

function mergePeerCompanies(primary: PeerCompany[], strategic: PeerCompany[]) {
  const byName = new Map<string, PeerCompany>();
  for (const peer of [...primary, ...strategic]) {
    const key = normalizeText(peer.name);
    const existing = byName.get(key);
    if (!existing || existing.confidence < peer.confidence) {
      byName.set(key, peer);
    }
  }
  return Array.from(byName.values()).slice(0, 30);
}

export function generateNewsCandidates(
  article: ArticleInput,
  contexts: CompanyNewsContext[],
): GeneratedNewsCandidate[] {
  const normalizedTitle = normalizeText(article.title);
  const normalizedSummary = normalizeText(article.summary ?? "");
  const normalizedText = `${normalizedTitle} ${normalizedSummary}`.trim();
  const macroHits = detectMacroThemes(normalizedText);
  const sourceQuality = SOURCE_QUALITY_WEIGHTS[article.source ?? ""] ?? 0.45;

  const candidates: GeneratedNewsCandidate[] = [];

  for (const context of contexts) {
    const reasons: CandidateReason[] = [];
    const directScore = scoreTermMentions(normalizedTitle, normalizedSummary, [context.name, ...context.aliases, context.orgNumber]);
    const groupScore = scoreRelationMentions(normalizedText, context.groupRelations);
    const peerScore = scorePeerMentions(normalizedText, context.peerCompanies);
    const industryScore = scoreTokenHits(normalizedTitle, normalizedSummary, context.sectorTokens, context.parentTokens);
    const ipScore = scoreIpMentions(normalizedText, context.ipProfile.tokens, context.ipProfile.applicationNumbers);
    const hasContextSupport =
      directScore >= 0.2 ||
      groupScore >= 0.18 ||
      peerScore >= 0.2 ||
      ipScore >= 0.18 ||
      industryScore >= 0.12;
    const supportedMacroHits = macroHits.filter((macroHit) =>
      isMacroSupportedForCompany(macroHit.id, context.industryPrefixes, industryScore, hasContextSupport),
    );
    const hasMacro = supportedMacroHits.length > 0;
    const macroCandidateScore = hasMacro
      ? clamp01(
          supportedMacroHits.reduce(
            (sum, macroHit) => sum + macroHit.strength * getMacroIndustryFit(macroHit.id, context.industryPrefixes, industryScore),
            0,
          ) * 0.5 +
            (AUTHORITATIVE_MACRO_SOURCES.has(article.source ?? "") ? 0.22 : 0) +
            sourceQuality * 0.08,
        )
      : 0;

    if (directScore >= 0.28) reasons.push("DIRECT_MENTION");
    if (groupScore >= 0.2) reasons.push("GROUP_RELATION");
    if (peerScore >= 0.22) reasons.push("PEER_MENTION");
    if (industryScore >= 0.18) reasons.push("INDUSTRY_SIGNAL");
    if (macroCandidateScore >= 0.14) reasons.push("MACRO_SIGNAL");
    if (ipScore >= 0.18) reasons.push("IP_SIGNAL");

    const candidateScore = clamp01(
      directScore * 0.32 +
        groupScore * 0.18 +
        peerScore * 0.12 +
        industryScore * 0.14 +
        macroCandidateScore * 0.24 +
        ipScore * 0.12 +
        sourceQuality * 0.02,
    );

    const hasCandidate =
      directScore >= 0.2 ||
      groupScore >= 0.18 ||
      peerScore >= 0.2 ||
      ipScore >= 0.18 ||
      macroCandidateScore >= 0.14 ||
      candidateScore >= 0.24;

    if (hasCandidate && reasons.length > 0) {
      candidates.push({
        companyId: context.companyId,
        reasons,
        candidateScore,
        macroHits: supportedMacroHits,
      });
    }
  }

  return candidates.sort((left, right) => right.candidateScore - left.candidateScore);
}

export function extractNewsFeatures(
  article: ArticleInput,
  context: CompanyNewsContext,
  candidate: GeneratedNewsCandidate,
): NewsFeatureSet {
  const normalizedTitle = normalizeText(article.title);
  const normalizedSummary = normalizeText(article.summary ?? "");
  const normalizedText = `${normalizedTitle} ${normalizedSummary}`.trim();

  const directTerms = Array.from(
    new Set([
      context.name,
      ...context.aliases.filter((alias) => normalizeText(alias).split(" ").length >= 2).slice(0, 1),
      context.orgNumber,
    ]),
  );
  const directMatches = findMatchingTerms(normalizedTitle, normalizedSummary, directTerms);
  const aliasTerms = context.aliases.filter((alias) => normalizeText(alias) !== normalizeText(context.name));
  const aliasMatches = findMatchingTerms(normalizedTitle, normalizedSummary, aliasTerms);
  const groupMatches = findRelationMatches(normalizedText, context.groupRelations);
  const peerMatches = findPeerMatches(normalizedText, context.peerCompanies);
  const industryHits = findTokenMatches(normalizedTitle, normalizedSummary, context.sectorTokens);
  const parentHits = findTokenMatches(normalizedTitle, normalizedSummary, context.parentTokens);
  const macroHits = candidate.macroHits;
  const ipMatches = findTokenMatches(normalizedTitle, normalizedSummary, context.ipProfile.tokens);
  const applicationMatches = findTokenMatches(normalizedTitle, normalizedSummary, context.ipProfile.applicationNumbers);
  const innovationMatches = findTokenMatches(normalizedTitle, normalizedSummary, INNOVATION_KEYWORDS);

  const directMentionScore = clamp01(
    directMatches.titleMatches.length * 0.42 +
      directMatches.summaryMatches.length * 0.24 +
      (directMatches.orgNumberMatch ? 0.35 : 0),
  );
  const aliasMentionScore = clamp01(
    aliasMatches.titleMatches.length * 0.22 + aliasMatches.summaryMatches.length * 0.13,
  );

  const groupKeywordBoost = GROUP_HINT_KEYWORDS.some((keyword) => containsPhrase(normalizedText, normalizeText(keyword)))
    ? 0.08
    : 0;
  const groupScore = clamp01(
    groupMatches.reduce((sum, match) => sum + match.confidence * 0.45, 0) + groupKeywordBoost,
  );

  const peerScoreBase = clamp01(peerMatches.reduce((sum, match) => sum + match.confidence * 0.35, 0));
  const peerScore = clamp01(peerScoreBase * (industryHits.length > 0 || macroHits.length > 0 ? 1 : 0.6));

  const industryScore = clamp01(industryHits.length * 0.08 + parentHits.length * 0.04);
  const macroSourceBoost = AUTHORITATIVE_MACRO_SOURCES.has(article.source ?? "") ? 0.22 : 0;
  const macroScore = clamp01(
    macroHits.reduce(
      (sum, macroHit) => sum + macroHit.strength * getMacroIndustryFit(macroHit.id, context.industryPrefixes, industryScore),
      0,
    ) * 0.5 + macroSourceBoost,
  );

  const ipPortfolioBoost = context.ipProfile.hasPortfolio ? 0.1 : 0;
  const ipScore = clamp01(
    ipMatches.length * 0.12 + applicationMatches.length * 0.18 + innovationMatches.length * 0.06 + ipPortfolioBoost,
  );
  const sourceQualityScore = SOURCE_QUALITY_WEIGHTS[article.source ?? ""] ?? 0.45;
  const titleWeight = clamp01(
    (directMatches.titleMatches.length > 0 ? 0.45 : 0) +
      (groupMatches.some((match) => match.inTitle) ? 0.2 : 0) +
      (peerMatches.some((match) => match.inTitle) ? 0.15 : 0) +
      (industryHits.length > 0 ? 0.12 : 0),
  );
  const summaryWeight = clamp01(
    (directMatches.summaryMatches.length > 0 ? 0.35 : 0) +
      (groupMatches.some((match) => !match.inTitle) ? 0.18 : 0) +
      (peerMatches.some((match) => !match.inTitle) ? 0.15 : 0) +
      (parentHits.length > 0 ? 0.12 : 0),
  );
  const freshnessScore = computeFreshnessScore(article.publishedAt ?? null);
  const ambiguityPenalty = computeAmbiguityPenalty(context.name, aliasMatches.allMatches, directMentionScore, groupScore, industryScore, ipScore);
  const confidenceScore = clamp01(
    candidate.candidateScore * 0.25 +
      Math.max(directMentionScore, groupScore, peerScore, ipScore, macroScore) * 0.35 +
      sourceQualityScore * 0.15 +
      freshnessScore * 0.1 +
      Math.min(candidate.reasons.length / 5, 1) * 0.15 -
      ambiguityPenalty * 0.4,
  );

  return {
    candidateReasons: candidate.reasons,
    candidateScore: candidate.candidateScore,
    directMentionScore,
    aliasMentionScore,
    groupScore,
    peerScore,
    industryScore,
    macroScore,
    ipScore,
    sourceQualityScore,
    titleWeight,
    summaryWeight,
    freshnessScore,
    ambiguityPenalty,
    confidenceScore,
    evidence: {
      directMatches: directMatches.allMatches,
      aliasMatches: aliasMatches.allMatches,
      groupMatches: groupMatches.map((match) => ({
        name: match.name,
        relationType: match.relationType,
        confidence: match.confidence,
      })),
      peerMatches: peerMatches.map((match) => match.name),
      industryMatches: industryHits,
      parentMatches: parentHits,
      macroThemes: macroHits.map((macroHit) => macroHit.label),
      ipMatches: Array.from(new Set([...ipMatches, ...applicationMatches])),
      innovationMatches,
    },
  };
}

export function scoreNewsFeatures(
  newsArticleId: string,
  companyId: string,
  featureSet: NewsFeatureSet,
): RelevanceScore {
  const directBoost = featureSet.directMentionScore >= 0.4 ? 0.12 : 0;
  const aliasBoost = featureSet.aliasMentionScore >= 0.12 ? 0.05 : 0;
  const macroBoost = featureSet.macroScore >= 0.18 ? 0.2 : 0;
  const totalScore = clamp01(
    featureSet.candidateScore * 0.18 +
      featureSet.directMentionScore * 0.3 +
      featureSet.aliasMentionScore * 0.12 +
      featureSet.groupScore * 0.16 +
      featureSet.peerScore * 0.08 +
      featureSet.industryScore * 0.09 +
      featureSet.macroScore * 0.24 +
      featureSet.ipScore * 0.08 +
      featureSet.sourceQualityScore * 0.04 +
      featureSet.titleWeight * 0.04 +
      featureSet.summaryWeight * 0.02 +
      featureSet.freshnessScore * 0.03 -
      featureSet.ambiguityPenalty * 0.15 +
      directBoost +
      aliasBoost +
      macroBoost,
  );

  const primaryType = derivePrimaryType(featureSet);
  const reasons = deriveReasonLabels(featureSet);
  const tags = Array.from(
    new Set([
      ...featureSet.evidence.macroThemes.map((theme) => normalizeText(theme)),
      ...(featureSet.groupScore >= 0.18 ? ["konsern"] : []),
      ...(featureSet.peerScore >= 0.18 ? ["konkurrent"] : []),
      ...(featureSet.ipScore >= 0.18 ? ["innovasjon"] : []),
      ...(featureSet.directMentionScore >= 0.28 ? ["direkte"] : []),
    ]),
  );

  return {
    newsArticleId,
    companyId,
    totalScore,
    candidateScore: featureSet.candidateScore,
    confidenceScore: featureSet.confidenceScore,
    directScore: clamp01(featureSet.directMentionScore + featureSet.aliasMentionScore * 0.7),
    sectorScore: featureSet.industryScore,
    macroScore: featureSet.macroScore,
    competitorScore: featureSet.peerScore,
    groupScore: featureSet.groupScore,
    ipScore: featureSet.ipScore,
    primaryType,
    reasons,
    reasoning: buildReasoning(primaryType, featureSet),
    tags,
    evidence: featureSet.evidence,
    featureSet,
    scoredBy: NEWS_ENGINE_VERSION,
    engineVersion: NEWS_ENGINE_VERSION,
    featureVersion: NEWS_FEATURE_VERSION,
    scoreVersion: NEWS_SCORE_VERSION,
  };
}

export async function recordNewsFeedback(input: {
  articleId: string;
  companyId: string;
  label: NewsFeedbackLabel;
  reviewedById?: string | null;
  notes?: string | null;
}) {
  return prisma.newsRelevanceFeedback.create({
    data: {
      newsArticleId: input.articleId,
      companyId: input.companyId,
      label: input.label as never,
      reviewedById: input.reviewedById ?? null,
      notes: input.notes ?? null,
    },
  });
}

async function buildIndustryProfile(code: string | null) {
  if (!code) {
    return {
      prefixes: [] as string[],
      sectorTokens: [] as string[],
      parentTokens: [] as string[],
    };
  }

  const chain: Array<{ title: string; description: string | null }> = [];
  const visited = new Set<string>();
  let nextCode: string | null = code;

  while (nextCode && !visited.has(nextCode)) {
    visited.add(nextCode);
    const current = await prisma.industryCode.findUnique({ where: { code: nextCode } });
    if (!current) break;
    chain.push({ title: current.title, description: current.description });
    nextCode = extractParentCode(current.rawPayload);
  }

  const prefix = getPrimaryIndustryPrefix(code);
  const cluster = prefix
    ? await prisma.industryCode.findMany({
        where: {
          code: {
            startsWith: prefix,
          },
        },
        take: 18,
      })
    : [];

  const sectorTokens = uniqueTokens([
    ...chain.flatMap((item) => [item.title, item.description ?? ""]),
    ...cluster.flatMap((item) => [item.title, item.description ?? ""]),
  ]);
  const parentTokens = uniqueTokens(chain.slice(1).flatMap((item) => [item.title, item.description ?? ""]));
  const cleanedDigits = code.replace(/\D/g, "");
  const prefixes = Array.from(
    new Set(
      [cleanedDigits.slice(0, 2), cleanedDigits.slice(0, 4), cleanedDigits.slice(0, 5)].filter((value) => value.length >= 2),
    ),
  );

  return {
    prefixes,
    sectorTokens,
    parentTokens,
  };
}

async function buildGroupRelations(companyId: string): Promise<ContextRelation[]> {
  const relations = new Map<string, ContextRelation>();

  const latestSnapshot = await prisma.shareholdingSnapshot.findFirst({
    where: { companyId },
    include: {
      ownerships: {
        include: {
          shareholder: {
            include: {
              linkedCompany: true,
            },
          },
        },
      },
    },
    orderBy: [{ taxYear: "desc" }, { sourceImportedAt: "desc" }],
  });

  const strongOwnerIds = new Set<string>();

  for (const ownership of latestSnapshot?.ownerships ?? []) {
    const linkedCompany = ownership.shareholder.linkedCompany;
    if (!linkedCompany || linkedCompany.id === companyId) continue;
    const confidence = computeOwnershipConfidence(ownership.ownershipPercent?.toString() ?? null, ownership.shareholder.matchConfidence?.toString() ?? null);
    if (confidence >= 0.4) {
      strongOwnerIds.add(linkedCompany.id);
    }
    registerRelation(relations, {
      companyId: linkedCompany.id,
      name: linkedCompany.name,
      orgNumber: linkedCompany.orgNumber,
      aliases: buildCompanyAliases(linkedCompany.name),
      confidence,
      relationType: "OWNER",
    });
  }

  const subsidiaryOwnerships = await prisma.ownership.findMany({
    where: {
      shareholder: {
        linkedCompanyId: companyId,
      },
      companyId: {
        not: companyId,
      },
    },
    include: {
      company: true,
      shareholder: true,
    },
    take: 30,
  });

  for (const ownership of subsidiaryOwnerships) {
    registerRelation(relations, {
      companyId: ownership.company.id,
      name: ownership.company.name,
      orgNumber: ownership.company.orgNumber,
      aliases: buildCompanyAliases(ownership.company.name),
      confidence: computeOwnershipConfidence(ownership.ownershipPercent?.toString() ?? null, ownership.shareholder.matchConfidence?.toString() ?? null),
      relationType: "SUBSIDIARY",
    });
  }

  if (strongOwnerIds.size > 0) {
    const sisterOwnerships = await prisma.ownership.findMany({
      where: {
        shareholder: {
          linkedCompanyId: { in: Array.from(strongOwnerIds) },
        },
        companyId: {
          not: companyId,
        },
      },
      include: {
        company: true,
        shareholder: true,
      },
      take: 40,
    });

    for (const ownership of sisterOwnerships) {
      registerRelation(relations, {
        companyId: ownership.company.id,
        name: ownership.company.name,
        orgNumber: ownership.company.orgNumber,
        aliases: buildCompanyAliases(ownership.company.name),
        confidence: clamp01(
          computeOwnershipConfidence(ownership.ownershipPercent?.toString() ?? null, ownership.shareholder.matchConfidence?.toString() ?? null) * 0.78,
        ),
        relationType: "SISTER",
      });
    }
  }

  const roleOverlap = await buildRoleOverlapRelations(companyId);
  for (const relation of roleOverlap) {
    registerRelation(relations, relation);
  }

  return Array.from(relations.values())
    .filter((relation) => relation.confidence >= 0.18)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 20);
}

async function buildRoleOverlapRelations(companyId: string): Promise<ContextRelation[]> {
  const currentRoles = await prisma.role.findMany({
    where: { companyId },
    select: { personId: true, title: true },
  });
  const personIds = Array.from(new Set(currentRoles.map((role) => role.personId)));
  if (personIds.length === 0) return [];

  const overlappingRoles = await prisma.role.findMany({
    where: {
      personId: { in: personIds },
      companyId: { not: companyId },
    },
    include: {
      company: true,
    },
    take: 50,
  });

  const grouped = new Map<string, { companyId: string; name: string; orgNumber: string; overlapCount: number }>();
  for (const role of overlappingRoles) {
    const key = role.company.id;
    const existing = grouped.get(key);
    if (existing) {
      existing.overlapCount += 1;
      continue;
    }
    grouped.set(key, {
      companyId: role.company.id,
      name: role.company.name,
      orgNumber: role.company.orgNumber,
      overlapCount: 1,
    });
  }

  return Array.from(grouped.values()).map((entry) => ({
    companyId: entry.companyId,
    name: entry.name,
    orgNumber: entry.orgNumber,
    aliases: buildCompanyAliases(entry.name),
    confidence: clamp01(entry.overlapCount * 0.18),
    relationType: "ROLE_OVERLAP",
  }));
}

async function buildPeerCompanies(
  companyId: string,
  status: CompanyStatus,
  industryCode: string | null,
  revenue: number | null,
  employeeCount: number | null,
  regionTokens: string[],
): Promise<PeerCompany[]> {
  if (status !== "ACTIVE" || !industryCode) return [];

  const prefix = getPrimaryIndustryPrefix(industryCode);
  if (!prefix) return [];

  const peerCandidates = await prisma.company.findMany({
    where: {
      id: { not: companyId },
      status: "ACTIVE",
      industryCode: {
        is: {
          code: {
            startsWith: prefix,
          },
        },
      },
    },
    include: {
      industryCode: true,
      addresses: {
        take: 1,
      },
    },
    take: 40,
  });

  return peerCandidates
    .map((company) => ({
      companyId: company.id,
      name: company.name,
      orgNumber: company.orgNumber,
      aliases: buildCompanyAliases(company.name),
      industryPrefix: getPrimaryIndustryPrefix(company.industryCode?.code ?? null),
      confidence: computePeerConfidence(
        revenue,
        employeeCount,
        company.revenue,
        company.employeeCount,
        regionTokens,
        buildRegionTokens(company.addresses.map((address) => ({ city: address.city, region: address.region }))),
      ),
    }))
    .filter((peer) => peer.confidence >= 0.22)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 15);
}

async function buildIpProfile(orgNumber: string) {
  const cached = await readIpPortfolioCache(orgNumber);
  if (!cached) {
    return {
      hasPortfolio: false,
      tokens: [] as string[],
      applicationNumbers: [] as string[],
      ownerNames: [] as string[],
    };
  }

  const tokens = uniqueTokens(
    cached.rights.flatMap((right) => [
      right.title ?? "",
      right.status ?? "",
      right.applicationNumber ?? "",
      ...right.owners.map((owner) => owner.name),
      ...INNOVATION_KEYWORDS,
    ]),
  );

  return {
    hasPortfolio: cached.rights.length > 0,
    tokens,
    applicationNumbers: cached.rights.map((right) => right.applicationNumber ?? "").filter(Boolean),
    ownerNames: cached.rights.flatMap((right) => right.owners.map((owner) => owner.name)),
  };
}

function registerRelation(map: Map<string, ContextRelation>, relation: ContextRelation) {
  const existing = map.get(relation.companyId);
  if (!existing || existing.confidence < relation.confidence) {
    map.set(relation.companyId, relation);
  }
}

function buildCompanyAliases(name: string): string[] {
  const aliases = new Set<string>();
  const trimmed = name.trim();
  if (!trimmed) return [];
  aliases.add(trimmed);

  const stripped = trimmed
    .split(/\s+/)
    .filter((word) => !LEGAL_SUFFIXES.includes(normalizeText(word)))
    .join(" ")
    .trim();

  if (stripped && stripped !== trimmed) aliases.add(stripped);

  const acronym = stripped
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(normalizeText(word)))
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  if (acronym.length >= 2 && acronym.length <= 6) aliases.add(acronym);

  return Array.from(aliases).filter((alias) => alias.trim().length >= 2);
}

function buildWebsiteAliases(website: string | null | undefined) {
  if (!website) return [];

  const normalizedWebsite = website.startsWith("http://") || website.startsWith("https://")
    ? website
    : `https://${website}`;

  try {
    const host = new URL(normalizedWebsite).hostname.replace(/^www\./i, "").trim();
    if (!host) return [];

    const aliases = new Set<string>([host]);
    const hostWithoutTld = host.split(".").slice(0, -1).join(" ").trim();
    if (hostWithoutTld.length >= 2) {
      aliases.add(hostWithoutTld);
      aliases.add(hostWithoutTld.replace(/\s+/g, ""));
    }

    return Array.from(aliases);
  } catch {
    return [];
  }
}

function buildBrandSupportTokens(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object") {
    return [];
  }

  const payload = rawPayload as Record<string, unknown>;
  const candidateValues = [
    ...(Array.isArray(payload.aktivitet) ? payload.aktivitet.map((value) => String(value)) : []),
    ...(Array.isArray(payload.vedtektsfestetFormaal) ? payload.vedtektsfestetFormaal.map((value) => String(value)) : []),
  ];

  return Array.from(
    new Set([
      ...uniqueTokens(candidateValues),
      "bedrift",
      "bedrifter",
      "kreditt",
      "forvalt",
      "leverandor",
      "leverandorer",
      "naeringsliv",
      "selskaper",
    ]),
  ).slice(0, 40);
}

function buildRegionTokens(addresses: Array<{ city: string; region?: string | null }>) {
  return uniqueTokens(addresses.flatMap((address) => [address.city, address.region ?? ""]));
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueTokens(values: string[]) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => normalizeText(value).split(" "))
        .filter((token) => token.length >= 4 && !STOPWORDS.has(token)),
    ),
  ).slice(0, 120);
}

function extractParentCode(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  if ("parentCode" in rawPayload && typeof rawPayload.parentCode === "string" && rawPayload.parentCode.trim()) {
    return rawPayload.parentCode.trim();
  }
  return null;
}

function getPrimaryIndustryPrefix(code: string | null) {
  const cleaned = (code ?? "").replace(/\D/g, "");
  return cleaned.length >= 2 ? cleaned.slice(0, 2) : null;
}

function computeOwnershipConfidence(ownershipPercent: string | null, matchConfidence: string | null) {
  const ownership = ownershipPercent ? Number(ownershipPercent) : null;
  const match = matchConfidence ? Number(matchConfidence) : null;
  const ownershipWeight = ownership !== null && !Number.isNaN(ownership) ? Math.min(ownership / 100, 0.85) : 0.28;
  const matchWeight = match !== null && !Number.isNaN(match) ? Math.min(match, 1) * 0.35 : 0.18;
  return clamp01(ownershipWeight + matchWeight);
}

function computePeerConfidence(
  baseRevenue: number | null,
  baseEmployees: number | null,
  peerRevenue: number | null,
  peerEmployees: number | null,
  baseRegions: string[],
  peerRegions: string[],
) {
  let score = 0.32;
  if (baseRevenue && peerRevenue) {
    const ratio = Math.min(baseRevenue, peerRevenue) / Math.max(baseRevenue, peerRevenue);
    score += ratio * 0.28;
  }
  if (baseEmployees && peerEmployees) {
    const ratio = Math.min(baseEmployees, peerEmployees) / Math.max(baseEmployees, peerEmployees);
    score += ratio * 0.2;
  }
  if (baseRegions.some((region) => peerRegions.includes(region))) {
    score += 0.08;
  }
  return clamp01(score);
}

function scoreTermMentions(title: string, summary: string, terms: string[]) {
  const matches = findMatchingTerms(title, summary, terms);
  return clamp01(
    matches.titleMatches.length * 0.35 +
      matches.summaryMatches.length * 0.18 +
      (matches.orgNumberMatch ? 0.35 : 0),
  );
}

function scoreRelationMentions(text: string, relations: ContextRelation[]) {
  return clamp01(
    relations
      .map((relation) => {
        const terms = [relation.name, relation.orgNumber, ...relation.aliases];
        return terms.some((term) => containsPhrase(text, normalizeText(term))) ? relation.confidence : 0;
      })
      .reduce((sum, value) => sum + value, 0) * 0.45,
  );
}

function scorePeerMentions(text: string, peers: PeerCompany[]) {
  return clamp01(
    peers
      .map((peer) => {
        const terms = [peer.name, peer.orgNumber, ...peer.aliases];
        return terms.some((term) => containsPhrase(text, normalizeText(term))) ? peer.confidence : 0;
      })
      .reduce((sum, value) => sum + value, 0) * 0.4,
  );
}

function scoreTokenHits(title: string, summary: string, sectorTokens: string[], parentTokens: string[]) {
  const sectorHits = findTokenMatches(title, summary, sectorTokens);
  const parentHits = findTokenMatches(title, summary, parentTokens);
  return clamp01(sectorHits.length * 0.07 + parentHits.length * 0.04);
}

function scoreIpMentions(text: string, tokens: string[], applicationNumbers: string[]) {
  const tokenHits = tokens.some((token) => containsPhrase(text, normalizeText(token))) ? 0.24 : 0;
  const applicationHit = applicationNumbers.some((number) => number && containsPhrase(text, normalizeText(number))) ? 0.3 : 0;
  const innovationHit = INNOVATION_KEYWORDS.some((token) => containsPhrase(text, normalizeText(token))) ? 0.12 : 0;
  return clamp01(tokenHits + applicationHit + innovationHit);
}

function findMatchingTerms(title: string, summary: string, rawTerms: string[]) {
  const titleMatches: string[] = [];
  const summaryMatches: string[] = [];
  let orgNumberMatch = false;

  for (const rawTerm of rawTerms) {
    const term = normalizeText(rawTerm);
    if (!term) continue;
    if (/^\d{9}$/.test(term)) {
      if (containsPhrase(title, term) || containsPhrase(summary, term)) orgNumberMatch = true;
      continue;
    }
    if (containsPhrase(title, term)) titleMatches.push(rawTerm);
    if (containsPhrase(summary, term)) summaryMatches.push(rawTerm);
  }

  return {
    titleMatches: Array.from(new Set(titleMatches)),
    summaryMatches: Array.from(new Set(summaryMatches)),
    allMatches: Array.from(new Set([...titleMatches, ...summaryMatches])),
    orgNumberMatch,
  };
}

function findRelationMatches(text: string, relations: ContextRelation[]) {
  return relations.flatMap((relation) => {
    const terms = [relation.name, relation.orgNumber, ...relation.aliases].map(normalizeText).filter(Boolean);
    const titleLike = terms.some((term) => containsPhrase(text, term));
    return titleLike
      ? [
          {
            name: relation.name,
            relationType: relation.relationType,
            confidence: relation.confidence,
            inTitle: containsPhrase(text.split(" ").slice(0, 24).join(" "), normalizeText(relation.name)),
          },
        ]
      : [];
  });
}

function findPeerMatches(text: string, peers: PeerCompany[]) {
  return peers.flatMap((peer) => {
    const terms = [peer.name, peer.orgNumber, ...peer.aliases].map(normalizeText).filter(Boolean);
    return terms.some((term) => containsPhrase(text, term))
      ? [
          {
            name: peer.name,
            confidence: peer.confidence,
            inTitle: containsPhrase(text.split(" ").slice(0, 24).join(" "), normalizeText(peer.name)),
          },
        ]
      : [];
  });
}

function findTokenMatches(title: string, summary: string, tokens: string[]) {
  const normalizedTokens = tokens.map(normalizeText).filter((token) => token.length >= 4);
  return Array.from(
    new Set(
      normalizedTokens.filter((token) => containsPhrase(title, token) || containsPhrase(summary, token)),
    ),
  ).slice(0, 12);
}

function detectMacroThemes(text: string) {
  return MACRO_THEMES.flatMap((theme) => {
    const hits = theme.keywords.filter((keyword) => containsPhrase(text, normalizeText(keyword)));
    if (hits.length === 0) return [];
    return [
      {
        id: theme.id,
        label: theme.label,
        strength: clamp01(hits.length * 0.34),
      },
    ];
  });
}

function getMacroIndustryFit(themeId: string, industryPrefixes: string[], industryScore: number) {
  const theme = MACRO_THEMES.find((item) => item.id === themeId);
  if (!theme) return 0.65;
  if (!theme.favoredIndustryPrefixes || theme.favoredIndustryPrefixes.length === 0) {
    return industryScore >= 0.1 ? 0.9 : 0.7;
  }
  return industryPrefixes.some((prefix) => theme.favoredIndustryPrefixes?.includes(prefix))
    ? 1
    : industryScore >= 0.14
      ? 0.75
      : 0.45;
}

function isMacroSupportedForCompany(
  themeId: string,
  industryPrefixes: string[],
  industryScore: number,
  hasContextSupport: boolean,
) {
  const theme = MACRO_THEMES.find((item) => item.id === themeId);
  if (!theme) return hasContextSupport;

  if (theme.standaloneScope === "global") {
    return true;
  }

  const matchesFavoredIndustry = industryPrefixes.some((prefix) =>
    theme.favoredIndustryPrefixes?.includes(prefix),
  );

  if (theme.standaloneScope === "industry") {
    return matchesFavoredIndustry || industryScore >= 0.14 || hasContextSupport;
  }

  return hasContextSupport;
}

function computeFreshnessScore(publishedAt: Date | null) {
  if (!publishedAt) return 0.15;
  const ageHours = Math.max((Date.now() - publishedAt.getTime()) / 3_600_000, 0);
  if (ageHours <= 6) return 1;
  if (ageHours <= 24) return 0.82;
  if (ageHours <= 72) return 0.6;
  if (ageHours <= 168) return 0.4;
  return 0.2;
}

function computeAmbiguityPenalty(
  companyName: string,
  aliasMatches: string[],
  directMentionScore: number,
  groupScore: number,
  industryScore: number,
  ipScore: number,
) {
  const normalizedName = normalizeText(companyName);
  const nameTokens = normalizedName.split(" ").filter(Boolean);
  const shortSingleName = nameTokens.length === 1 && normalizedName.length <= 5;
  const genericAliasHit = aliasMatches.some((alias) => {
    const normalizedAlias = normalizeText(alias);
    return normalizedAlias.length <= 4 || STOPWORDS.has(normalizedAlias);
  });

  let penalty = 0;
  if (shortSingleName) penalty += 0.18;
  if (genericAliasHit) penalty += 0.14;
  if (directMentionScore < 0.22 && groupScore < 0.18 && ipScore < 0.18 && industryScore < 0.12) penalty += 0.08;
  return clamp01(penalty);
}

function derivePrimaryType(featureSet: NewsFeatureSet): PrimaryRelevanceType {
  const candidates: Array<{ type: PrimaryRelevanceType; score: number }> = [
    { type: "direct", score: featureSet.directMentionScore + featureSet.aliasMentionScore * 0.7 },
    { type: "group", score: featureSet.groupScore },
    { type: "peer", score: featureSet.peerScore },
    { type: "industry", score: featureSet.industryScore },
    { type: "macro", score: featureSet.macroScore },
    { type: "ip", score: featureSet.ipScore },
  ];
  return candidates.sort((left, right) => right.score - left.score)[0]?.type ?? "direct";
}

function deriveReasonLabels(featureSet: NewsFeatureSet) {
  const reasons: string[] = [];
  if (featureSet.directMentionScore >= 0.28 || featureSet.aliasMentionScore >= 0.2) reasons.push("Direkte omtale");
  if (featureSet.groupScore >= 0.18) reasons.push("Konsernrelatert");
  if (featureSet.peerScore >= 0.18) reasons.push("Konkurrent");
  if (featureSet.industryScore >= 0.16) reasons.push("Bransjerelevant");
  if (featureSet.macroScore >= 0.12) reasons.push("Makro");
  if (featureSet.ipScore >= 0.18) reasons.push("Patent/innovasjon");
  return reasons;
}

function buildReasoning(primaryType: PrimaryRelevanceType, featureSet: NewsFeatureSet) {
  switch (primaryType) {
    case "direct":
      return featureSet.evidence.directMatches.length > 0
        ? `Treffer på ${featureSet.evidence.directMatches[0]} i artikkelen.`
        : "Selskapet omtales direkte i artikkelen.";
    case "group":
      return featureSet.evidence.groupMatches.length > 0
        ? `Treffer på konsernrelasjon via ${featureSet.evidence.groupMatches[0]?.name}.`
        : "Artikkelen er relevant via konsernrelasjon.";
    case "peer":
      return featureSet.evidence.peerMatches.length > 0
        ? `Treffer på konkurrent ${featureSet.evidence.peerMatches[0]}.`
        : "Artikkelen er relevant via konkurrentsignal.";
    case "industry":
      return featureSet.evidence.industryMatches.length > 0
        ? `Treffer bransjesignal som ${featureSet.evidence.industryMatches[0]}.`
        : "Artikkelen vurderes som bransjerelevant.";
    case "macro":
      return featureSet.evidence.macroThemes.length > 0
        ? `Makrotema: ${featureSet.evidence.macroThemes[0]}.`
        : "Artikkelen vurderes som makrorelevant.";
    case "ip":
      return featureSet.evidence.ipMatches.length > 0 || featureSet.evidence.innovationMatches.length > 0
        ? `Treffer patent- eller innovasjonssignal som ${
            featureSet.evidence.ipMatches[0] ?? featureSet.evidence.innovationMatches[0]
          }.`
        : "Artikkelen vurderes som patent- eller innovasjonsrelevant.";
    default:
      return null;
  }
}

function containsPhrase(text: string, phrase: string) {
  if (!text || !phrase) return false;
  if (text === phrase) return true;
  return new RegExp(`(^|\\s)${escapeRegExp(phrase)}($|\\s)`).test(text);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export const __testables = {
  buildCompanyAliases,
  normalizeText,
  containsPhrase,
  detectMacroThemes,
  generateNewsCandidates,
  extractNewsFeatures,
  scoreNewsFeatures,
  computeAmbiguityPenalty,
  computePeerConfidence,
  computeOwnershipConfidence,
};
