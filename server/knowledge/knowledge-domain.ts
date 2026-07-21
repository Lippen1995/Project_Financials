export const KNOWLEDGE_JURISDICTIONS = ["NO", "EU", "EEA", "INTERNATIONAL"] as const;
export type KnowledgeJurisdictionValue = (typeof KNOWLEDGE_JURISDICTIONS)[number];

export const KNOWLEDGE_DOMAINS = [
  "NORWEGIAN_LAW",
  "ACCOUNTING",
  "IFRS",
  "EU_EEA_LAW",
  "BUSINESS_POLICY",
] as const;
export type KnowledgeDomainValue = (typeof KNOWLEDGE_DOMAINS)[number];

export const KNOWLEDGE_DOCUMENT_TYPES = [
  "LAW",
  "REGULATION",
  "ACCOUNTING_STANDARD",
  "BOOKKEEPING_STANDARD",
  "IFRS_STANDARD",
  "EU_ACT",
  "EEA_DECISION",
  "PROPOSITION",
  "HEARING",
  "BUDGET_MEASURE",
  "PARLIAMENT_DECISION",
  "OFFICIAL_GUIDANCE",
  "OTHER",
] as const;
export type KnowledgeDocumentTypeValue = (typeof KNOWLEDGE_DOCUMENT_TYPES)[number];

export const KNOWLEDGE_LEGAL_STATUSES = [
  "DRAFT",
  "PROPOSED",
  "HEARING",
  "ADOPTED",
  "IN_FORCE",
  "REPEALED",
  "SUPERSEDED",
  "WITHDRAWN",
  "LAPSED",
  "UNKNOWN",
] as const;
export type KnowledgeLegalStatusValue = (typeof KNOWLEDGE_LEGAL_STATUSES)[number];

export const EEA_INCORPORATION_STATUSES = [
  "NOT_ASSESSED",
  "NOT_RELEVANT",
  "UNDER_SCRUTINY",
  "PENDING",
  "INCORPORATED",
] as const;
export type EeaIncorporationStatusValue = (typeof EEA_INCORPORATION_STATUSES)[number];

export const NORWAY_IMPLEMENTATION_STATUSES = [
  "NOT_ASSESSED",
  "NOT_REQUIRED",
  "PENDING",
  "IMPLEMENTED",
] as const;
export type NorwayImplementationStatusValue = (typeof NORWAY_IMPLEMENTATION_STATUSES)[number];

const OFFICIAL_HOSTS = [
  "lovdata.no",
  "eur-lex.europa.eu",
  "data.europa.eu",
  "efta.int",
  "stortinget.no",
  "regjeringen.no",
  "regnskapsstiftelsen.no",
  "skatteetaten.no",
  "finanstilsynet.no",
  "brreg.no",
] as const;

const SOURCE_SYSTEM_HOSTS: Record<string, readonly string[]> = {
  LOVDATA_API: ["lovdata.no"],
  EUR_LEX_ELI: ["eur-lex.europa.eu", "data.europa.eu"],
  EEA_LEX: ["efta.int"],
  STORTINGET_API: ["stortinget.no"],
  REGJERINGEN: ["regjeringen.no"],
  NRS: ["regnskapsstiftelsen.no"],
  SKATTEETATEN: ["skatteetaten.no"],
  FINANSTILSYNET: ["finanstilsynet.no"],
  BRREG: ["brreg.no"],
};

export type KnowledgeChunkInput = {
  chunkIndex: number;
  heading: string | null;
  provisionRef: string | null;
  content: string;
  tokenEstimate: number;
};

function isAllowedHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");
  return OFFICIAL_HOSTS.some((host) => normalized === host || normalized.endsWith(`.${host}`));
}

export function assertOfficialKnowledgeSource(sourceUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error(`Ugyldig kilde-URL: ${sourceUrl}`);
  }
  if (parsed.protocol !== "https:" || !isAllowedHost(parsed.hostname)) {
    throw new Error(`«${sourceUrl}» er ikke en tillatt offisiell kilde.`);
  }
  return parsed;
}

export function assertKnowledgeSourceSystemMatchesUrl(sourceSystem: string, sourceUrl: string) {
  const parsed = assertOfficialKnowledgeSource(sourceUrl);
  const allowedHosts = SOURCE_SYSTEM_HOSTS[sourceSystem];
  const normalized = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!allowedHosts?.some((host) => normalized === host || normalized.endsWith(`.${host}`))) {
    throw new Error(`Kildesystemet ${sourceSystem} kan ikke bruke URL fra ${parsed.hostname}.`);
  }
  return parsed;
}

export function isRuleEffectiveAt(
  rule: {
    legalStatus: KnowledgeLegalStatusValue;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
  },
  asOf: Date,
) {
  if (["DRAFT", "PROPOSED", "HEARING", "ADOPTED"].includes(rule.legalStatus)) return false;
  if (!rule.effectiveFrom) return false;
  if (rule.effectiveFrom && rule.effectiveFrom.getTime() > asOf.getTime()) return false;
  if (rule.effectiveTo && rule.effectiveTo.getTime() <= asOf.getTime()) return false;
  if (["REPEALED", "SUPERSEDED"].includes(rule.legalStatus) && !rule.effectiveTo) return false;
  return ["IN_FORCE", "REPEALED", "SUPERSEDED"].includes(rule.legalStatus);
}

function provisionFrom(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
  return firstLine.match(/^(§{1,2}\s*[\dA-Za-z.-]+|Article\s+\d+[A-Za-z]?|Artikkel\s+\d+[A-Za-z]?|(?:IAS|IFRS|NRS|NBS)\s+\d+[A-Za-z]?)/i)?.[1] ?? null;
}

function headingFrom(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
  return firstLine.length <= 180 ? firstLine : null;
}

function splitOversizedBlock(block: string, maxCharacters: number) {
  if (block.length <= maxCharacters) return [block];
  const sentences = block.split(/(?<=[.!?])\s+(?=[A-ZÆØÅ§])/u);
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > maxCharacters) {
      parts.push(current);
      current = "";
    }
    if (sentence.length > maxCharacters) {
      if (current) parts.push(current);
      for (let index = 0; index < sentence.length; index += maxCharacters) {
        parts.push(sentence.slice(index, index + maxCharacters));
      }
      current = "";
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) parts.push(current);
  return parts;
}

export function chunkKnowledgeContent(
  content: string,
  options: { maxCharacters?: number } = {},
): KnowledgeChunkInput[] {
  const maxCharacters = Math.max(80, options.maxCharacters ?? 2_400);
  const blocks = content
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => splitOversizedBlock(block, maxCharacters));

  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    const startsProvision = provisionFrom(block) !== null;
    if (current && (startsProvision || current.length + block.length + 2 > maxCharacters)) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${block}` : block;
  }
  if (current) chunks.push(current);

  return chunks.map((chunk, chunkIndex) => ({
    chunkIndex,
    heading: headingFrom(chunk),
    provisionRef: provisionFrom(chunk),
    content: chunk,
    tokenEstimate: Math.max(1, Math.ceil(chunk.length / 4)),
  }));
}
