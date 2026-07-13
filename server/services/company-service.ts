import { getHeadlineFinancialStatements } from "@/lib/financial-statements";
import { mergeIndustryCodeClassification } from "@/lib/industry-code";
import { logRecoverableError } from "@/lib/recoverable-error";
import {
  NormalizedAnnouncementDetail,
  CompanySearchResponse,
  DataAvailability,
  NormalizedCompany,
  NormalizedFinancialDocument,
  NormalizedFinancialStatement,
  RankedCompanySearchResult,
  SearchFilters,
  SearchInterpretation,
} from "@/lib/types";
import { BrregAnnouncementsProvider } from "@/integrations/brreg/brreg-announcements-provider";
import { OpenAiSearchIntentProvider } from "@/integrations/openai/openai-search-intent-provider";
import { SsbIndustryCodeProvider } from "@/integrations/ssb/ssb-industry-code-provider";
import { classifyQueryIntent } from "@/server/ai-search/query-router";
import { searchRegistryCompanies } from "@/server/registry/entity-search-service";
import { mapDbCompany, mapDbFinancialStatements, mapDbRoles } from "@/server/mappers/db-mappers";
import {
  getCachedCompanyCore,
  getCachedFinancialStatements,
  getCachedRoles,
  getLatestFinancialsForCompanies,
  upsertCompanySnapshot,
  upsertIndustryCodeSnapshot,
} from "@/server/persistence/company-repository";
import { getPublishedAnnualReportFinancials } from "@/server/services/annual-report-financials-service";

const announcementsProvider = new BrregAnnouncementsProvider();
const industryCodeProvider = new SsbIndustryCodeProvider();
const searchIntentProvider = new OpenAiSearchIntentProvider();

