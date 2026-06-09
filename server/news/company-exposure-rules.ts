import {
  scoreCompanyExposureGraph,
  type PersistedCompanyExposureGraphEdge,
} from "@/server/news/company-exposure-graph";

export const COMPANY_EVENT_EXPOSURE_ENGINE_VERSION = "company-event-exposure-v2";

export const INDIRECT_TRANSFERABLE_EVENT_TYPES = [
  "production_update",
  "procurement_tender",
  "project_delay",
  "cost_overrun",
  "license_award",
  "license_loss",
  "regulatory_change",
  "commodity_price_exposure",
  "interest_rate_exposure",
  "interest_rate",
  "inflation",
  "currency",
  "credit_market",
  "peer_read_across",
  "sector_news",
  "macro_news",
] as const;

const INDIRECT_TRANSFERABLE_EVENT_TYPE_SET = new Set<string>(INDIRECT_TRANSFERABLE_EVENT_TYPES);

export const COMPANY_EVENT_EXPOSURE_TYPES = [
  "direct",
  "peer",
  "customer",
  "supplier",
  "sector",
  "commodity",
  "geography",
  "regulatory",
  "ownership",
  "petroleum",
  "value_chain",
] as const;

export type CompanyEventExposureType = (typeof COMPANY_EVENT_EXPOSURE_TYPES)[number];

export type CompanyExposureEventContext = {
  eventId: string;
  sourceCompanyId: string;
  eventType: string;
  title: string;
  summary?: string | null;
  sourceId?: string | null;
  sourceType?: string | null;
  sourceQualityScore?: number | null;
  sourceSectorTags?: string[];
  sourceCompanyIndustryCode?: string | null;
  sourceCompanyIndustryTitle?: string | null;
  sourceCompanyOrgNumber?: string | null;
  metadata?: unknown;
};

export type CompanyExposureCompanyContext = {
  companyId: string;
  name: string;
  industryCode?: string | null;
  industryTitle?: string | null;
  description?: string | null;
  revenue?: number | null;
  employeeCount?: number | null;
  hasPetroleumExposure?: boolean;
  petroleumExposure?: {
    operatorFieldCount?: number | null;
    licenceCount?: number | null;
    operatedProductionOe?: number | null;
    attributableProductionOe?: number | null;
    remainingReservesOe?: number | null;
  } | null;
  country?: string | null;
  city?: string | null;
  exposureGraphEdges?: PersistedCompanyExposureGraphEdge[];
};

export type CompanyExposureRuleResult = {
  exposureType: CompanyEventExposureType;
  exposureLevel: "direct" | "group" | "asset" | "commercial" | "commodity" | "regulatory" | "geography" | "peer" | "sector";
  feedPolicy: "standard" | "context_only" | "hidden";
  exposureScore: number;
  confidenceScore: number;
  rationale: string;
  reasons: string[];
  matchedSignals: string[];
};

const PETROLEUM_INDUSTRY_PREFIXES = ["06", "09", "19"];
const ENERGY_INDUSTRY_PREFIXES = ["05", "06", "09", "19", "35"];
const FINANCIAL_INDUSTRY_PREFIXES = ["64", "65", "66"];
const DIGITAL_INFRASTRUCTURE_PREFIXES = ["58", "61", "62", "63"];
const HEALTH_INDUSTRY_PREFIXES = ["21", "26", "32", "86"];

const DIRECT_EXPOSURE_SCORE = 0.96;
const DEFAULT_THRESHOLD = 0.58;

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 1);
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function compactCode(code: string | null | undefined) {
  return (code ?? "").replace(/\D/g, "");
}

function industryPrefix(code: string | null | undefined, length = 2) {
  const compact = compactCode(code);
  return compact.length >= length ? compact.slice(0, length) : null;
}

function hasPrefix(code: string | null | undefined, prefixes: string[]) {
  const prefix = industryPrefix(code);
  return Boolean(prefix && prefixes.includes(prefix));
}

function textContainsAny(text: string, tokens: string[]) {
  return tokens.some((token) => text.includes(token));
}

function sourceTagsContainAny(tags: string[] | undefined, tokens: string[]) {
  const normalizedTags = (tags ?? []).map(normalizeText);
  return tokens.some((token) => normalizedTags.some((tag) => tag.includes(token)));
}

