import {
  NormalizedAnnouncement,
  NormalizedAnnouncementDetail,
  DataAvailability,
  NormalizedCompany,
  NormalizedFinancialDocument,
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
    documents: NormalizedFinancialDocument[];
    availability: DataAvailability;
  }>;
}

export interface IndustryCodeProvider {
  getIndustryCode(code: string): Promise<NormalizedIndustryCode | null>;
}

export interface RegulatoryOverlayProvider {
  getOverlay(orgNumber: string): Promise<DataAvailability>;
}

export interface AnnouncementsProvider {
  getAnnouncements(orgNumber: string): Promise<{
    announcements: NormalizedAnnouncement[];
    availability: DataAvailability;
    allAnnouncementsUrl?: string | null;
  }>;

  getAnnouncementDetail(
    orgNumber: string,
    announcementId: string,
    publishedAt?: Date | null,
  ): Promise<NormalizedAnnouncementDetail | null>;
}
