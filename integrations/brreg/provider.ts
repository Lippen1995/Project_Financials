import env from "@/lib/env";
import { SearchFilters } from "@/lib/types";
import { CompanyProvider } from "@/integrations/provider-interface";
import { fetchJson } from "@/integrations/http";
import { mapBrregCompany, mapBrregFinancialStatement, mapBrregRole } from "@/integrations/brreg/mappers";

type BrregSearchResponse = {
  _embedded?: {
    enheter?: Record<string, any>[];
  };
};

export class BrregProvider implements CompanyProvider {
  async searchCompanies(filters: SearchFilters) {
    const params = new URLSearchParams();
    if (filters.query) {
      params.set("navn", filters.query);
    }

    const url = `${env.brregBaseUrl}/enheter?${params.toString()}`;
    const response = await fetchJson<BrregSearchResponse>(url);
    const companies = response._embedded?.enheter?.map(mapBrregCompany) ?? [];

    return companies.filter((company) => {
      if (filters.status && company.status !== filters.status) {
        return false;
      }

      if (filters.city && !company.addresses.some((address) => address.city === filters.city)) {
        return false;
      }

      return true;
    });
  }

  async getCompany(orgNumberOrSlug: string) {
    const orgNumber = orgNumberOrSlug.replace(/\D/g, "");
    const company = await fetchJson<Record<string, any>>(`${env.brregBaseUrl}/enheter/${orgNumber}`);
    return mapBrregCompany(company);
  }

  async getRoles(orgNumber: string) {
    const response = await fetchJson<{ roller?: { rollegrupper?: Array<{ roller?: any[] }> } }>(`${env.brregRolesBaseUrl}/enheter/${orgNumber}/roller`);

    return response.roller?.rollegrupper?.flatMap((group) => (group.roller ?? []).map((role) => mapBrregRole(role, orgNumber))) ?? [];
  }

  async getFinancialStatements(orgNumber: string) {
    const response = await fetchJson<{ aarsregnskap?: Record<string, any>[] }>(`${env.brregBaseUrl.replace("/enhetsregisteret/api", "/regnskapsregisteret/api")}/regnskap/${orgNumber}`);

    return (response.aarsregnskap ?? []).map((statement) => mapBrregFinancialStatement(statement, orgNumber));
  }
}