export type CompanyMapCompany = {
  orgNumber: string;
  name: string;
  organisationForm: string | null;
  employeeCount: number | null;
  municipality: string | null;
  officialAddressId: string | null;
  latitude: number;
  longitude: number;
  groupLabel: string | null;
  fiscalYear: number | null;
  currency: string | null;
  revenue: string | null;
  ebit: string | null;
  preTaxProfit: string | null;
  netIncome: string | null;
  equity: string | null;
  totalAssets: string | null;
  profileHref: string;
  statementScope: "COMPANY" | "CONSOLIDATED" | null;
  preTaxProfitStatus: "AVAILABLE" | "MISSING" | "AMBIGUOUS" | null;
  financialSource: {
    sourceSystem: string;
    publishedAt: string | null;
    fetchedAt: string;
    normalizedAt: string;
  } | null;
};

export type CompanyMapListData = {
  companies: CompanyMapCompany[];
  page: {
    total: number;
    withRevenue: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  provenance: {
    groupTaxYear: number;
  };
};

export type CompanyMapCoverageData = {
  coverage: {
    eligible: number;
    plotted: number;
    omitted: number;
    coveragePercent: number;
    omissions: Array<{ reason: string; count: number }>;
    financialCoverage: {
      metric: string;
      withMetric: number;
      withoutMetric: number;
      eligibleCoveragePercent: number;
    };
  };
};

export const COMPANY_MAP_OMISSION_LABELS: Record<string, string> = {
  NO_BUSINESS_ADDRESS: "Ingen registrert forretningsadresse",
  INCOMPLETE_OR_INVALID: "Ufullstendig eller ugyldig adresse",
  NON_GEOGRAPHIC_ADDRESS: "Ikke-geografisk adresse",
  NO_EXACT_MATCH: "Ingen eksakt treff i matrikkelen",
  AMBIGUOUS_EXACT_MATCH: "Flertydig adressetreff",
  OUTSIDE_NORWAY: "Adresse utenfor Norge",
  PRIVACY_WITHHELD: "Koordinater holdt tilbake av personvernhensyn",
  PENDING: "Adresseoppslag pågår",
  PROVIDER_FAILURE: "Feil hos adresseleverandøren",
};
