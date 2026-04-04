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

export type CompanyStatus = "ACTIVE" | "DISSOLVED" | "BANKRUPT";
export type DistressStatus =
  | "RECONSTRUCTION"
  | "BANKRUPTCY"
  | "LIQUIDATION"
  | "FORCED_PROCESS"
  | "FOREIGN_INSOLVENCY"
  | "OTHER_DISTRESS";

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

export type PetroleumLayerId =
  | "fields"
  | "discoveries"
  | "licences"
  | "facilities"
  | "tuf"
  | "wellbores"
  | "surveys"
  | "regulatoryEvents"
  | "gasscoEvents";

export type PetroleumEntityType =
  | "FIELD"
  | "DISCOVERY"
  | "LICENCE"
  | "FACILITY"
  | "TUF"
  | "SURVEY"
  | "WELLBORE";
export type PetroleumMarketTab =
  | "market"
  | "exploration"
  | "wells"
  | "infrastructure"
  | "seismic"
  | "seabed"
  | "companies"
  | "events"
  | "concepts";
export type PetroleumProductSeries =
  | "oil"
  | "gas"
  | "ngl"
  | "condensate"
  | "liquids"
  | "oe"
  | "producedWater";
export type PetroleumMetricView = "volume" | "rate";
export type PetroleumRateUnit = "boepd" | "msm3" | "billSm3" | "nok";
export type PetroleumTimeSeriesEntityType = "field" | "operator" | "area";
export type PetroleumTimeSeriesGranularity = "month" | "year";
export type PetroleumTimeSeriesComparison = "none" | "yoy" | "ytd" | "forecast";
export type PetroleumTimeSeriesMeasure = PetroleumProductSeries | "investments";

export type PetroleumCoordinate = [number, number];
export type PetroleumGeometry =
  | {
      type: "Point";
      coordinates: PetroleumCoordinate;
    }
  | {
      type: "LineString";
      coordinates: PetroleumCoordinate[];
    }
  | {
      type: "Polygon";
      coordinates: PetroleumCoordinate[][];
    }
  | {
      type: "MultiPolygon";
      coordinates: PetroleumCoordinate[][][];
    };

export type PetroleumBbox = [number, number, number, number];

export type PetroleumLinkedCompany = {
  npdCompanyId?: number | null;
  companyName: string;
  orgNumber?: string | null;
  slug?: string | null;
  activeOnNcs?: boolean | null;
};

export type PetroleumEntityCompanyInterest = {
  npdCompanyId?: number | null;
  companyName: string;
  orgNumber?: string | null;
  slug?: string | null;
  share?: number | null;
  sdfiShare?: number | null;
  validFrom?: Date | null;
  validTo?: Date | null;
  role?: string | null;
};

export type PetroleumMapFeature = SourceMetadata & {
  id: string;
  layerId: PetroleumLayerId;
  entityType: PetroleumEntityType;
  entityId: string;
  entityNpdId?: number | null;
  name: string;
  geometry: PetroleumGeometry;
  bbox?: PetroleumBbox | null;
  centroid?: PetroleumCoordinate | null;
  status?: string | null;
  area?: string | null;
  hcType?: string | null;
  operator?: PetroleumLinkedCompany | null;
  relatedFieldName?: string | null;
  latestProductionOe?: number | null;
  remainingOe?: number | null;
  expectedFutureInvestmentNok?: number | null;
  selectedProductionValue?: number | null;
  selectedProductionUnit?: PetroleumRateUnit | null;
  selectedProductionLabel?: string | null;
  productionYoYPercent?: number | null;
  currentAreaSqKm?: number | null;
  transferCount?: number | null;
  facilityKind?: string | null;
  category?: string | null;
  subType?: string | null;
  companyName?: string | null;
  surveyYear?: number | null;
  startedAt?: Date | null;
  finalizedAt?: Date | null;
  plannedFromDate?: Date | null;
  plannedToDate?: Date | null;
  wellType?: string | null;
  purpose?: string | null;
  waterDepth?: number | null;
  totalDepth?: number | null;
  detailUrl?: string | null;
  factPageUrl?: string | null;
  factMapUrl?: string | null;
};

