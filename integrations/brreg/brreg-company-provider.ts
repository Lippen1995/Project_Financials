import env from "@/lib/env";
import { mapBrregCompany } from "@/integrations/brreg/mappers";
import { fetchJson } from "@/integrations/http";
import { CompanyProfileProvider, CompanySearchProvider } from "@/integrations/provider-interface";
import { SearchFilters } from "@/lib/types";

type BrregSearchResponse = {
  _embedded?: {
    enheter?: Record<string, any>[];
  };
};

function applyClientSideFilters(companies: ReturnType<typeof mapBrregCompany>[], filters: SearchFilters) {
  return companies.filter((company) => {
    if (filters.status && company.status !== filters.status) {
      return false;
    }

    if (
      filters.city &&
      !company.addresses.some((address) => address.city?.toLowerCase() === filters.city?.toLowerCase())
    ) {
      return false;
    }

    if (filters.legalForm && company.legalForm?.toLowerCase() !== filters.legalForm.toLowerCase()) {
      return false;
    }

    if (filters.industryCode && company.industryCode?.code !== filters.industryCode) {
      return false;
    }

    return true;
  });
}

export class BrregCompanyProvider implements CompanySearchProvider, CompanyProfileProvider {
  async searchCompanies(filters: SearchFilters) {
    if (!filters.query && !filters.city && !filters.industryCode && !filters.legalForm && !filters.status) {
      return [];
    }

    if (!filters.query?.trim()) {
      return [];
    }

    if (filters.query && /^\d{9}$/.test(filters.query.trim())) {
      const company = await this.getCompany(filters.query.trim());
      return company ? applyClientSideFilters([company], filters) : [];
    }

    const params = new URLSearchParams({
      size: String(filters.size ?? 25),
      page: String(filters.page ?? 0),
    });

    if (filters.query) {
      params.set("navn", filters.query.trim());
    }

    const response = await fetchJson<BrregSearchResponse>(`${env.brregBaseUrl}/enheter?${params.toString()}`);
    const companies = response._embedded?.enheter?.map(mapBrregCompany) ?? [];
    return applyClientSideFilters(companies, filters);
  }

  async getCompany(orgNumberOrSlug: string) {
    const orgNumberMatch = orgNumberOrSlug.match(/\d{9}/);
    if (!orgNumberMatch) {
      return null;
    }

    const company = await fetchJson<Record<string, any>>(
      `${env.brregBaseUrl}/enheter/${orgNumberMatch[0]}`,
    );
    return mapBrregCompany(company);
  }
}