function isPetroleumCompany(company: CompanyExposureCompanyContext) {
  return Boolean(
    company.hasPetroleumExposure ||
      (company.petroleumExposure &&
        ((company.petroleumExposure.operatorFieldCount ?? 0) > 0 ||
          (company.petroleumExposure.licenceCount ?? 0) > 0 ||
          (company.petroleumExposure.operatedProductionOe ?? 0) > 0 ||
          (company.petroleumExposure.attributableProductionOe ?? 0) > 0 ||
          (company.petroleumExposure.remainingReservesOe ?? 0) > 0)) ||
      hasPrefix(company.industryCode, PETROLEUM_INDUSTRY_PREFIXES),
  );
}

function isEnergyCompany(company: CompanyExposureCompanyContext) {
  return isPetroleumCompany(company) || hasPrefix(company.industryCode, ENERGY_INDUSTRY_PREFIXES);
}

function isFinancialCompany(company: CompanyExposureCompanyContext) {
  return hasPrefix(company.industryCode, FINANCIAL_INDUSTRY_PREFIXES);
}

function isDigitalInfrastructureCompany(company: CompanyExposureCompanyContext) {
  return hasPrefix(company.industryCode, DIGITAL_INFRASTRUCTURE_PREFIXES);
}

function isHealthCompany(company: CompanyExposureCompanyContext) {
  return hasPrefix(company.industryCode, HEALTH_INDUSTRY_PREFIXES);
}

function eventText(event: CompanyExposureEventContext) {
  return normalizeText([event.title, event.summary, event.eventType, event.sourceCompanyIndustryTitle].filter(Boolean).join(" "));
}

function isPetroleumEvent(event: CompanyExposureEventContext) {
  const text = eventText(event);
  return (
    sourceTagsContainAny(event.sourceSectorTags, ["oil", "gas", "petroleum", "energy", "eia", "iea", "sodir", "npd"]) ||
    ["sodir-news", "sodir-production", "sodir-drilling-permits", "sodir-exploration-results", "eia-today", "eia-press", "eia-petroleum-weekly", "iea-news"].includes(event.sourceId ?? "") ||
    hasPrefix(event.sourceCompanyIndustryCode, PETROLEUM_INDUSTRY_PREFIXES) ||
    textContainsAny(text, [
      "petroleum",
      "oil",
      "gas",
      "brent",
      "lng",
      "shale",
      "eia",
      "iea",
      "sodir",
      "sokkeldirektoratet",
      "licence",
      "license",
      "utvinningstillatelse",
    ])
  );
}

function isCommodityEvent(event: CompanyExposureEventContext) {
  const text = eventText(event);
  return (
    event.eventType === "commodity_price_exposure" ||
    textContainsAny(text, [
      "commodity",
      "oil price",
      "gas price",
      "brent",
      "wti",
      "lng",
      "crude",
      "energy prices",
      "kraftpris",
      "gasspris",
      "oljepris",
    ])
  );
}

function isRegulatoryEvent(event: CompanyExposureEventContext) {
  const text = eventText(event);
  return (
    ["regulatory_change", "regulatory_approval", "sanctions", "license_award", "license_loss"].includes(event.eventType) ||
    textContainsAny(text, [
      "regulation",
      "regulatory",
      "tilsyn",
      "directive",
      "forskrift",
      "lovendring",
      "sanction",
      "sanksjon",
      "tax",
      "skatt",
      "tariff",
      "toll",
      "licence",
      "license",
      "konsesjon",
    ])
  );
}

function isMacroFinancialEvent(event: CompanyExposureEventContext) {
  const text = eventText(event);
  return (
    ["interest_rate", "inflation", "currency", "credit_market"].includes(event.eventType) ||
    textContainsAny(text, [
      "policy rate",
      "styringsrente",
      "interest rate",
      "inflation",
      "kronekurs",
      "currency",
      "credit spread",
      "financing",
    ])
  );
}

function sameNarrowIndustry(event: CompanyExposureEventContext, company: CompanyExposureCompanyContext) {
  const eventCode = compactCode(event.sourceCompanyIndustryCode);
  const companyCode = compactCode(company.industryCode);

  if (eventCode.length < 4 || companyCode.length < 4) {
    return false;
  }

  return eventCode.slice(0, 4) === companyCode.slice(0, 4);
}