export type PetroleumEventRow = SourceMetadata & {
  id: string;
  source: "HAVTIL" | "GASSCO" | "PETREG";
  eventType: string;
  title: string;
  summary?: string | null;
  publishedAt?: Date | null;
  detailUrl?: string | null;
  tags: string[];
  entityType?: PetroleumEntityType | null;
  entityId?: string | null;
  entityNpdId?: number | null;
  entityName?: string | null;
  relatedCompany?: PetroleumLinkedCompany | null;
  geometry?: PetroleumGeometry | null;
  centroid?: PetroleumCoordinate | null;
};

export type PetroleumReserveSnapshot = {
  entityType: PetroleumEntityType;
  entityId: string;
  entityNpdId: number;
  entityName: string;
  updatedAt?: Date | null;
  recoverableOil?: number | null;
  recoverableGas?: number | null;
  recoverableNgl?: number | null;
  recoverableCondensate?: number | null;
  recoverableOe?: number | null;
  remainingOil?: number | null;
  remainingGas?: number | null;
  remainingNgl?: number | null;
  remainingCondensate?: number | null;
  remainingOe?: number | null;
};

export type PetroleumInvestmentSnapshot = {
  entityType: PetroleumEntityType;
  entityId: string;
  entityNpdId: number;
  entityName: string;
  expectedFutureInvestmentNok?: number | null;
  fixedYear?: number | null;
};

export type PetroleumTimeSeriesPoint = {
  key: string;
  entityType: PetroleumTimeSeriesEntityType;
  label: string;
  year: number;
  month?: number | null;
  dayCount?: number | null;
  oil?: number | null;
  gas?: number | null;
  liquids?: number | null;
  condensate?: number | null;
  ngl?: number | null;
  oe?: number | null;
  producedWater?: number | null;
  investments?: number | null;
  oilRate?: number | null;
  gasRate?: number | null;
  liquidsRate?: number | null;
  condensateRate?: number | null;
  nglRate?: number | null;
  oeRate?: number | null;
  producedWaterRate?: number | null;
  selectedValue?: number | null;
  selectedRate?: number | null;
  selectedUnit?: PetroleumRateUnit | null;
  forecastValue?: number | null;
  forecastRate?: number | null;
  forecastDeviation?: number | null;
};

export type PetroleumForecastSnapshot = SourceMetadata & {
  id: string;
  scope: "NCS" | "FILTERED";
  sourceLabel: string;
  title: string;
  summary?: string | null;
  publishedAt?: Date | null;
  horizonLabel?: string | null;
  appliesToProduct?: PetroleumProductSeries | null;
  forecastScopeLabel?: string | null;
  trendLabel?: string | null;
  declineRatePercent?: number | null;
  investmentLevelNok?: number | null;
  keyPoints: string[];
  detailUrl?: string | null;
  backgroundDataUrl?: string | null;
};

export type PetroleumPublicationSnapshot = SourceMetadata & {
  id: string;
  category: "MONTHLY_PRODUCTION" | "SHELF_YEAR" | "RESOURCE_REPORT";
  title: string;
  summary?: string | null;
  publishedAt?: Date | null;
  detailUrl: string;
  backgroundDataUrl?: string | null;
  pdfUrl?: string | null;
  sheetNames: string[];
};

export type PetroleumConceptEntry = {
  id: string;
  slug: string;
  label: string;
  shortDefinition: string;
  explanation: string;
  relatedConceptIds: string[];
  relatedProducts?: PetroleumProductSeries[];
  sourceLabel: string;
  sourceUrl: string;
};

export type PetroleumBenchmarkSummary = {
  latestProductionYear?: number | null;
  latestProductionOe?: number | null;
  selectedProductionShareOfNcs?: number | null;
  selectedRecoverableOe?: number | null;
  selectedRemainingOe?: number | null;
  selectedHistoricalInvestmentsNok?: number | null;
  selectedFutureInvestmentsNok?: number | null;
  totalFields: number;
  totalLicences: number;
  totalOperators: number;
};

export type PetroleumKpiSummary = {
  activeFieldCount: number;
  activeLicenceCount: number;
  selectedLatestProductionOe?: number | null;
  selectedRemainingOe?: number | null;
  selectedOperatorCount: number;
  recentEventCount: number;
  selectedProduct?: PetroleumProductSeries;
  selectedView?: PetroleumMetricView;
  selectedLatestProductionValue?: number | null;
  selectedLatestProductionUnit?: PetroleumRateUnit | null;
  yoyYtdValue?: number | null;
  yoyYtdDeltaPercent?: number | null;
  currentMonthVsLastYearPercent?: number | null;
  forecastDeviationPercent?: number | null;
};

