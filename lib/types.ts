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
  holderType?: "PERSON" | "COMPANY";
  person: {
    fullName: string;
    birthYear?: number | null;
  } & SourceMetadata;
  organization?: ({
    name: string;
    orgNumber?: string | null;
    legalForm?: string | null;
    approvalStatus?: string | null;
    status?: string | null;
  } & SourceMetadata) | null;
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
    url?: string;
  }[];
};

export type NormalizedAnnouncement = SourceMetadata & {
  id: string;
  orgNumber: string;
  title: string;
  publishedAt?: Date | null;
  year?: number | null;
  detailUrl: string;
};

export type NormalizedAnnouncementDetail = SourceMetadata & {
  id: string;
  orgNumber: string;
  title: string;
  publishedAt?: Date | null;
  sourceLabel?: string | null;
  detailUrl: string;
  contentHtml: string;
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
  municipality?: string;
  municipalityNumber?: string;
  legalForm?: string;
  status?: "ACTIVE" | "DISSOLVED" | "BANKRUPT";
  page?: number;
  size?: number;
};

export type SearchInterpretationLocationType = "MUNICIPALITY" | "COUNTY" | "POSTAL_CITY" | "UNKNOWN";

export type SearchInterpretation = {
  originalQuery: string;
  rewrittenQuery: string;
  aiAssisted: boolean;
  fallbackReason?: string | null;
  companyTerms: string[];
  industryTerms: string[];
  geographicTerm?: string | null;
  geographicType?: SearchInterpretationLocationType | null;
  intentSummary?: string | null;
  matchedIndustryCodes: Array<{
    code: string;
    title?: string | null;
    score: number;
  }>;
};

export type RankedCompanySearchResult = {
  company: NormalizedCompany;
  relevanceScore: number;
  revenue?: number | null;
  revenueFiscalYear?: number | null;
  matchReasons: string[];
};

export type CompanySearchResponse = {
  results: RankedCompanySearchResult[];
  interpretation: SearchInterpretation;
};

export type CompanyProfile = {
  company: NormalizedCompany;
  roles: NormalizedRole[];
  rolesAvailability: DataAvailability;
  financialStatements: NormalizedFinancialStatement[];
  financialDocuments: NormalizedFinancialDocument[];
  financialsAvailability: DataAvailability;
  regulatoryAvailability: DataAvailability;
};

export type ShareholderType = "PERSON" | "COMPANY" | "UNKNOWN";
export type ShareholdingSourceSystem = "SKATTEETATEN_CSV" | "SKATTEETATEN_API";
export type ShareholdingGraphNodeType =
  | "COMPANY"
  | "PERSON"
  | "COMPANY_SHAREHOLDER"
  | "UNKNOWN_SHAREHOLDER";

export type ShareholdingImportErrorRecord = {
  stage: string;
  rowNumber?: number | null;
  message: string;
  payload?: unknown;
};

export type NormalizedShareholder = {
  id: string;
  type: ShareholderType;
  name: string;
  normalizedName: string;
  birthYear?: number | null;
  postalCode?: string | null;
  postalPlace?: string | null;
  externalIdentifier?: string | null;
  linkedCompanyId?: string | null;
  linkedCompanyOrgNumber?: string | null;
  linkedCompanyName?: string | null;
  matchConfidence?: number | null;
};

export type NormalizedOwnership = {
  id: string;
  snapshotId: string;
  companyId: string;
  shareholderId: string;
  shareClass?: string | null;
  numberOfShares: string;
  ownershipPercent?: number | null;
  ownershipPercentRaw?: string | null;
  ownershipBasis?: string | null;
  dataQualityNote?: string | null;
  isDirect: boolean;
};

export type ShareholdingGraphNode = {
  id: string;
  type: ShareholdingGraphNodeType;
  label: string;
  metadata?: {
    orgNumber?: string | null;
    companyId?: string | null;
    shareholderId?: string | null;
    confidence?: number | null;
    typeLabel?: string | null;
  };
};

export type ShareholdingGraphEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: "OWNS";
  percent?: number | null;
  percentRaw?: string | null;
  shares?: string | null;
  shareClass?: string | null;
};

export type ShareholdingGraphSnapshot = {
  snapshotId: string;
  companyId: string;
  companyOrgNumber: string;
  companyName: string;
  taxYear: number;
  totalShares?: string | null;
  shareholderCount: number;
  source: ShareholdingSourceSystem;
  sourceImportedAt: Date;
  latestAvailableYear?: number | null;
  dataQualityNote?: string | null;
  availabilityMessage?: string | null;
  nodes: ShareholdingGraphNode[];
  edges: ShareholdingGraphEdge[];
  ownerships: NormalizedOwnership[];
  shareholders: NormalizedShareholder[];
};

export type BrregLegalEntity = {
  id: string;
  orgNumber: string;
  name: string;
  entityType: "MAIN_ENTITY" | "SUBUNIT";
  companyForm?: string | null;
  status: "ACTIVE" | "DISSOLVED" | "BANKRUPT";
  registrationDate?: Date | null;
  foundationDate?: Date | null;
  parentOrgNumber?: string | null;
  parentName?: string | null;
  address?: string | null;
  postalAddress?: string | null;
  industryCode?: string | null;
  industryDescription?: string | null;
  source: "BRREG";
  rawPayload?: unknown;
};

export type BrregSubunit = {
  id: string;
  orgNumber: string;
  name: string;
  parentOrgNumber: string;
  address?: string | null;
  status: "ACTIVE" | "DISSOLVED" | "BANKRUPT";
  source: "BRREG";
  rawPayload?: unknown;
};

export type BrregRoleHolder = {
  id: string;
  type: "PERSON" | "COMPANY";
  name: string;
  birthYear?: number | null;
  orgNumber?: string | null;
  source: "BRREG";
};

export type BrregRoleAssignment = {
  id: string;
  entityOrgNumber: string;
  roleHolderId: string;
  roleType: string;
  roleGroup: string;
  source: "BRREG";
};

export type BrregAuthorityRule = {
  id: string;
  entityOrgNumber: string;
  type: "SIGNATURE" | "PROCURATION";
  rawText: string;
  structuredInterpretation?: string | null;
  relatedRoleHolders: string[];
};

export type BrregStructureNode = {
  id: string;
  type: "main_entity" | "subunit" | "related_entity" | "person" | "advisor";
  label: string;
  metadata?: {
    orgNumber?: string | null;
    companyForm?: string | null;
    status?: string | null;
    roleSummary?: string | null;
    trustNote?: string | null;
  };
};

export type BrregStructureEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType:
    | "HAS_SUBUNIT"
    | "HAS_ROLE_HOLDER"
    | "HAS_SIGNATURE_RULE"
    | "HAS_PROCURATION_RULE"
    | "RELATED_ENTITY";
  label: string;
  priority: "high" | "medium" | "low";
};

export type BrregLegalStructureSnapshot = {
  entity: BrregLegalEntity;
  subunits: BrregSubunit[];
  roleHolders: BrregRoleHolder[];
  roleAssignments: BrregRoleAssignment[];
  authorityRules: BrregAuthorityRule[];
  nodes: BrregStructureNode[];
  edges: BrregStructureEdge[];
  fetchedAt: Date;
  availability: {
    subunits: boolean;
    roles: boolean;
    signature: boolean;
    procuration: boolean;
  };
};
