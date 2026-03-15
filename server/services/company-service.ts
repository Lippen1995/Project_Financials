import env from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { SearchFilters } from "@/lib/types";
import { BrregProvider } from "@/integrations/brreg/provider";
import { MockProvider } from "@/integrations/mock/provider";
import { CompanyProvider } from "@/integrations/provider-interface";
import { upsertCompanySnapshot } from "@/server/persistence/company-repository";

function getProvider(): CompanyProvider {
  if (env.dataMode === "live") {
    return new BrregProvider();
  }

  return new MockProvider();
}

export async function searchCompanies(filters: SearchFilters) {
  const provider = getProvider();
  return provider.searchCompanies(filters);
}

export async function getCompanyProfile(idOrSlug: string) {
  const provider = getProvider();
  const company = await provider.getCompany(idOrSlug);

  if (company && env.dataMode === "live") {
    await upsertCompanySnapshot(company);
  }

  return company;
}

export async function getCompanyRoles(orgNumber: string) {
  const provider = getProvider();
  return provider.getRoles(orgNumber);
}

export async function getCompanyFinancials(orgNumber: string) {
  const provider = getProvider();
  return provider.getFinancialStatements(orgNumber);
}

export async function getSearchFacets() {
  const [industries, cities] = await Promise.all([
    prisma.industryCode.findMany({ orderBy: { title: "asc" } }),
    prisma.address.findMany({
      distinct: ["city"],
      select: { city: true },
      orderBy: { city: "asc" },
    }),
  ]);

  return {
    industries,
    cities: cities.map((item) => item.city),
    statuses: ["ACTIVE", "DISSOLVED", "BANKRUPT"],
  };
}