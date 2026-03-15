import { SearchFilters, NormalizedCompany, NormalizedFinancialStatement, NormalizedRole } from "@/lib/types";

export interface CompanyProvider {
  searchCompanies(filters: SearchFilters): Promise<NormalizedCompany[]>;
  getCompany(orgNumberOrSlug: string): Promise<NormalizedCompany | null>;
  getRoles(orgNumber: string): Promise<NormalizedRole[]>;
  getFinancialStatements(orgNumber: string): Promise<NormalizedFinancialStatement[]>;
}