export type PetroleumOperatorConcentrationRow = {
  operatorName: string;
  operatorOrgNumber?: string | null;
  operatorSlug?: string | null;
  oe?: number | null;
  fieldCount: number;
  latestProductionValue?: number | null;
  latestProductionUnit?: PetroleumRateUnit | null;
};

export type PetroleumRankedFieldRow = {
  entityId: string;
  npdId: number;
  name: string;
  area?: string | null;
  operatorName?: string | null;
  operatorSlug?: string | null;
  status?: string | null;
  oe?: number | null;
  remainingOe?: number | null;
  expectedFutureInvestmentNok?: number | null;
  latestProductionValue?: number | null;
  latestProductionUnit?: PetroleumRateUnit | null;
};

export type PetroleumFilterOption = {
  value: string;
  label: string;
  count: number;
};

export type PetroleumFilterOptions = {
  statuses: PetroleumFilterOption[];
  areas: PetroleumFilterOption[];
  operators: PetroleumFilterOption[];
  licensees: PetroleumFilterOption[];
  hcTypes: PetroleumFilterOption[];
};

export type PetroleumSeismicFilterOptions = {
  categories: PetroleumFilterOption[];
  statuses: PetroleumFilterOption[];
  areas: PetroleumFilterOption[];
  operators: PetroleumFilterOption[];
  years: PetroleumFilterOption[];
};

export type PetroleumSeismicKpiSummary = {
  surveyCount: number;
  plannedSurveyCount: number;
  ongoingSurveyCount: number;
  completedSurveyCount: number;
  wellboreCount: number;
  explorationWellCount: number;
  latestSurveyYear?: number | null;
};

export type PetroleumSeismicHighlight = {
  entityType: "SURVEY" | "WELLBORE";
  entityId: string;
  npdId: number;
  name: string;
  status?: string | null;
  category?: string | null;
  area?: string | null;
  operatorName?: string | null;
  year?: number | null;
};

export type PetroleumSeismicSummaryResponse = {
  kpis: PetroleumSeismicKpiSummary;
  filterOptions: PetroleumSeismicFilterOptions;
  sourceStatus: PetroleumSourceStatus[];
  recentItems: PetroleumSeismicHighlight[];
};

export type PetroleumSeismicTableRow = {
  entityType: "SURVEY" | "WELLBORE";
  entityId: string;
  npdId: number;
  name: string;
  status?: string | null;
  category?: string | null;
  area?: string | null;
  operatorName?: string | null;
  year?: number | null;
  relatedFieldName?: string | null;
  waterDepth?: number | null;
  totalDepth?: number | null;
  factPageUrl?: string | null;
};

export type PetroleumSeismicTableResponse = {
  items: PetroleumSeismicTableRow[];
  total: number;
  page: number;
  size: number;
};

export type PetroleumSourceStatus = {
  source: "SODIR" | "HAVTIL" | "GASSCO";
  available: boolean;
  message?: string;
  lastSuccessAt?: Date | null;
};

export type PetroleumSummaryResponse = {
  kpis: PetroleumKpiSummary;
  benchmark: PetroleumBenchmarkSummary;
  topFields: PetroleumRankedFieldRow[];
  operatorConcentration: PetroleumOperatorConcentrationRow[];
  filterOptions: PetroleumFilterOptions;
  sourceStatus: PetroleumSourceStatus[];
  latestProductionYear?: number | null;
  selectedProduct: PetroleumProductSeries;
  selectedView: PetroleumMetricView;
  forecast: PetroleumForecastSnapshot | null;
  publications: PetroleumPublicationSnapshot[];
};

export type PetroleumTableMode = "fields" | "licences" | "operators";

export type PetroleumTableRow =
  | {
      mode: "fields";
      entityId: string;
      npdId: number;
      name: string;
      area?: string | null;
      status?: string | null;
      hcType?: string | null;
      operatorName?: string | null;
      operatorSlug?: string | null;
      latestProductionOe?: number | null;
      latestProductionValue?: number | null;
      latestProductionUnit?: PetroleumRateUnit | null;
      remainingOe?: number | null;
      expectedFutureInvestmentNok?: number | null;
    }
  | {
      mode: "licences";
      entityId: string;
      npdId: number;
      name: string;
      area?: string | null;
      status?: string | null;
      currentPhase?: string | null;
      operatorName?: string | null;
      operatorSlug?: string | null;
      currentAreaSqKm?: number | null;
      originalAreaSqKm?: number | null;
      transferCount: number;
    }
  | {
      mode: "operators";
      operatorId: string;
      operatorName: string;
      operatorOrgNumber?: string | null;
      operatorSlug?: string | null;
      fieldCount: number;
      licenceCount: number;
      latestProductionOe?: number | null;
      latestProductionValue?: number | null;
      latestProductionUnit?: PetroleumRateUnit | null;
      remainingOe?: number | null;
    };

