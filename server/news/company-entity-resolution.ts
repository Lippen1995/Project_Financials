import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizeCompanyName } from "@/server/news/company-alias-service";
import {
  buildEntityIndex,
  getCandidateCompanyIdsFromText,
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

function locationText(document: SourceDocumentForEntityResolution, location: EntityMatchEvidence["location"]) {
  if (location === "title") return document.title;
  if (location === "summary") return document.summary ?? "";
  if (location === "body") return document.bodyText ?? "";
  return JSON.stringify(document.sourcePayload ?? {});
}

function containsNormalizedText(haystack: string, needle: string) {
  const normalizedHaystack = ` ${normalizeCompanyName(haystack)} `;
  const normalizedNeedle = ` ${normalizeCompanyName(needle)} `;
  return normalizedHaystack.includes(normalizedNeedle);
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
  const matchedTitle = company.significantTokens.filter((token) => title.includes(token));
  const matchedSummary = company.significantTokens.filter((token) => summary.includes(token));
  const matchedBody = company.significantTokens.filter((token) => body.includes(token));

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

function lowSignalPenalty(company: CompanyEntityIndexEntry, evidence: EntityMatchEvidence[]) {
  let penalty = 0;
  if (company.weakName) penalty += 0.22;
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

  const rawScore = evidence.reduce((score, item, index) => score + item.score * (index === 0 ? 1 : 0.35), 0);
  const penalty = lowSignalPenalty(company, evidence);
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
  const candidateIds = getCandidateCompanyIdsFromText(index, text);

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
  threshold?: number;
} = {}) {
  const [documents, companies] = await Promise.all([
    prisma.sourceDocument.findMany({
      orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
      take: options.limit ?? 100,
    }),
    prisma.company.findMany({
      select: {
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
      },
      take: options.companyLimit ?? 25_000,
    }),
  ]);

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
