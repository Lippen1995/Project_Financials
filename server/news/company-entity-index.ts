import {
  buildCompanyAliases,
  isCommonOrWeakCompanyName,
  normalizeCompanyName,
  significantCompanyTokens,
} from "@/server/news/company-alias-service";

export type CompanyEntityIndexCompany = {
  id: string;
  name: string;
  orgNumber: string;
  slug?: string | null;
  website?: string | null;
  legalForm?: string | null;
  industryCode?: { code: string; title?: string | null } | null;
  status?: string | null;
};

export type CompanyEntityIndexEntry = CompanyEntityIndexCompany & {
  normalizedName: string;
  aliases: string[];
  significantTokens: string[];
  weakName: boolean;
};

export type CompanyEntityIndex = {
  entries: CompanyEntityIndexEntry[];
  byCompanyId: Map<string, CompanyEntityIndexEntry>;
  aliasToCompanyIds: Map<string, Set<string>>;
  tokenToCompanyIds: Map<string, Set<string>>;
  orgNumberToCompanyId: Map<string, string>;
};

const MAX_ALIAS_SCAN_TOKENS = 2_500;
const MAX_ALIAS_NGRAM_TOKENS = 8;

function addToIndex(index: Map<string, Set<string>>, key: string, companyId: string) {
  const normalized = normalizeCompanyName(key);
  if (!normalized) return;
  const values = index.get(normalized) ?? new Set<string>();
  values.add(companyId);
  index.set(normalized, values);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizedPhraseMatches(normalizedText: string, normalizedPhrase: string) {
  if (!normalizedText || !normalizedPhrase) return false;
  const phrasePattern = escapeRegex(normalizedPhrase).replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${phrasePattern}([^\\p{L}\\p{N}]|$)`, "u").test(normalizedText);
}

function candidateAliasKeys(normalizedText: string) {
  const tokens = normalizedText.split(" ").filter(Boolean).slice(0, MAX_ALIAS_SCAN_TOKENS);
  const keys = new Set<string>();

  for (let index = 0; index < tokens.length; index += 1) {
    const maxLength = Math.min(MAX_ALIAS_NGRAM_TOKENS, tokens.length - index);
    for (let length = 1; length <= maxLength; length += 1) {
      keys.add(tokens.slice(index, index + length).join(" "));
    }
  }

  return keys;
}

export function buildEntityIndex(companies: CompanyEntityIndexCompany[]): CompanyEntityIndex {
  const entries = companies.map<CompanyEntityIndexEntry>((company) => ({
    ...company,
    normalizedName: normalizeCompanyName(company.name),
    aliases: buildCompanyAliases(company),
    significantTokens: significantCompanyTokens(company),
    weakName: isCommonOrWeakCompanyName(company.name),
  }));

  const byCompanyId = new Map<string, CompanyEntityIndexEntry>();
  const aliasToCompanyIds = new Map<string, Set<string>>();
  const tokenToCompanyIds = new Map<string, Set<string>>();
  const orgNumberToCompanyId = new Map<string, string>();

  for (const entry of entries) {
    byCompanyId.set(entry.id, entry);
    orgNumberToCompanyId.set(entry.orgNumber, entry.id);

    for (const alias of entry.aliases) {
      addToIndex(aliasToCompanyIds, alias, entry.id);
    }

    for (const token of entry.significantTokens) {
      addToIndex(tokenToCompanyIds, token, entry.id);
    }
  }

  return {
    entries,
    byCompanyId,
    aliasToCompanyIds,
    tokenToCompanyIds,
    orgNumberToCompanyId,
  };
}

export function getCandidateCompanyIdsFromText(index: CompanyEntityIndex, text: string) {
  const normalized = normalizeCompanyName(text);
  const candidates = new Set<string>();

  for (const alias of candidateAliasKeys(normalized)) {
    if (alias.length < 3) continue;
    const companyIds = index.aliasToCompanyIds.get(alias);
    if (!companyIds) continue;
    for (const companyId of companyIds) candidates.add(companyId);
  }

  for (const token of normalized.split(" ")) {
    const companyIds = index.tokenToCompanyIds.get(token);
    if (!companyIds) continue;
    for (const companyId of companyIds) candidates.add(companyId);
  }

  for (const [orgNumber, companyId] of index.orgNumberToCompanyId.entries()) {
    if (text.includes(orgNumber)) candidates.add(companyId);
  }

  return candidates;
}
