import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizeCompanyName, stripLegalSuffix } from "@/server/news/company-alias-service";
import {
  buildEntityIndex,
  getCandidateCompanyIdsFromText,
  normalizedPhraseMatches,
  type CompanyEntityIndex,
  type CompanyEntityIndexCompany,
  type CompanyEntityIndexEntry,
} from "@/server/news/company-entity-index";
import { createNewsSignal } from "@/server/news/company-event-repository";

export type EntityMatchEvidence = {
  kind: string;
  value: string;
  score: number;
  location: "title" | "summary" | "body" | "metadata";
  excerpt?: string;
};

export type CompanyEntityMatch = {
  companyId: string;
  entityConfidence: number;
  evidence: EntityMatchEvidence[];
  mentionContext: "headline" | "summary" | "body" | "metadata" | "mixed";
  lowSignalPenalty: number;
};

export type SourceDocumentForEntityResolution = {
  id: string;
  sourceId?: string;
  title: string;
  summary?: string | null;
  bodyText?: string | null;
  canonicalUrl?: string | null;
  originalUrl?: string | null;
  sourcePayload?: unknown;
};

export type FindCompanyMatchesOptions = {
  threshold?: number;
  maxMatches?: number;
  index?: CompanyEntityIndex;
};

export type PersistCompanyMentionSignalsOptions = FindCompanyMatchesOptions & {
  detectorVersion?: string;
};

const DEFAULT_THRESHOLD = 0.55;
const DEFAULT_MAX_MATCHES = 10;
const DEFAULT_BASELINE_COMPANY_LIMIT = 25_000;
const DEFAULT_TARGETED_COMPANY_LIMIT = 5_000;
const MAX_NAME_HINTS = 80;
const LEGAL_SUFFIX_PATTERN = /\b(?:as|asa|nuf|sa|ba|ans|da|kf|iks|fkf|plc|ltd|limited|inc|corp|corporation)\b/i;
const ORG_NUMBER_PATTERN = /\b\d{9}\b/g;
const NORWEGIAN_COMPANY_EDITORIAL_SOURCE_IDS = new Set(["e24", "dn", "finansavisen", "kapital"]);
const companyEntitySelect = {
  id: true,
  name: true,
  orgNumber: true,
  slug: true,
  website: true,
  legalForm: true,
  status: true,
  industryCode: {
    select: { code: true, title: true },
  },
} satisfies Prisma.CompanySelect;

function locationText(document: SourceDocumentForEntityResolution, location: EntityMatchEvidence["location"]) {
  if (location === "title") return document.title;
  if (location === "summary") return document.summary ?? "";
  if (location === "body") return document.bodyText ?? "";
  return JSON.stringify(document.sourcePayload ?? {});
}

function containsNormalizedText(haystack: string, needle: string) {
  return normalizedPhraseMatches(normalizeCompanyName(haystack), normalizeCompanyName(needle));
}

function evidenceExcerpt(text: string, value: string) {
  const lower = text.toLowerCase();
  const index = lower.indexOf(value.toLowerCase());
  if (index < 0) return text.slice(0, 180);
  return text.slice(Math.max(0, index - 70), Math.min(text.length, index + value.length + 70)).trim();
}

