export type CompanyAliasInput = {
  name: string;
  orgNumber?: string | null;
  slug?: string | null;
  website?: string | null;
  legalForm?: string | null;
};

const LEGAL_SUFFIXES = new Set([
  "as",
  "asa",
  "ans",
  "da",
  "ba",
  "sa",
  "nuf",
  "enk",
  "kf",
  "iks",
  "fkf",
  "limited",
  "ltd",
  "inc",
  "corp",
  "corporation",
]);

const COMMON_COMPANY_WORDS = new Set([
  "company",
  "group",
  "holding",
  "holdings",
  "invest",
  "investment",
  "ventures",
  "capital",
  "norge",
  "norway",
  "norsk",
]);

export function normalizeCompanyName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00e6/gi, "ae")
    .replace(/\u00f8/gi, "o")
    .replace(/\u00e5/gi, "a")
    .replace(/æ/gi, "ae")
    .replace(/ø/gi, "o")
    .replace(/å/gi, "a")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s&.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeCompanyName(name: string) {
  return normalizeCompanyName(name)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

export function stripLegalSuffix(name: string): string {
  const tokens = tokenizeCompanyName(name);
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens.at(-1)!)) {
    tokens.pop();
  }
  return tokens.join(" ");
}

function extractDomain(website?: string | null) {
  if (!website) return null;
  try {
    const parsed = new URL(website.includes("://") ? website : `https://${website}`);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function buildInitialism(name: string) {
  const tokens = stripLegalSuffix(name)
    .split(" ")
    .filter((token) => token.length >= 3 && !COMMON_COMPANY_WORDS.has(token));
  if (tokens.length < 2 || tokens.length > 5) return null;
  const initials = tokens.map((token) => token[0]).join("").toUpperCase();
  // Short generated initialisms collide heavily with ordinary words and foreign tickers.
  // Official short tickers should come from structured issuer metadata, not name guessing.
  return initials.length >= 4 ? initials : null;
}

export function buildCompanyAliases(company: CompanyAliasInput): string[] {
  const aliases = new Set<string>();
  const normalizedName = normalizeCompanyName(company.name);
  const withoutSuffix = stripLegalSuffix(company.name);
  const initialism = buildInitialism(company.name);
  const domain = extractDomain(company.website);
  const domainLabel = domain?.split(".")[0] ?? null;
  const normalizedDomainLabel = domainLabel ? normalizeCompanyName(domainLabel.replace(/-/g, " ")) : null;
  const normalizedCompanyBrand = normalizeCompanyName(withoutSuffix);

  aliases.add(company.name);
  aliases.add(normalizedName);
  aliases.add(withoutSuffix);
  if (company.legalForm) aliases.add(`${withoutSuffix} ${normalizeCompanyName(company.legalForm)}`);
  if (initialism) aliases.add(initialism);
  if (company.slug) aliases.add(company.slug.replace(/-/g, " "));
  if (domain) {
    aliases.add(domain);
    if (
      normalizedDomainLabel &&
      normalizedCompanyBrand === normalizedDomainLabel
    ) {
      aliases.add(domainLabel!);
    }
  }

  return [...aliases]
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 1)
    .filter((alias, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === alias.toLowerCase()) === index);
}

export function significantCompanyTokens(company: CompanyAliasInput) {
  return stripLegalSuffix(company.name)
    .split(" ")
    .filter((token) => token.length >= 4)
    .filter((token) => !COMMON_COMPANY_WORDS.has(token) && !LEGAL_SUFFIXES.has(token));
}

export function isCommonOrWeakCompanyName(name: string) {
  const tokens = significantCompanyTokens({ name });
  return tokens.length === 0 || (tokens.length === 1 && tokens[0].length <= 4);
}