function sameBroadIndustry(event: CompanyExposureEventContext, company: CompanyExposureCompanyContext) {
  const eventPrefix = industryPrefix(event.sourceCompanyIndustryCode);
  const companyPrefix = industryPrefix(company.industryCode);
  return Boolean(eventPrefix && companyPrefix && eventPrefix === companyPrefix);
}

export function scoreDirectExposure(
  event: CompanyExposureEventContext,
  company: CompanyExposureCompanyContext,
): CompanyExposureRuleResult | null {
  if (event.sourceCompanyId !== company.companyId) {
    return null;
  }

  return {
    exposureType: "direct",
    exposureLevel: "direct",
    feedPolicy: "standard",
    exposureScore: DIRECT_EXPOSURE_SCORE,
    confidenceScore: 0.94,
    rationale: "Direkte eksponering: hendelsen er knyttet til selskapet selv.",
    reasons: ["direct_company_event"],
    matchedSignals: [company.name],
  };
}

function petroleumExposure(event: CompanyExposureEventContext, company: CompanyExposureCompanyContext) {
  if (!isPetroleumEvent(event) || !isPetroleumCompany(company)) {
    return null;
  }

  const score = hasPrefix(company.industryCode, PETROLEUM_INDUSTRY_PREFIXES) ? 0.74 : 0.66;
  return {
    exposureType: "petroleum" as const,
    exposureScore: score,
    confidenceScore: 0.76,
    rationale: "Petroleumsrelatert read-across basert på petroleumseksponering eller relevant næringskode.",
    reasons: ["petroleum_event", "petroleum_company_exposure"],
    matchedSignals: [company.industryCode, company.industryTitle, "petroleum_exposure"].filter(Boolean) as string[],
  };
}

function sectorExposure(event: CompanyExposureEventContext, company: CompanyExposureCompanyContext) {
  if (!event.sourceCompanyIndustryCode || !company.industryCode) {
    return null;
  }

  if (sameNarrowIndustry(event, company)) {
    return {
      exposureType: "sector" as const,
      exposureScore: 0.68,
      confidenceScore: 0.72,
      rationale: "Sektorrelevant read-across: samme smale næringskodeområde som hendelsens primærselskap.",
      reasons: ["same_narrow_industry_code"],
      matchedSignals: [event.sourceCompanyIndustryCode, company.industryCode],
    };
  }

  if (sameBroadIndustry(event, company) && (isRegulatoryEvent(event) || isCommodityEvent(event))) {
    return {
      exposureType: "sector" as const,
      exposureScore: 0.59,
      confidenceScore: 0.62,
      rationale: "Svak sektorrelevant read-across: samme brede næringskode og støttet av regulatorisk/råvaretema.",
      reasons: ["same_broad_industry_code", "theme_support"],
      matchedSignals: [event.sourceCompanyIndustryCode, company.industryCode],
    };
  }

  return null;
}

function commodityExposure(event: CompanyExposureEventContext, company: CompanyExposureCompanyContext) {
  if (!isCommodityEvent(event) || !isEnergyCompany(company)) {
    return null;
  }

  return {
    exposureType: "commodity" as const,
    exposureScore: isPetroleumCompany(company) ? 0.67 : 0.6,
    confidenceScore: 0.68,
    rationale: "Råvare-/energiprisnyhet med sannsynlig betydning for energi- eller petroleumseksponerte selskaper.",
    reasons: ["commodity_event", "energy_company"],
    matchedSignals: [company.industryCode, company.industryTitle].filter(Boolean) as string[],
  };
}

function regulatoryExposure(event: CompanyExposureEventContext, company: CompanyExposureCompanyContext) {
  if (!isRegulatoryEvent(event)) {
    return null;
  }

  const appliesToCompany =
    isEnergyCompany(company) ||
    isFinancialCompany(company) ||
    isDigitalInfrastructureCompany(company) ||
    isHealthCompany(company) ||
    sameBroadIndustry(event, company);

  if (!appliesToCompany) {
    return null;
  }

  return {
    exposureType: "regulatory" as const,
    exposureScore: isPetroleumCompany(company) && isPetroleumEvent(event) ? 0.7 : 0.6,
    confidenceScore: 0.64,
    rationale: "Regulatorisk read-across støttet av næringskode eller sektoreksponering.",
    reasons: ["regulatory_event", "regulated_sector_match"],
    matchedSignals: [company.industryCode, company.industryTitle].filter(Boolean) as string[],
  };
}