function domainFromUrl(url?: string | null) {
  if (!url) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function sourceMetadataText(document: SourceDocumentForEntityResolution) {
  return [document.canonicalUrl, document.originalUrl, JSON.stringify(document.sourcePayload ?? {})].filter(Boolean).join(" ");
}

function uniqueByNormalized(values: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const normalized = normalizeCompanyName(trimmed);
    if (!trimmed || !normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(trimmed);
  }
  return unique;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function structuredCompanyCandidateIds(document: SourceDocumentForEntityResolution, index: CompanyEntityIndex) {
  const payload = asRecord(document.sourcePayload);
  const companyId = typeof payload.companyId === "string" ? payload.companyId : null;
  if (companyId && index.byCompanyId.has(companyId)) {
    return new Set([companyId]);
  }

  const orgNumber = typeof payload.orgNumber === "string"
    ? payload.orgNumber.match(ORG_NUMBER_PATTERN)?.[0] ?? null
    : null;
  const orgNumberCompanyId = orgNumber ? index.orgNumberToCompanyId.get(orgNumber) : null;
  return orgNumberCompanyId ? new Set([orgNumberCompanyId]) : null;
}

function collectPayloadHints(value: unknown, depth = 0): { names: string[]; orgNumbers: string[] } {
  if (depth > 2) return { names: [], orgNumbers: [] };
  const object = asRecord(value);
  const names: string[] = [];
  const orgNumbers: string[] = [];

  for (const [rawKey, rawValue] of Object.entries(object)) {
    const key = normalizeCompanyName(rawKey);
    if (typeof rawValue === "string") {
      if (["issuername", "companyname", "foretaksnavn", "utsteder", "navn"].includes(key)) {
        names.push(rawValue);
      }
      if (["orgnumber", "organizationnumber", "organisasjonsnummer", "orgnr"].includes(key)) {
        orgNumbers.push(...(rawValue.match(ORG_NUMBER_PATTERN) ?? []));
      }
    } else if (rawValue && typeof rawValue === "object") {
      const nested = collectPayloadHints(rawValue, depth + 1);
      names.push(...nested.names);
      orgNumbers.push(...nested.orgNumbers);
    }
  }

  return { names, orgNumbers };
}

function titleIssuerNameHints(title: string) {
  const [prefix] = title.split(/\s[:|]\s|[:|]|\s-\s|\s\u2013\s|\s\u2014\s/);
  const cleaned = prefix
    ?.replace(/^\[[^\]]+\]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 3 || cleaned.length > 120) return [];
  if (!LEGAL_SUFFIX_PATTERN.test(cleaned)) return [];
  return [cleaned];
}

export function extractCompanyEntityHints(documents: SourceDocumentForEntityResolution[]) {
  const titleText = documents.map((document) => document.title).join(" ");
  const metadataText = documents.map(sourceMetadataText).join(" ");
  const orgNumbers = new Set<string>([...(titleText.match(ORG_NUMBER_PATTERN) ?? []), ...(metadataText.match(ORG_NUMBER_PATTERN) ?? [])]);
  const names: string[] = [];

  for (const document of documents) {
    names.push(...titleIssuerNameHints(document.title));
    const payloadHints = collectPayloadHints(document.sourcePayload);
    names.push(...payloadHints.names);
    for (const orgNumber of payloadHints.orgNumbers) orgNumbers.add(orgNumber);
  }

  return {
    orgNumbers: [...orgNumbers],
    issuerNames: uniqueByNormalized(names),
  };
}

async function loadCompanyCandidatesForEntityResolution(
  documents: SourceDocumentForEntityResolution[],
  options: { companyLimit?: number; targetedCompanyLimit?: number } = {},
) {
  const hints = extractCompanyEntityHints(documents);
  const targetedWhere: Prisma.CompanyWhereInput[] = [];
  if (hints.orgNumbers.length > 0) {
    targetedWhere.push({ orgNumber: { in: hints.orgNumbers } });
  }
  for (const issuerName of hints.issuerNames.slice(0, MAX_NAME_HINTS)) {
    targetedWhere.push({ name: { equals: issuerName, mode: "insensitive" } });
  }

  const targetedCompanies =
    targetedWhere.length === 0
      ? []
      : await prisma.company.findMany({
          where: { OR: targetedWhere },
          select: companyEntitySelect,
          take: options.targetedCompanyLimit ?? DEFAULT_TARGETED_COMPANY_LIMIT,
        });

  const baselineCompanies = await prisma.company.findMany({
    select: companyEntitySelect,
    orderBy: [{ updatedAt: "desc" }],
    take: options.companyLimit ?? DEFAULT_BASELINE_COMPANY_LIMIT,
  });

  const byId = new Map<string, CompanyEntityIndexCompany>();
  for (const company of [...targetedCompanies, ...baselineCompanies]) {
    byId.set(company.id, company);
  }
  return [...byId.values()];
}

function scoreAliasEvidence(company: CompanyEntityIndexEntry, document: SourceDocumentForEntityResolution) {
  const evidence: EntityMatchEvidence[] = [];
  const locations: Array<EntityMatchEvidence["location"]> = ["title", "summary", "body"];

  for (const alias of company.aliases) {
    if (alias.length < 3) continue;
    for (const location of locations) {
      const text = locationText(document, location);
      if (!text || !containsNormalizedText(text, alias)) continue;
      const exactName = normalizeCompanyName(alias) === company.normalizedName;
      evidence.push({
        kind: exactName ? `exact_name_${location}` : `alias_${location}`,
        value: alias,
        score: exactName ? (location === "title" ? 0.72 : location === "summary" ? 0.62 : 0.38) : location === "title" ? 0.6 : location === "summary" ? 0.5 : 0.28,
        location,
        excerpt: evidenceExcerpt(text, alias),
      });
    }
  }

  return evidence;
}

function scoreOrgNumberEvidence(company: CompanyEntityIndexEntry, document: SourceDocumentForEntityResolution) {
  const text = [document.title, document.summary, document.bodyText, sourceMetadataText(document)].filter(Boolean).join(" ");
  return text.includes(company.orgNumber)
    ? [
        {
          kind: "org_number",
          value: company.orgNumber,
          score: 0.95,
          location: "metadata" as const,
          excerpt: company.orgNumber,
        },
      ]
    : [];
}

function scoreDomainEvidence(company: CompanyEntityIndexEntry, document: SourceDocumentForEntityResolution) {
  const companyDomain = domainFromUrl(company.website);
  if (!companyDomain) return [];
  const metadata = sourceMetadataText(document).toLowerCase();
  if (!metadata.includes(companyDomain)) return [];

  return [
    {
      kind: "domain",
      value: companyDomain,
      score: 0.82,
      location: "metadata" as const,
      excerpt: companyDomain,
    },
  ];
}

function scoreTokenEvidence(company: CompanyEntityIndexEntry, document: SourceDocumentForEntityResolution) {
  const evidence: EntityMatchEvidence[] = [];
  const title = normalizeCompanyName(document.title);
  const summary = normalizeCompanyName(document.summary ?? "");
  const body = normalizeCompanyName(document.bodyText ?? "");
  const matchedTitle = company.significantTokens.filter((token) => normalizedPhraseMatches(title, token));
  const matchedSummary = company.significantTokens.filter((token) => normalizedPhraseMatches(summary, token));
  const matchedBody = company.significantTokens.filter((token) => normalizedPhraseMatches(body, token));

  if (company.significantTokens.length >= 2 && matchedTitle.length >= 2) {
    evidence.push({
      kind: "significant_token_match",
      value: matchedTitle.join(" "),
      score: 0.56,
      location: "title",
    });
  } else if (company.significantTokens.length >= 2 && matchedSummary.length >= 2) {
    evidence.push({
      kind: "significant_token_match",
      value: matchedSummary.join(" "),
      score: 0.4,
      location: "summary",
    });
  } else if (company.significantTokens.length >= 2 && matchedBody.length >= 2) {
    evidence.push({
      kind: "significant_token_match",
      value: matchedBody.join(" "),
      score: 0.22,
      location: "body",
    });
  }

  return evidence;
}

function mentionContext(evidence: EntityMatchEvidence[]): CompanyEntityMatch["mentionContext"] {
  const locations = new Set(evidence.map((item) => item.location));
  if (locations.has("title")) return locations.size === 1 ? "headline" : "mixed";
  if (locations.has("summary")) return locations.size === 1 ? "summary" : "mixed";
  if (locations.has("body")) return locations.size === 1 ? "body" : "mixed";
  return "metadata";
}

function hasLeadingTitleAlias(
  document: SourceDocumentForEntityResolution,
  evidence: EntityMatchEvidence[],
) {
  const normalizedTitle = normalizeCompanyName(document.title);
  return evidence.some((item) => {
    if (item.location !== "title" || !item.kind.startsWith("alias_")) return false;
    const normalizedAlias = normalizeCompanyName(item.value);
    return normalizedTitle === normalizedAlias || normalizedTitle.startsWith(`${normalizedAlias} `);
  });
}

function hasUnambiguousIdentityEvidence(evidence: EntityMatchEvidence[]) {
  return evidence.some(
    (item) =>
      item.kind === "org_number" ||
      item.kind === "domain" ||
      item.kind.startsWith("exact_name_"),
  );
}

function hasInstitutionalNameCollision(
  company: CompanyEntityIndexEntry,
  document: SourceDocumentForEntityResolution,
  evidence: EntityMatchEvidence[],
) {
  if (hasUnambiguousIdentityEvidence(evidence)) return false;
  const brand = normalizeCompanyName(stripLegalSuffix(company.name));
  if (!brand || brand.includes(" ")) return false;
  const text = normalizeCompanyName(
    [document.title, document.summary, document.bodyText].filter(Boolean).join(" "),
  );
  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    new RegExp(`\\bdepartment of ${escaped}\\b`),
    new RegExp(`\\b${escaped} department\\b`),
    new RegExp(`\\bministry of ${escaped}\\b`),
    new RegExp(`\\bchamber of ${escaped}\\b`),
    new RegExp(`\\bsecretary of ${escaped}\\b`),
    new RegExp(`\\bminister of ${escaped}\\b`),
  ].some((pattern) => pattern.test(text));
}