export type PetroleumTableResponse = {
  mode: PetroleumTableMode;
  items: PetroleumTableRow[];
  page: number;
  size: number;
  totalCount: number;
};

export type PetroleumEntityDetail = {
  id: string;
  entityType: PetroleumEntityType;
  entityNpdId: number;
  name: string;
  status?: string | null;
  area?: string | null;
  hcType?: string | null;
  phase?: string | null;
  geometry?: PetroleumGeometry | null;
  centroid?: PetroleumCoordinate | null;
  factPageUrl?: string | null;
  factMapUrl?: string | null;
  operator?: PetroleumLinkedCompany | null;
  licensees: PetroleumEntityCompanyInterest[];
  reserve?: PetroleumReserveSnapshot | null;
  investment?: PetroleumInvestmentSnapshot | null;
  timeseries: PetroleumTimeSeriesPoint[];
  relatedEvents: PetroleumEventRow[];
  relatedCompanyLinks: PetroleumLinkedCompany[];
  concepts?: PetroleumConceptEntry[];
  metadata: Record<string, string | number | boolean | null>;
};

export type PetroleumMarketFilters = {
  tab?: PetroleumMarketTab;
  layers?: PetroleumLayerId[];
  status?: string[];
  surveyStatuses?: string[];
  surveyCategories?: string[];
  areas?: string[];
  operatorIds?: string[];
  licenseeIds?: string[];
  hcTypes?: string[];
  surveyYearFrom?: number;
  surveyYearTo?: number;
  bbox?: PetroleumBbox | null;
  query?: string;
  product?: PetroleumProductSeries;
  view?: PetroleumMetricView;
  comparison?: PetroleumTimeSeriesComparison;
  tableMode?: PetroleumTableMode;
  page?: number;
  size?: number;
  sort?: string;
};

export type NormalizedDistressProfile = SourceMetadata & {
  distressStatus: DistressStatus;
  statusStartedAt?: Date | null;
  statusObservedAt: Date;
  daysInStatus?: number | null;
  bankruptcyDate?: Date | null;
  liquidationDate?: Date | null;
  forcedProcessDate?: Date | null;
  reconstructionDate?: Date | null;
  foreignInsolvencyDate?: Date | null;
  lastAnnouncementPublishedAt?: Date | null;
  lastAnnouncementTitle?: string | null;
};

export type DistressFinancialSnapshotSummary = {
  distressStatus: DistressStatus;
  daysInStatus?: number | null;
  industryCode?: string | null;
  sectorCode?: string | null;
  sectorLabel?: string | null;
  lastReportedYear?: number | null;
  revenue?: number | null;
  ebit?: number | null;
  netIncome?: number | null;
  equityRatio?: number | null;
  assets?: number | null;
  interestBearingDebt?: number | null;
  distressScore?: number | null;
  scoreVersion?: string | null;
  dataCoverage?: string | null;
  updatedAt: Date;
};

export type DistressStatusSummary = {
  status: DistressStatus;
  label: string;
  statusStartedAt?: Date | null;
  statusObservedAt: Date;
  daysInStatus?: number | null;
  lastAnnouncementPublishedAt?: Date | null;
  lastAnnouncementTitle?: string | null;
};

export type DistressAssetSnapshot = {
  assets?: number | null;
  fixedAssets?: number | null;
  inventory?: number | null;
  receivables?: number | null;
  cash?: number | null;
  interestBearingDebt?: number | null;
  fiscalYear?: number | null;
};

export type DistressFinancialTrend = {
  fiscalYear: number;
  revenue?: number | null;
  ebit?: number | null;
  netIncome?: number | null;
  equity?: number | null;
  assets?: number | null;
  equityRatio?: number | null;
};

export type DistressCoverageSummary = {
  dataCoverage: string;
  financialsAvailable: boolean;
  latestFinancialYear?: number | null;
  sourceNotes: string[];
};

export type DistressDocumentExcerpt = {
  title: string;
  text: string;
  pageNumber?: number | null;
  year: number;
  documentUrl?: string | null;
};

