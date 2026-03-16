import env from "@/lib/env";
import { NormalizedFinancialDocument, NormalizedFinancialStatement, SearchFilters } from "@/lib/types";
import { BrregCompanyProvider } from "@/integrations/brreg/brreg-company-provider";
import { BrregFinancialsProvider } from "@/integrations/brreg/brreg-financials-provider";
import { BrregRolesProvider } from "@/integrations/brreg/brreg-roles-provider";
import { SsbIndustryCodeProvider } from "@/integrations/ssb/ssb-industry-code-provider";
import { mapDbCompany, mapDbRoles } from "@/server/mappers/db-mappers";
import {
  getCachedCompany,
  getCachedRoles,
  upsertCompanySnapshot,
  upsertIndustryCodeSnapshot,
  upsertRolesSnapshot,
} from "@/server/persistence/company-repository";

const companyProvider = new BrregCompanyProvider();
const rolesProvider = new BrregRolesProvider();
const financialsProvider = new BrregFinancialsProvider();
const industryCodeProvider = new SsbIndustryCodeProvider();

async function hydrateIndustryCodes<T extends { industryCode?: { code: string } | null }>(companies: T[]) {
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
      company.industryCode = lookup.get(company.industryCode.code) ?? company.industryCode;
    }
  }
}

export async function searchCompanies(filters: SearchFilters) {
  const companies = await companyProvider.searchCompanies(filters);
  try {
    await hydrateIndustryCodes(companies);
  } catch {
    // Keep search results even if enrichment fails.
  }

  await Promise.all(
    companies.map(async (company) => {
      try {
        await upsertCompanySnapshot(company);
      } catch {
        // Search should still work if cache persistence fails.
      }
    }),
  );
  return companies;
}

export async function getCompanyProfile(idOrSlug: string) {
  let cachedCompany = null;
  try {
    cachedCompany = await getCachedCompany(idOrSlug, env.cacheHours);
  } catch {
    cachedCompany = null;
  }

  const company = cachedCompany ? mapDbCompany(cachedCompany) : await companyProvider.getCompany(idOrSlug);

  if (!company) {
    return null;
  }

  if (company.industryCode?.code) {
    try {
      const industryCode = await industryCodeProvider.getIndustryCode(company.industryCode.code);
      if (industryCode) {
        company.industryCode = industryCode;
        await upsertIndustryCodeSnapshot(industryCode);
      }
    } catch {
      // Company page should still render without enrichment text.
    }
  }

  try {
    await upsertCompanySnapshot(company);
  } catch {
    // Ignore cache write issues when rendering the profile.
  }

  let cachedRoles = null;
  try {
    cachedRoles = await getCachedRoles(company.orgNumber, env.cacheHours);
  } catch {
    cachedRoles = null;
  }

  const roles = cachedRoles ? mapDbRoles(cachedRoles) : await rolesProvider.getRoles(company.orgNumber);

  if (!cachedRoles) {
    try {
      await upsertRolesSnapshot(company.orgNumber, roles);
    } catch {
      // Ignore cache write issues for roles.
    }
  }

  let financials: {
    statements: NormalizedFinancialStatement[];
    documents: NormalizedFinancialDocument[];
    availability: {
      available: boolean;
      sourceSystem: string;
      message: string;
    };
  } = {
    statements: [],
    documents: [],
    availability: {
      available: false,
      sourceSystem: "BRREG",
      message: "Regnskap kunne ikke hentes akkurat na.",
    },
  };

  try {
    financials = await financialsProvider.getFinancialStatements(company.orgNumber);
  } catch {
    financials = {
      statements: [],
      documents: [],
      availability: {
        available: false,
        sourceSystem: "BRREG",
        message: "Regnskap kunne ikke hentes akkurat na.",
      },
    };
  }

  return {
    company,
    roles,
    financialStatements: financials.statements,
    financialDocuments: financials.documents,
    financialsAvailability: financials.availability,
    regulatoryAvailability: {
      available: false,
      sourceSystem: "FINANSTILSYNET",
      message:
        "Regulatorisk overlay er ikke aktivert i MVP-et fordi apen og stabil kildetilgang ikke er koblet inn enna.",
    },
  };
}

export async function getCompanyRoles(orgNumber: string) {
  const cachedRoles = await getCachedRoles(orgNumber, env.cacheHours);
  if (cachedRoles) {
    return mapDbRoles(cachedRoles);
  }

  const roles = await rolesProvider.getRoles(orgNumber);
  await upsertRolesSnapshot(orgNumber, roles);
  return roles;
}

export async function getCompanyFinancials(orgNumber: string) {
  return financialsProvider.getFinancialStatements(orgNumber);
}
