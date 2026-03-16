import env from "@/lib/env";
import { SearchFilters } from "@/lib/types";
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
  await hydrateIndustryCodes(companies);
  await Promise.all(companies.map((company) => upsertCompanySnapshot(company)));
  return companies;
}

export async function getCompanyProfile(idOrSlug: string) {
  const cachedCompany = await getCachedCompany(idOrSlug, env.cacheHours);
  const company =
    cachedCompany ? mapDbCompany(cachedCompany) : await companyProvider.getCompany(idOrSlug);

  if (!company) {
    return null;
  }

  if (company.industryCode?.code) {
    const industryCode = await industryCodeProvider.getIndustryCode(company.industryCode.code);
    if (industryCode) {
      company.industryCode = industryCode;
      await upsertIndustryCodeSnapshot(industryCode);
    }
  }

  await upsertCompanySnapshot(company);

  const cachedRoles = await getCachedRoles(company.orgNumber, env.cacheHours);
  const roles = cachedRoles ? mapDbRoles(cachedRoles) : await rolesProvider.getRoles(company.orgNumber);

  if (!cachedRoles) {
    await upsertRolesSnapshot(company.orgNumber, roles);
  }

  const financials = await financialsProvider.getFinancialStatements(company.orgNumber);

  return {
    company,
    roles,
    financialStatements: financials.statements,
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