function lowSignalPenalty(
  company: CompanyEntityIndexEntry,
  evidence: EntityMatchEvidence[],
  document: SourceDocumentForEntityResolution,
) {
  let penalty = 0;
  if (company.weakName) penalty += 0.22;
  if (
    company.significantTokens.length === 1 &&
    !hasUnambiguousIdentityEvidence(evidence) &&
    (!domainFromUrl(company.website) || !hasLeadingTitleAlias(document, evidence)) &&
    !NORWEGIAN_COMPANY_EDITORIAL_SOURCE_IDS.has(document.sourceId ?? "")
  ) {
    penalty += 0.32;
  }
  if (evidence.length === 1 && evidence[0].location === "body") penalty += 0.22;
  if (evidence.every((item) => item.kind === "significant_token_match")) penalty += 0.08;
  return penalty;
}

export function scoreCompanyDocumentMatch(
  company: CompanyEntityIndexEntry,
  document: SourceDocumentForEntityResolution,
): CompanyEntityMatch | null {
  const evidence = [
    ...scoreOrgNumberEvidence(company, document),
    ...scoreDomainEvidence(company, document),
    ...scoreAliasEvidence(company, document),
    ...scoreTokenEvidence(company, document),
  ].sort((a, b) => b.score - a.score);

  if (evidence.length === 0) return null;
  if (hasInstitutionalNameCollision(company, document, evidence)) return null;

  const rawScore = evidence.reduce((score, item, index) => score + item.score * (index === 0 ? 1 : 0.35), 0);
  const penalty = lowSignalPenalty(company, evidence, document);
  const entityConfidence = Math.max(0, Math.min(1, rawScore - penalty));

  return {
    companyId: company.id,
    entityConfidence,
    evidence,
    mentionContext: mentionContext(evidence),
    lowSignalPenalty: penalty,
  };
}