export type DistressOperationsSummary = {
  businessDescription: string;
  employeeCount?: number | null;
  foundedYear?: number | null;
  latestRevenueChange?: number | null;
  latestEbitMargin?: number | null;
  latestNetMargin?: number | null;
  profitableYearsCount: number;
  lossMakingYearsCount: number;
  documentYears: number[];
  annualReportAvailable: boolean;
  annualReportExtractStatus: string;
  notesExtractStatus: string;
  auditReportExtractStatus: string;
  operatingSignals: string[];
  documentNotes: string[];
  documents: NormalizedFinancialDocument[];
  annualReportExcerpts: DistressDocumentExcerpt[];
  notesExcerpts: DistressDocumentExcerpt[];
  auditExcerpts: DistressDocumentExcerpt[];
};

export type DistressCompanyRow = {
  company: Pick<
    NormalizedCompany,
    "orgNumber" | "slug" | "name" | "legalForm" | "status" | "industryCode" | "municipality" | "addresses"
  >;
  distress: DistressStatusSummary;
  sector?: {
    code: string;
    label?: string | null;
  } | null;
  financials: {
    lastReportedYear?: number | null;
    revenue?: number | null;
    ebit?: number | null;
    netIncome?: number | null;
    equityRatio?: number | null;
    assets?: number | null;
    interestBearingDebt?: number | null;
  };
  distressScore?: number | null;
  scoreVersion?: string | null;
  dataCoverage: string;
};

export type DistressCompanyDetail = {
  company: NormalizedCompany;
  distress: DistressStatusSummary;
  sector?: {
    code: string;
    label?: string | null;
  } | null;
  financials: {
    snapshot: DistressFinancialSnapshotSummary | null;
    trends: DistressFinancialTrend[];
  };
  assetSnapshot: DistressAssetSnapshot;
  operations: DistressOperationsSummary;
  coverage: DistressCoverageSummary;
  announcements: NormalizedAnnouncement[];
};

export type DistressSortKey =
  | "name_asc"
  | "name_desc"
  | "distressStatus_asc"
  | "distressStatus_desc"
  | "daysInStatus_desc"
  | "daysInStatus_asc"
  | "industryCode_asc"
  | "industryCode_desc"
  | "sector_asc"
  | "sector_desc"
  | "lastReportedYear_desc"
  | "lastReportedYear_asc"
  | "revenue_desc"
  | "revenue_asc"
  | "ebit_desc"
  | "ebit_asc"
  | "netIncome_desc"
  | "netIncome_asc"
  | "equityRatio_desc"
  | "equityRatio_asc"
  | "assets_desc"
  | "assets_asc"
  | "interestBearingDebt_desc"
  | "interestBearingDebt_asc"
  | "lastAnnouncementPublishedAt_desc"
  | "lastAnnouncementPublishedAt_asc";

export type DistressFilterOption = {
  value: string;
  label: string;
  count: number;
};

export type DistressFilterOptions = {
  statuses: DistressFilterOption[];
  industryCodes: DistressFilterOption[];
  sectors: DistressFilterOption[];
};

export type DistressViewMode = "BEST_FIT" | "ALL";

export type DistressSearchFilters = {
  status?: DistressStatus[];
  minDaysInStatus?: number;
  maxDaysInStatus?: number;
  industryCodes?: string[];
  industryCodePrefix?: string;
  sectorCodes?: string[];
  lastReportedYearFrom?: number;
  lastReportedYearTo?: number;
  page?: number;
  size?: number;
  sort?: DistressSortKey;
  view?: DistressViewMode;
};

