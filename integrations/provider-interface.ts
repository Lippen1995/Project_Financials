import {
  DataAvailability,
  NormalizedCompany,
  NormalizedFinancialStatement,
  NormalizedIndustryCode,
  NormalizedRole,
  SearchFilters,
} from "@/lib/types";

export interface CompanySearchProvider {
  searchCompanies(filters: SearchFilters): Promise<NormalizedCompany[]>;
}

export interface CompanyProfileProvider {
  getCompany(orgNumberOrSlug: string): Promise<NormalizedCompany | null>;
}

export interface RolesProvider {
  getRoles(orgNumber: string): Promise<NormalizedRole[]>;
}

export interface FinancialsProvider {
  getFinancialStatements(orgNumber: string): Promise<{
    statements: NormalizedFinancialStatement[];
    availability: DataAvailability;
  }>;
}

export interface IndustryCodeProvider {
  getIndustryCode(code: string): Promise<NormalizedIndustryCode | null>;
}

export interface RegulatoryOverlayProvider {
  getOverlay(orgNumber: string): Promise<DataAvailability>;
}
