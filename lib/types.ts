export type SourceMetadata = {
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
  rawPayload?: unknown;
};

export type DataAvailability = {
  available: boolean;
  message?: string;
  sourceSystem?: string;
};

export type NormalizedIndustryCode = SourceMetadata & {
  code: string;
  title?: string | null;
  description?: string | null;
  level?: string | null;
  parentCode?: string | null;
};

export type NormalizedAddress = SourceMetadata & {
  line1: string;
  line2?: string | null;
  postalCode: string;
  city: string;
  region?: string | null;
  country: string;
};

export type NormalizedRole = SourceMetadata & {
  title: string;
  isBoardRole: boolean;
  fromDate?: Date | null;
  toDate?: Date | null;
  person: {
    fullName: string;
    birthYear?: number | null;
  } & SourceMetadata;
};

export type NormalizedFinancialStatement = SourceMetadata & {
  fiscalYear: number;
  currency: string;
  revenue?: number | null;
  operatingProfit?: number | null;
  netIncome?: number | null;
  equity?: number | null;
  assets?: number | null;
};

export type NormalizedFinancialDocument = SourceMetadata & {
  year: number;
  files: {
    type: string;
    id: string;
    label: string;
  }[];
};

export type NormalizedCompany = SourceMetadata & {
  orgNumber: string;
  name: string;
  slug: string;
  legalForm?: string | null;
  status: "ACTIVE" | "DISSOLVED" | "BANKRUPT";
  registeredAt?: Date | null;
  foundedAt?: Date | null;
  website?: string | null;
  employeeCount?: number | null;
  description?: string | null;
  municipality?: string | null;
  vatRegistered?: boolean | null;
  shareCapital?: number | null;
  shareCapitalCurrency?: string | null;
  shareCount?: number | null;
  lastSubmittedAnnualReportYear?: number | null;
  announcementsUrl?: string | null;
  addresses: NormalizedAddress[];
  industryCode?: NormalizedIndustryCode | null;
  roles?: NormalizedRole[];
  financialStatements?: NormalizedFinancialStatement[];
};

export type SearchFilters = {
  query?: string;
  industryCode?: string;
  city?: string;
  legalForm?: string;
  status?: "ACTIVE" | "DISSOLVED" | "BANKRUPT";
  page?: number;
  size?: number;
};

export type CompanyProfile = {
  company: NormalizedCompany;
  roles: NormalizedRole[];
  financialStatements: NormalizedFinancialStatement[];
  financialDocuments: NormalizedFinancialDocument[];
  financialsAvailability: DataAvailability;
  regulatoryAvailability: DataAvailability;
};