export type DistressScreeningResponse = {
  items: DistressCompanyRow[];
  totalCount: number;
  totalUniverseCount: number;
  page: number;
  size: number;
  view: DistressViewMode;
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

export type WorkspaceType = "PERSONAL" | "TEAM";
export type WorkspaceStatus = "ACTIVE" | "ARCHIVED";
export type WorkspaceMemberRole = "OWNER" | "ADMIN" | "MEMBER";
export type WorkspaceInvitationStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELED";
export type DdRoomStatus = "ACTIVE" | "ARCHIVED";
export type DdTaskStage =
  | "COLLECTION"
  | "COMPANY_UNDERSTANDING"
  | "MANAGEMENT_OWNERSHIP"
  | "FINANCIAL_REVIEW"
  | "LEGAL_REGULATORY"
  | "RISK_ASSESSMENT"
  | "CONCLUSION";
export type DdTaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
export type DdTaskPriority = "LOW" | "MEDIUM" | "HIGH";
export type DdWorkstream = "FINANCIAL" | "COMMERCIAL" | "LEGAL" | "OPERATIONAL" | "REGULATORY" | "ESG";
export type DdFindingSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type DdFindingStatus = "OPEN" | "IN_REVIEW" | "MITIGATED" | "ACCEPTED" | "CLOSED";
export type DdFindingImpact =
  | "NONE"
  | "THESIS_RISK"
  | "VALUATION"
  | "DOWNSIDE"
  | "UPSIDE"
  | "MONITORING"
  | "NO_GO";
export type DdFindingEvidenceType =
  | "COMPANY"
  | "ANNOUNCEMENT"
  | "FINANCIAL_STATEMENT"
  | "COMPANY_PROFILE_FIELD"
  | "TASK"
  | "FINDING";
export type DdCompanyProfileField =
  | "STATUS"
  | "LEGAL_FORM"
  | "INDUSTRY_CODE"
  | "EMPLOYEE_COUNT"
  | "REVENUE"
  | "DESCRIPTION";
export type DdDecisionOutcome = "INVEST" | "INVEST_WITH_CONDITIONS" | "WATCH" | "PASS";
export type DdCommentThreadTargetType =
  | "ROOM_POST"
  | "ANNOUNCEMENT"
  | "FINANCIAL_STATEMENT"
  | "FINDING"
  | "TASK";
export type WorkspaceWatchStatus = "ACTIVE" | "ARCHIVED";
export type WorkspaceNotificationType =
  | "ANNOUNCEMENT_NEW"
  | "FINANCIAL_STATEMENT_NEW"
  | "COMPANY_STATUS_CHANGED"
  | "DISTRESS_MATCH";
export type WorkspaceMonitorStatus = "ACTIVE" | "ARCHIVED";

export type WorkspaceCapabilitySet = {
  canManageWorkspace: boolean;
  canInviteMembers: boolean;
  canRemoveMembers: boolean;
  canCreateDdRoom: boolean;
  canManageWatches: boolean;
  canManageMonitors: boolean;
  canManageNotifications: boolean;
  canPostToDdRoom: boolean;
};

export type WorkspaceMemberSummary = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: WorkspaceMemberRole;
  joinedAt: Date;
  isCurrentUser: boolean;
};

export type WorkspaceInvitationSummary = {
  id: string;
  email: string;
  role: WorkspaceMemberRole;
  status: WorkspaceInvitationStatus;
  expiresAt: Date;
  respondedAt?: Date | null;
  createdAt: Date;
  invitedByName?: string | null;
  invitedByEmail?: string | null;
};

export type DdRoomCompanySummary = {
  id: string;
  orgNumber: string;
  slug: string;
  name: string;
  legalForm?: string | null;
  status: "ACTIVE" | "DISSOLVED" | "BANKRUPT";
  industryCode?: {
    code: string;
    title?: string | null;
  } | null;
};

export type DdRoomSummary = {
  id: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  status: DdRoomStatus;
  archivedAt?: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
  primaryCompany: DdRoomCompanySummary;
  postCount: number;
  commentThreadCount: number;
};

export type DdRoomActivityItem = {
  id: string;
  type: "ROOM_CREATED" | "ROOM_ARCHIVED" | "ROOM_REOPENED" | "ROOM_POSTED";
  occurredAt: Date;
  actorLabel: string;
  message: string;
};

export type DdCommentSummary = {
  id: string;
  threadId: string;
  parentCommentId?: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: {
    userId: string;
    name: string | null;
    email: string;
  };
};

export type DdCommentThreadSummary = {
  id: string;
  roomId: string;
  targetType: DdCommentThreadTargetType;
  targetFinancialStatementId?: string | null;
  targetFinancialMetricKey?: string | null;
  targetPostId?: string | null;
  targetFindingId?: string | null;
  targetTaskId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    userId: string;
    name: string | null;
    email: string;
  };
  commentCount: number;
  latestCommentAt?: Date | null;
  comments: DdCommentSummary[];
};

export type DdPostSummary = {
  id: string;
  roomId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: {
    userId: string;
    name: string | null;
    email: string;
  };
  commentThread?: DdCommentThreadSummary | null;
};