type SearchIndustryMatch = Awaited<ReturnType<typeof buildIndustryMatches>>[number];
type ResolvedSearchGeography = Awaited<ReturnType<typeof industryCodeProvider.resolveGeography>>;
type CompanyProfileOptions = {
  rolesMode?: "full" | "none";
  financialsMode?: "full" | "summary" | "none";
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/Ã¦/g, "ae")
    .replace(/Ã¸/g, "o")
    .replace(/Ã¥/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSearchableText(company: NormalizedCompany) {
  const rawPayload = typeof company.rawPayload === "object" && company.rawPayload ? company.rawPayload : {};
  const activity = Array.isArray((rawPayload as Record<string, unknown>).aktivitet)
    ? ((rawPayload as Record<string, unknown>).aktivitet as string[]).join(" ")
    : "";
  const purpose = Array.isArray((rawPayload as Record<string, unknown>).vedtektsfestetFormaal)
    ? ((rawPayload as Record<string, unknown>).vedtektsfestetFormaal as string[]).join(" ")
    : "";

  return normalizeText(
    [
      company.name,
      company.description ?? "",
      company.industryCode?.title ?? "",
      company.industryCode?.description ?? "",
      activity,
      purpose,
      company.addresses[0]?.city ?? "",
      company.addresses[0]?.region ?? "",
    ].join(" "),
  );
}

function getMunicipalityNumber(company: NormalizedCompany) {
  const rawAddress = company.addresses[0]?.rawPayload;
  if (
    typeof rawAddress === "object" &&
    rawAddress &&
    "kommunenummer" in rawAddress &&
    typeof rawAddress.kommunenummer === "string"
  ) {
    return rawAddress.kommunenummer;
  }

  return null;
}

function dedupeCompanies(companies: NormalizedCompany[]) {
  const lookup = new Map<string, NormalizedCompany>();

  for (const company of companies) {
    const existing = lookup.get(company.orgNumber);
    if (!existing) {
      lookup.set(company.orgNumber, company);
      continue;
    }

    if ((company.description?.length ?? 0) > (existing.description?.length ?? 0)) {
      lookup.set(company.orgNumber, company);
    }
  }

  return Array.from(lookup.values());
}

function buildFallbackResponse(): CompanySearchResponse {
  return {
    results: [],
    interpretation: {
      originalQuery: "",
      rewrittenQuery: "",
      aiAssisted: false,
      fallbackReason: null,
      companyTerms: [],
      industryTerms: [],
      geographicTerm: null,
      geographicType: null,
      intentSummary: null,
      matchedIndustryCodes: [],
    },
  };
}

function scoreCompanyResult(
  company: NormalizedCompany,
  rawQuery: string,
  industryCodeScores: Map<string, number>,
  industryTerms: string[],
  companyTerms: string[],
  geographicLabel: string | null,
  municipalityCodes: string[],
  revenue: number | null,
  revenueFiscalYear: number | null,
  operatingProfit: number | null,
  netIncome: number | null,
): RankedCompanySearchResult {
  const reasons: string[] = [];
  const searchableText = getSearchableText(company);
  const normalizedQuery = normalizeText(rawQuery);
  let relevanceScore = 0;

  if (normalizedQuery && searchableText.includes(normalizedQuery)) {
    relevanceScore += 120;
    reasons.push("Sterk tekstmatch");
  }

  for (const term of industryTerms) {
    const normalizedTerm = normalizeText(term);
    if (normalizedTerm && searchableText.includes(normalizedTerm)) {
      relevanceScore += 35;
      reasons.push(`Treffer aktivitet: ${term}`);
    }
  }

  for (const term of companyTerms) {
    const normalizedTerm = normalizeText(term);
    if (normalizedTerm && normalizeText(company.name).includes(normalizedTerm)) {
      relevanceScore += 55;
      reasons.push(`Treffer navn: ${term}`);
    }
  }

  const industryScore = company.industryCode?.code ? industryCodeScores.get(company.industryCode.code) ?? 0 : 0;
  if (industryScore > 0) {
    relevanceScore += industryScore;
    reasons.push(`Treffer nÃ¦ringskode ${company.industryCode?.code}`);
  }

  const municipalityNumber = getMunicipalityNumber(company);
  if (municipalityCodes.length > 0 && municipalityNumber && municipalityCodes.includes(municipalityNumber)) {
    relevanceScore += 45;
    reasons.push("Matcher geografi");
  } else if (
    geographicLabel &&
    [company.addresses[0]?.city ?? "", company.addresses[0]?.region ?? ""]
      .map((value) => normalizeText(value))
      .includes(normalizeText(geographicLabel))
  ) {
    relevanceScore += 20;
    reasons.push("Matcher sted");
  }

  if (company.status === "ACTIVE") {
    relevanceScore += 10;
  }

  return {
    company,
    relevanceScore,
    revenue,
    revenueFiscalYear,
    operatingProfit,
    netIncome,
    matchReasons: Array.from(new Set(reasons)).slice(0, 4),
  };
}

async function hydrateIndustryCodes<T extends { industryCode?: NormalizedCompany["industryCode"] }>(
  companies: T[],
) {
  const uniqueCodes = Array.from(
    new Set(companies.map((company) => company.industryCode?.code).filter(Boolean)),
  ) as string[];
  const lookup = new Map<string, Awaited<ReturnType<typeof industryCodeProvider.getIndustryCode>>>();

  await Promise.all(
    uniqueCodes.map(async (code) => {
      const industryCode = await industryCodeProvider.getIndustryCode(code);
      if (industryCode) {
        lookup.set(code, industryCode);
        await upsertIndustryCodeSnapshot(industryCode);
      }
    }),
  );

  for (const company of companies) {
    if (company.industryCode?.code && lookup.has(company.industryCode.code)) {
      company.industryCode = mergeIndustryCodeClassification(
        company.industryCode,
        lookup.get(company.industryCode.code) ?? null,
      );
    }
  }
}

async function persistCompanies(companies: NormalizedCompany[]) {
  await Promise.all(
    companies.map(async (company) => {
      try {
        await upsertCompanySnapshot(company);
      } catch (error) {
        logRecoverableError("company-service.persistCompanies", error, {
          orgNumber: company.orgNumber,
        });
      }
    }),
  );
}

async function buildIndustryMatches(filters: SearchFilters, interpretation: SearchInterpretation) {
  const industryTerms = Array.from(
    new Set([
      ...interpretation.industryTerms,
      interpretation.rewrittenQuery,
      filters.query,
      filters.industryCode ?? "",
    ].filter((value): value is string => Boolean(value))),
  );

  if (filters.industryCode) {
    return [
      {
        code: filters.industryCode,
        title: null,
        score: 90,
      },
    ];
  }

  return industryCodeProvider.searchIndustryCodes(industryTerms, 4);
}

async function searchCandidates(
  filters: SearchFilters,
  interpretation: SearchInterpretation,
  matchedIndustryCodes: SearchIndustryMatch[],
  geography: ResolvedSearchGeography | null,
): Promise<NormalizedCompany[]> {
  if (!filters.query?.trim()) {
    return searchRegistryCompanies(filters);
  }

  const queryVariants = Array.from(
    new Set(
      [
        ...interpretation.companyTerms,
        filters.query,
      ]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, 3);

  const candidateBatches = await Promise.all([
    ...matchedIndustryCodes.flatMap((industryCode) => {
      if (geography?.municipalityCodes.length) {
        return geography.municipalityCodes.slice(0, 30).map((municipalityNumber) =>
          searchRegistryCompanies({
            ...filters,
            query: undefined,
            city: filters.city,
            municipalityNumber,
            industryCode: industryCode.code,
            size: 8,
          }),
        );
      }

      return [
        searchRegistryCompanies({
          ...filters,
          query: undefined,
          municipality: filters.city ? undefined : geography?.type === "MUNICIPALITY" ? geography.label : undefined,
          municipalityNumber: undefined,
          industryCode: industryCode.code,
          size: 25,
        }),
      ];
    }),
    ...queryVariants.map((queryVariant) =>
      searchRegistryCompanies({
        ...filters,
        query: queryVariant,
        size: 25,
      }),
    ),
  ]);

  const companies = dedupeCompanies(candidateBatches.flat());

  if (geography?.municipalityCodes.length) {
    return companies.filter((company) => {
      const municipalityNumber = getMunicipalityNumber(company);
      return municipalityNumber ? geography.municipalityCodes.includes(municipalityNumber) : false;
    });
  }

  return companies;
}

export async function searchCompanies(filters: SearchFilters): Promise<CompanySearchResponse> {
  if (
    !filters.query &&
    !filters.city &&
    !filters.municipality &&
    !filters.municipalityNumber &&
    !filters.industryCode &&
    !filters.legalForm &&
    !filters.status
  ) {
    return buildFallbackResponse();
  }

  const shouldInterpretWithAi = Boolean(
    filters.aiAssisted &&
      filters.query?.trim() &&
      classifyQueryIntent(filters.query).intent !== "DIRECT_LOOKUP",
  );
  const interpretation: SearchInterpretation = shouldInterpretWithAi
    ? await searchIntentProvider.interpretQuery(filters.query ?? "")
    : {
        originalQuery: filters.query ?? "",
        rewrittenQuery: filters.query ?? "",
        aiAssisted: false,
        fallbackReason: null,
        companyTerms: filters.query?.trim() ? [filters.query.trim()] : [],
        industryTerms: [],
        geographicTerm: null,
        geographicType: null,
        intentSummary: null,
        matchedIndustryCodes: [],
      };

  const matchedIndustryCodes = await buildIndustryMatches(filters, interpretation);
  interpretation.matchedIndustryCodes = matchedIndustryCodes.map((item) => ({
    code: item.code,
    title: item.title,
    score: item.score,
  }));

  const geography =
    interpretation.geographicTerm && !filters.city
      ? await industryCodeProvider.resolveGeography(
          interpretation.geographicTerm,
          interpretation.geographicType ?? undefined,
        )
      : null;

  const companies = await searchCandidates(filters, interpretation, matchedIndustryCodes, geography);
  try {
    await hydrateIndustryCodes(companies);
  } catch (error) {
    logRecoverableError("company-service.hydrateIndustryCodes", error, {
      companyCount: companies.length,
    });
  }

  const industryTerms = Array.from(
    new Set(
      [
        ...interpretation.industryTerms,
        ...(interpretation.rewrittenQuery ? [interpretation.rewrittenQuery] : []),
      ].filter(Boolean),
    ),
  );

  interpretation.matchedIndustryCodes = interpretation.matchedIndustryCodes.slice(0, 5);

  const revenues = await getLatestFinancialsForCompanies(companies.map((company) => company.orgNumber));
  const industryCodeScores = new Map(interpretation.matchedIndustryCodes.map((item) => [item.code, item.score]));

  const results = companies
    .map((company) => {
      const financials = revenues.get(company.orgNumber);
      return scoreCompanyResult(
        company,
        filters.query ?? "",
        industryCodeScores,
        industryTerms,
        interpretation.companyTerms,
        geography?.label ?? filters.city ?? null,
        geography?.municipalityCodes ?? [],
        financials?.revenue ?? null,
        financials?.fiscalYear ?? null,
        financials?.operatingProfit ?? null,
        financials?.netIncome ?? null,
      );
    })
    .sort((left, right) => {
      if (right.relevanceScore !== left.relevanceScore) {
        return right.relevanceScore - left.relevanceScore;
      }

      const rightRevenue = right.revenue ?? Number.NEGATIVE_INFINITY;
      const leftRevenue = left.revenue ?? Number.NEGATIVE_INFINITY;
      if (rightRevenue !== leftRevenue) {
        return rightRevenue - leftRevenue;
      }

      const rightEmployees = right.company.employeeCount ?? Number.NEGATIVE_INFINITY;
      const leftEmployees = left.company.employeeCount ?? Number.NEGATIVE_INFINITY;
      if (rightEmployees !== leftEmployees) {
        return rightEmployees - leftEmployees;
      }

      return left.company.name.localeCompare(right.company.name, "nb-NO");
    })
    .slice(0, 60);

  await persistCompanies(results.map((result) => result.company));

  return {
    results,
    interpretation,
  };
}


export async function getCompanyByReference(idOrSlug: string) {
  let cachedCompany = null;
  try {
    cachedCompany = await getCachedCompanyCore(idOrSlug, Infinity);
  } catch (error) {
    logRecoverableError("company-service.getCachedCompanyCore", error, {
      idOrSlug,
    });
    return null;
  }

  return cachedCompany ? mapDbCompany(cachedCompany) : null;
}

export async function getCompanyProfile(idOrSlug: string, options: CompanyProfileOptions = {}) {
  let cachedCompany = null;
  try {
    cachedCompany = await getCachedCompanyCore(idOrSlug, Infinity);
  } catch (error) {
    logRecoverableError("company-service.getCachedCompanyCore", error, { idOrSlug });
    return null;
  }

  if (!cachedCompany) {
    return null;
  }

  const company = mapDbCompany(cachedCompany);
  const companyDbId = cachedCompany.id;
  const rolesMode = options.rolesMode ?? "full";
  const financialsMode = options.financialsMode ?? "full";

  let roles = [] as ReturnType<typeof mapDbRoles>;
  let rolesAvailability: DataAvailability;

  if (rolesMode === "none") {
    rolesAvailability = {
      available: false,
      sourceSystem: "BRREG",
      message: "Rolledetaljer lastes ved behov i organisasjonsfanen.",
    };
  } else {
    let cachedRoles = null;
    try {
      cachedRoles = await getCachedRoles(company.orgNumber, Infinity);
    } catch (error) {
      logRecoverableError("company-service.getCachedRoles", error, {
        orgNumber: company.orgNumber,
      });
    }

    roles = cachedRoles ? mapDbRoles(cachedRoles) : [];
    rolesAvailability = cachedRoles
      ? {
          available: true,
          sourceSystem: "BRREG",
          message:
            roles.length > 0
              ? "Roller er hentet fra lokal database."
              : "Ingen roller er registrert for denne virksomheten.",
        }
      : {
          available: false,
          sourceSystem: "BRREG",
          message: "Roller er ikke synkronisert ennå.",
        };
  }

  let financials: {
    statements: NormalizedFinancialStatement[];
    allScopeStatements: NormalizedFinancialStatement[];
    documents: NormalizedFinancialDocument[];
    availability: DataAvailability;
  } = {
    statements: [],
    allScopeStatements: [],
    documents: [],
    availability: {
      available: false,
      sourceSystem: "BRREG",
      message:
        financialsMode === "none"
          ? "Regnskap lastes ved behov i regnskaps- og nøkkeltallsfanene."
          : "Regnskap er ikke synkronisert ennå.",
    },
  };

  if (financialsMode === "summary") {
    try {
      const cachedStatements = await getCachedFinancialStatements(company.orgNumber, Infinity);
      if (cachedStatements) {
        const cached = mapDbFinancialStatements(cachedStatements);
        financials = {
          statements: getHeadlineFinancialStatements(cached),
          allScopeStatements: cached,
          documents: [],
          availability: {
            available: true,
            sourceSystem: "BRREG",
            message: "Regnskapstall vises fra lokal database.",
          },
        };
      }
    } catch (error) {
      logRecoverableError("company-service.getCachedFinancialStatements", error, {
        orgNumber: company.orgNumber,
      });
    }
  }

  if (financialsMode === "full") {
    financials = await getPublishedAnnualReportFinancials(company.orgNumber);
  }

  return {
    company,
    companyDbId,
    roles,
    rolesAvailability,
    financialStatements: financials.statements,
    financialStatementsAllScopes: financials.allScopeStatements,
    financialDocuments: financials.documents,
    financialsAvailability: financials.availability,
    regulatoryAvailability: {
      available: false,
      sourceSystem: "FINANSTILSYNET",
      message:
        "Regulatorisk overlay er ikke aktivert i MVP-et fordi åpen og stabil kildetilgang ikke er koblet inn ennå.",
    },
  };
}

export async function getCompanyRoles(orgNumber: string) {
  const cachedRoles = await getCachedRoles(orgNumber, Infinity);
  return cachedRoles ? mapDbRoles(cachedRoles) : [];
}

export async function getCompanyFinancials(orgNumber: string) {
  return getPublishedAnnualReportFinancials(orgNumber);
}

export async function getCompanyAnnouncements(orgNumber: string) {
  return announcementsProvider.getAnnouncements(orgNumber);
}

export async function getCompanyAnnouncementDetail(
  orgNumber: string,
  announcementId: string,
  publishedAt?: Date | null,
): Promise<NormalizedAnnouncementDetail | null> {
  return announcementsProvider.getAnnouncementDetail(orgNumber, announcementId, publishedAt);
}