function valueChainExposure(event: CompanyExposureEventContext, company: CompanyExposureCompanyContext) {
  const text = eventText(event);
  const companyText = normalizeText([company.industryTitle, company.description].filter(Boolean).join(" "));
  const upstreamEvent = textContainsAny(text, ["supply", "supplier", "contract", "field development", "subsea", "rig", "drilling"]);
  const oilServiceCompany = textContainsAny(companyText, ["service", "supplier", "utstyr", "engineering", "boring", "drilling", "subsea"]);

  if (!upstreamEvent || !oilServiceCompany || !isEnergyCompany(company)) {
    return null;
  }

  return {
    exposureType: "value_chain" as const,
    exposureScore: 0.58,
    confidenceScore: 0.58,
    rationale: "Verdikjede-read-across: energi/petroleumstema med signaler om leverandør- eller serviceledd.",
    reasons: ["energy_value_chain_event", "supplier_like_company_profile"],
    matchedSignals: [company.industryTitle, "value_chain_terms"].filter(Boolean) as string[],
  };
}

function macroSectorExposure(event: CompanyExposureEventContext, company: CompanyExposureCompanyContext) {
  if (!isMacroFinancialEvent(event)) {
    return null;
  }

  const isRateSensitive =
    isFinancialCompany(company) ||
    hasPrefix(company.industryCode, ["41", "42", "43", "45", "46", "47", "55", "56", "68"]) ||
    (company.revenue ?? 0) > 500_000_000;

  if (!isRateSensitive) {
    return null;
  }

  return {
    exposureType: "sector" as const,
    exposureScore: isFinancialCompany(company) ? 0.66 : 0.58,
    confidenceScore: 0.58,
    rationale: "Makroøkonomisk read-across for rente-/kapitalsensitive selskaper og sektorer.",
    reasons: ["macro_financial_event", "rate_sensitive_sector_or_scale"],
    matchedSignals: [company.industryCode, company.industryTitle].filter(Boolean) as string[],
  };
}

export function scoreCompanyEventExposures(
  event: CompanyExposureEventContext,
  company: CompanyExposureCompanyContext,
  options: { threshold?: number; includeDirect?: boolean; includeContext?: boolean } = {},
) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const includeDirect = options.includeDirect ?? true;
  const includeContext = options.includeContext ?? false;
  const isDirectCompany = event.sourceCompanyId === company.companyId;
  if (!isDirectCompany && !INDIRECT_TRANSFERABLE_EVENT_TYPE_SET.has(event.eventType)) {
    return [];
  }
  const candidates = [
    includeDirect ? scoreDirectExposure(event, company) : null,
    ...(!isDirectCompany
      ? scoreCompanyExposureGraph(
          {
            eventType: event.eventType,
            title: event.title,
            summary: event.summary,
            sourceId: event.sourceId,
            sourceCompanyIndustryCode: event.sourceCompanyIndustryCode,
            sourceCompanyOrgNumber: event.sourceCompanyOrgNumber,
          },
          company.exposureGraphEdges ?? [],
          threshold,
        )
      : []),
  ].filter(Boolean) as CompanyExposureRuleResult[];

  const bestByType = new Map<CompanyEventExposureType, CompanyExposureRuleResult>();
  for (const candidate of candidates) {
    const normalized = {
      ...candidate,
      exposureScore: clamp01(candidate.exposureScore),
      confidenceScore: clamp01(candidate.confidenceScore),
    };
    const existing = bestByType.get(normalized.exposureType);
    if (!existing || normalized.exposureScore > existing.exposureScore) {
      bestByType.set(normalized.exposureType, normalized);
    }
  }

  return [...bestByType.values()]
    .filter(
      (candidate) =>
        candidate.exposureScore >= threshold &&
        (includeContext || candidate.feedPolicy === "standard"),
    )
    .sort((a, b) => b.exposureScore - a.exposureScore);
}