export type DdTaskSummary = {
  id: string;
  roomId: string;
  title: string;
  description?: string | null;
  stage: DdTaskStage;
  workstream: DdWorkstream;
  status: DdTaskStatus;
  priority: DdTaskPriority;
  dueAt?: Date | null;
  completedAt?: Date | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  assignee?: {
    userId: string;
    name: string | null;
    email: string;
  } | null;
  createdBy: {
    userId: string;
    name: string | null;
    email: string;
  };
  commentThread?: DdCommentThreadSummary | null;
};

export type DdMandateSummary = {
  roomId: string;
  investmentCase?: string | null;
  thesis?: string | null;
  valueDrivers?: string | null;
  keyRisks?: string | null;
  timeHorizon?: string | null;
  decisionGoal?: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    userId: string;
    name: string | null;
    email: string;
  };
  updatedBy: {
    userId: string;
    name: string | null;
    email: string;
  };
};

export type DdFindingEvidenceSummary = {
  id: string;
  type: DdFindingEvidenceType;
  label: string;
  note?: string | null;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt?: Date | null;
  normalizedAt?: Date | null;
  targetCompanyId?: string | null;
  targetFinancialStatementId?: string | null;
  targetTaskId?: string | null;
  targetFindingId?: string | null;
  targetAnnouncementId?: string | null;
  targetAnnouncementSourceId?: string | null;
  targetAnnouncementSourceSystem?: string | null;
  targetAnnouncementPublishedAt?: Date | null;
  targetCompanyProfileField?: DdCompanyProfileField | null;
  createdAt: Date;
  createdBy: {
    userId: string;
    name: string | null;
    email: string;
  };
};

export type DdFindingSummary = {
  id: string;
  roomId: string;
  taskId?: string | null;
  title: string;
  description?: string | null;
  stage: DdTaskStage;
  workstream: DdWorkstream;
  severity: DdFindingSeverity;
  status: DdFindingStatus;
  impact: DdFindingImpact;
  recommendedAction?: string | null;
  isBlocking: boolean;
  dueAt?: Date | null;
  resolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignee?: {
    userId: string;
    name: string | null;
    email: string;
  } | null;
  createdBy: {
    userId: string;
    name: string | null;
    email: string;
  };
  linkedTask?: {
    id: string;
    title: string;
  } | null;
  evidence: DdFindingEvidenceSummary[];
  commentThread?: DdCommentThreadSummary | null;
  handoffWatch?: {
    id: string;
    status: WorkspaceWatchStatus;
    companyId: string;
    createdAt: Date;
  } | null;
};

export type DdConclusionSummary = {
  roomId: string;
  investmentCaseSummary?: string | null;
  valueDriversSummary?: string | null;
  keyRisksSummary?: string | null;
  recommendationRationale?: string | null;
  monitoringPlan?: string | null;
  outcome?: DdDecisionOutcome | null;
  isFinal: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    userId: string;
    name: string | null;
    email: string;
  };
  updatedBy: {
    userId: string;
    name: string | null;
    email: string;
  };
};

export type DdDecisionLogEntrySummary = {
  id: string;
  roomId: string;
  conclusionId?: string | null;
  outcome?: DdDecisionOutcome | null;
  isFinal: boolean;
  investmentCaseSummary?: string | null;
  valueDriversSummary?: string | null;
  keyRisksSummary?: string | null;
  recommendationRationale?: string | null;
  monitoringPlan?: string | null;
  note?: string | null;
  createdAt: Date;
  createdBy: {
    userId: string;
    name: string | null;
    email: string;
  };
};

export type DdWorkstreamSummary = {
  workstream: DdWorkstream;
  label: string;
  description: string;
  order: number;
  taskCount: number;
  openFindingCount: number;
  blockingFindingCount: number;
};

export type DdEvidenceContext = {
  company: {
    id: string;
    name: string;
    orgNumber: string;
    sourceSystem: string;
    sourceEntityType: string;
    sourceId: string;
    fetchedAt: Date;
    normalizedAt: Date;
  };
  financialStatements: Array<{
    id: string;
    fiscalYear: number;
    sourceSystem: string;
    sourceEntityType: string;
    sourceId: string;
    fetchedAt: Date;
    normalizedAt: Date;
  }>;
  companyProfileFields: Array<{
    field: DdCompanyProfileField;
    label: string;
    value: string;
    sourceSystem: string;
    sourceEntityType: string;
    sourceId: string;
    fetchedAt: Date;
    normalizedAt: Date;
  }>;
};

