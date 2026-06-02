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

function addToIndex(index: Map<string, Set<string>>, key: string, companyId: string) {
  const normalized = normalizeCompanyName(key);
  if (!normalized) return;
  const values = index.get(normalized) ?? new Set<string>();
  values.add(companyId);
  index.set(normalized, values);
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

  for (const [alias, companyIds] of index.aliasToCompanyIds.entries()) {
    if (alias.length >= 3 && normalized.includes(alias)) {
      for (const companyId of companyIds) candidates.add(companyId);
    }
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
