import { PetroleumEntityType } from "@/lib/types";

export type PetroleumCompanyLinkSnapshot = {
  npdCompanyId: number;
  companyName: string;
  orgNumber?: string | null;
  factPageUrl?: string | null;
  activeOnNcsCurrent?: boolean | null;
  activeOnNcsFormer?: boolean | null;
  licenceOperatorCurrent?: boolean | null;
  licenceLicenseeCurrent?: boolean | null;
  tufOperatorCurrent?: boolean | null;
  tufPartnerCurrent?: boolean | null;
  linkedCompanyOrgNumber?: string | null;
  linkedCompanySlug?: string | null;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
  rawPayload?: unknown;
};

export type PetroleumEntitySnapshotBase = {
  npdId: number;
  slug: string;
  name: string;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
  rawPayload?: unknown;
};

export type PetroleumFieldSnapshot = PetroleumEntitySnapshotBase & {
  activityStatus?: string | null;
  discoveryYear?: number | null;
  ownerKind?: string | null;
  ownerName?: string | null;
  operatorCompanyName?: string | null;
  operatorNpdCompanyId?: number | null;
  operatorOrgNumber?: string | null;
  operatorCompanySlug?: string | null;
  mainSupplyBase?: string | null;
  hydrocarbonType?: string | null;
  mainArea?: string | null;
  discoveryWellboreName?: string | null;
  factPageUrl?: string | null;
  factMapUrl?: string | null;
  geometry?: unknown;
  bbox?: unknown;
  centroid?: unknown;
  operatorHistory?: unknown;
  licensees?: unknown;
  ownerHistory?: unknown;
};

export type PetroleumDiscoverySnapshot = PetroleumEntitySnapshotBase & {
  activityStatus?: string | null;
  discoveryYear?: number | null;
  ownerKind?: string | null;
  ownerName?: string | null;
  operatorCompanyName?: string | null;
  operatorNpdCompanyId?: number | null;
  operatorOrgNumber?: string | null;
  operatorCompanySlug?: string | null;
  hydrocarbonType?: string | null;
  areaName?: string | null;
  relatedFieldName?: string | null;
  relatedFieldNpdId?: number | null;
  factPageUrl?: string | null;
  factMapUrl?: string | null;
  geometry?: unknown;
  bbox?: unknown;
  centroid?: unknown;
  operatorHistory?: unknown;
};

export type PetroleumLicenceSnapshot = PetroleumEntitySnapshotBase & {
  licensingActivityName?: string | null;
  status?: string | null;
  active?: boolean | null;
  stratigraphical?: string | null;
  currentPhase?: string | null;
  mainArea?: string | null;
  operatorCompanyName?: string | null;
  operatorNpdCompanyId?: number | null;
  operatorOrgNumber?: string | null;
  operatorCompanySlug?: string | null;
  grantedAt?: Date | null;
  validTo?: Date | null;
  originalAreaSqKm?: number | null;
  currentAreaSqKm?: number | null;
  factPageUrl?: string | null;
  factMapUrl?: string | null;
  geometry?: unknown;
  bbox?: unknown;
  centroid?: unknown;
  licensees?: unknown;
  transfers?: unknown;
  registerMessages?: unknown;
};

export type PetroleumFacilitySnapshot = PetroleumEntitySnapshotBase & {
  fixedOrMoveable?: string | null;
  kind?: string | null;
  phase?: string | null;
  functions?: string | null;
  waterDepth?: number | null;
  designLifetime?: number | null;
  startupDate?: Date | null;
  belongsToName?: string | null;
  belongsToKind?: string | null;
  currentOperatorName?: string | null;
  currentOperatorNpdId?: number | null;
  currentOperatorOrgNumber?: string | null;
  currentOperatorSlug?: string | null;
  factPageUrl?: string | null;
  factMapUrl?: string | null;
  geometry?: unknown;
  bbox?: unknown;
  centroid?: unknown;
};

export type PetroleumTufSnapshot = PetroleumEntitySnapshotBase & {
  currentPhase?: string | null;
  mainGroupingName?: string | null;
  medium?: string | null;
  belongsToName?: string | null;
  belongsToNpdId?: number | null;
  operatorCompanyName?: string | null;
  operatorNpdCompanyId?: number | null;
  operatorOrgNumber?: string | null;
  operatorCompanySlug?: string | null;
  fromFacilityName?: string | null;
  toFacilityName?: string | null;
  dimensionInch?: number | null;
  waterDepth?: number | null;
  factPageUrl?: string | null;
  factMapUrl?: string | null;
  geometry?: unknown;
  bbox?: unknown;
  centroid?: unknown;
};

export type PetroleumSurveySnapshot = PetroleumEntitySnapshotBase & {
  status?: string | null;
  category?: string | null;
  mainType?: string | null;
  subType?: string | null;
  geographicalArea?: string | null;
  companyName?: string | null;
  companyNpdId?: number | null;
  startedAt?: Date | null;
  finalizedAt?: Date | null;
  plannedFromDate?: Date | null;
  plannedToDate?: Date | null;
  factPageUrl?: string | null;
  geometry?: unknown;
  bbox?: unknown;
  centroid?: unknown;
};

export type PetroleumProductionPointSnapshot = {
  entityType: PetroleumEntityType;
  entityNpdId: number;
  entityName: string;
  year: number;
  month?: number | null;
  period?: string | null;
  oilNetMillSm3?: number | null;
  gasNetBillSm3?: number | null;
  condensateNetMillSm3?: number | null;
  nglNetMillSm3?: number | null;
  oeNetMillSm3?: number | null;
  producedWaterMillSm3?: number | null;
  investmentsMillNok?: number | null;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
  rawPayload?: unknown;
};

export type PetroleumReserveSnapshotRecord = {
  entityType: PetroleumEntityType;
  entityNpdId: number;
  entityName: string;
  updatedAtSource?: Date | null;
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
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
  rawPayload?: unknown;
};

export type PetroleumInvestmentSnapshotRecord = {
  entityType: PetroleumEntityType;
  entityNpdId: number;
  entityName: string;
  expectedFutureInvestmentMillNok?: number | null;
  fixedYear?: number | null;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
  rawPayload?: unknown;
};

export type PetroleumEventSnapshot = {
  externalId: string;
  source: string;
  eventType: string;
  title: string;
  summary?: string | null;
  publishedAt?: Date | null;
  detailUrl?: string | null;
  entityType?: PetroleumEntityType | null;
  entityNpdId?: number | null;
  entityName?: string | null;
  relatedCompanyName?: string | null;
  relatedCompanyOrgNumber?: string | null;
  relatedCompanySlug?: string | null;
  geometry?: unknown;
  centroid?: unknown;
  tags?: unknown;
  metrics?: unknown;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
  rawPayload?: unknown;
};

export type PetroleumCoreSyncPayload = {
  companyLinks: PetroleumCompanyLinkSnapshot[];
  fields: PetroleumFieldSnapshot[];
  discoveries: PetroleumDiscoverySnapshot[];
  licences: PetroleumLicenceSnapshot[];
  facilities: PetroleumFacilitySnapshot[];
  tufs: PetroleumTufSnapshot[];
  surveys: PetroleumSurveySnapshot[];
};

export type PetroleumMetricsSyncPayload = {
  productionPoints: PetroleumProductionPointSnapshot[];
  reserveSnapshots: PetroleumReserveSnapshotRecord[];
  investmentSnapshots: PetroleumInvestmentSnapshotRecord[];
};

export type PetroleumEventsSyncPayload = {
  events: PetroleumEventSnapshot[];
  availabilityMessage?: string | null;
};