export type DdWorkflowStageSummary = {
  stage: DdTaskStage;
  label: string;
  description: string;
  order: number;
  totalTasks: number;
  completedTasks: number;
  activeTasks: number;
  blockedTasks: number;
  completionRate: number;
  tasks: DdTaskSummary[];
};

export type DdRoomDetail = {
  room: DdRoomSummary;
  workspace: Pick<CurrentWorkspaceSummary, "id" | "name" | "type" | "status" | "role" | "capabilities" | "members">;
  activity: DdRoomActivityItem[];
  posts: {
    items: DdPostSummary[];
    totalCount: number;
  };
  mandate?: DdMandateSummary | null;
  workflow: {
    stages: DdWorkflowStageSummary[];
    workstreams: DdWorkstreamSummary[];
    totalTasks: number;
    completedTasks: number;
    completionRate: number;
    activeWorkstream?: DdWorkstream | null;
  };
  findings: {
    items: DdFindingSummary[];
    totalCount: number;
    openCount: number;
    blockingOpenCount: number;
    criticalOpenCount: number;
    monitoringReadyCount: number;
    activeWorkstream?: DdWorkstream | null;
  };
  conclusion?: DdConclusionSummary | null;
  decisionHistory: DdDecisionLogEntrySummary[];
  evidenceContext: DdEvidenceContext;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  type: WorkspaceType;
  status: WorkspaceStatus;
  role: WorkspaceMemberRole;
  memberCount: number;
  activeDdRoomCount: number;
  archivedDdRoomCount: number;
  activeWatchCount: number;
  archivedWatchCount: number;
  unreadNotificationCount: number;
};

export type WorkspaceWatchSummary = {
  id: string;
  workspaceId: string;
  status: WorkspaceWatchStatus;
  watchAnnouncements: boolean;
  watchFinancialStatements: boolean;
  watchStatusChanges: boolean;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  company: DdRoomCompanySummary;
};

export type WorkspaceNotificationSummary = {
  id: string;
  workspaceId: string;
  type: WorkspaceNotificationType;
  title: string;
  body: string;
  createdAt: Date;
  readAt?: Date | null;
  metadata?: unknown;
  company?: DdRoomCompanySummary | null;
  watch?: {
    id: string;
    status: WorkspaceWatchStatus;
  } | null;
};

export type WorkspaceMonitorMatchSummary = {
  company: DdRoomCompanySummary;
  matchedAt: Date;
  statusObservedAt?: Date | null;
};

export type WorkspaceMonitorSummary = {
  id: string;
  workspaceId: string;
  name: string;
  status: WorkspaceMonitorStatus;
  industryCodePrefix?: string | null;
  minEmployees?: number | null;
  maxEmployees?: number | null;
  minRevenue?: number | null;
  maxRevenue?: number | null;
  companyStatus?: CompanyStatus | null;
  minimumDaysInStatus?: number | null;
  unsupportedReason?: string | null;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  matchCount: number;
  matches: WorkspaceMonitorMatchSummary[];
};

export type CurrentWorkspaceSummary = WorkspaceSummary & {
  capabilities: WorkspaceCapabilitySet;
  members: WorkspaceMemberSummary[];
  invitations: WorkspaceInvitationSummary[];
  activeDdRooms: DdRoomSummary[];
  archivedDdRooms: DdRoomSummary[];
  activeWatches: WorkspaceWatchSummary[];
  archivedWatches: WorkspaceWatchSummary[];
  unreadNotifications: WorkspaceNotificationSummary[];
  readNotifications: WorkspaceNotificationSummary[];
  activeMonitors: WorkspaceMonitorSummary[];
  archivedMonitors: WorkspaceMonitorSummary[];
};

export type CompanyDdDiscussionRoomSummary = {
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  workspaceType: WorkspaceType;
  lastActivityAt: Date;
};

export type CompanyDdDiscussionContext = {
  rooms: CompanyDdDiscussionRoomSummary[];
  selectedRoomId: string;
  selectedRoomName: string;
};

export type CompanyFinancialStatementDiscussionSummary = {
  financialStatementId: string;
  fiscalYear: number;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
  thread?: DdCommentThreadSummary | null;
};

export type CompanyFinancialMetricDiscussionSummary = {
  financialStatementId: string;
  fiscalYear: number;
  metricKey: string;
  thread: DdCommentThreadSummary;
};