export function findCompanyMatchesForDocument(
  document: SourceDocumentForEntityResolution,
  companies: CompanyEntityIndexCompany[],
  options: FindCompanyMatchesOptions = {},
) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const index = options.index ?? buildEntityIndex(companies);
  const text = [document.title, document.summary, document.bodyText, sourceMetadataText(document)].filter(Boolean).join(" ");
  const candidateIds = structuredCompanyCandidateIds(document, index) ?? getCandidateCompanyIdsFromText(index, text);

  return [...candidateIds]
    .flatMap((companyId) => {
      const company = index.byCompanyId.get(companyId);
      if (!company) return [];
      const match = scoreCompanyDocumentMatch(company, document);
      return match && match.entityConfidence >= threshold ? [match] : [];
    })
    .sort((a, b) => b.entityConfidence - a.entityConfidence)
    .slice(0, options.maxMatches ?? DEFAULT_MAX_MATCHES);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function persistCompanyMentionSignals(
  document: SourceDocumentForEntityResolution,
  companies: CompanyEntityIndexCompany[],
  options: PersistCompanyMentionSignalsOptions = {},
) {
  const matches = findCompanyMatchesForDocument(document, companies, options);

  for (const match of matches) {
    await createNewsSignal({
      documentId: document.id,
      companyId: match.companyId,
      signalType: "company_mention",
      subtype: match.mentionContext,
      confidence: match.entityConfidence,
      strength: Math.max(...match.evidence.map((item) => item.score)),
      valueScore: match.entityConfidence,
      keywords: match.evidence.map((item) => item.value).slice(0, 8),
      evidence: toJson({
        evidence: match.evidence,
        lowSignalPenalty: match.lowSignalPenalty,
        mentionContext: match.mentionContext,
      }),
      detectorVersion: options.detectorVersion ?? "company-entity-resolution-v1",
    });
  }

  return matches;
}

export async function resolveCompanyEntitiesForRecentDocuments(options: {
  limit?: number;
  companyLimit?: number;
  targetedCompanyLimit?: number;
  threshold?: number;
  sourceIds?: string[];
} = {}) {
  const documents = await prisma.sourceDocument.findMany({
    where: options.sourceIds?.length ? { sourceId: { in: options.sourceIds } } : undefined,
    orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
    take: options.limit ?? 100,
  });
  const companies = await loadCompanyCandidatesForEntityResolution(documents, {
    companyLimit: options.companyLimit,
    targetedCompanyLimit: options.targetedCompanyLimit,
  });

  let documentsProcessed = 0;
  let signalsCreated = 0;
  const index = buildEntityIndex(companies);

  for (const document of documents) {
    documentsProcessed += 1;
    const matches = await persistCompanyMentionSignals(document, companies, {
      threshold: options.threshold,
      index,
    });
    signalsCreated += matches.length;
  }

  return {
    documentsProcessed,
    signalsCreated,
  };
}
