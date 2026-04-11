import {
  PetroleumCompanyLink,
  PetroleumDiscovery,
  PetroleumEvent,
  PetroleumFacility,
  PetroleumField,
  PetroleumFieldSnapshot,
  PetroleumInvestmentSnapshot,
  PetroleumLicence,
  PetroleumLicenceSnapshot,
  PetroleumProductionPoint,
  PetroleumPublicationSnapshot,
  PetroleumReserveSnapshot,
  PetroleumSurvey,
  PetroleumSyncState,
  PetroleumTuf,
  PetroleumWellbore,
  PetroleumForecastSnapshot,
} from "@prisma/client";

import { fetchGasscoPetroleumEvents } from "@/integrations/gassco/gassco-market-provider";
import { fetchHavtilPetroleumEvents } from "@/integrations/havtil/havtil-market-provider";
import { fetchSodirPetroleumPublicationsData } from "@/integrations/sodir/sodir-publication-provider";
import { getPetroleumConceptById } from "@/lib/petroleum-concepts";
import {
  fetchSodirPetroleumCoreData,
  fetchSodirPetroleumMetricsData,
} from "@/integrations/sodir/sodir-market-provider";
import { normalizeLayerSelection } from "@/lib/petroleum-market";
import {
  PetroleumConceptEntry,
  PetroleumEntityCompanyInterest,
  PetroleumEntityDetail,
  PetroleumEventRow,
  PetroleumFilterOption,
  PetroleumFilterOptions,
  PetroleumForecastSnapshot as PetroleumForecastSnapshotView,
  PetroleumLayerId,
  PetroleumLinkedCompany,
  PetroleumMapFeature,
  PetroleumMarketFilters,
  PetroleumMetricView,
  PetroleumProductSeries,
  PetroleumPublicationSnapshot as PetroleumPublicationSnapshotView,
  PetroleumRateUnit,
  PetroleumSourceStatus,
  PetroleumSummaryResponse,
  PetroleumTableMode,
  PetroleumTableResponse,
  PetroleumTimeSeriesComparison,
  PetroleumTimeSeriesEntityType,
  PetroleumTimeSeriesGranularity,
  PetroleumTimeSeriesMeasure,
  PetroleumTimeSeriesPoint,
} from "@/lib/types";
import {
  countPetroleumFieldSnapshots,
  countPetroleumLicenceSnapshots,
  findPetroleumEntityDetailBySlugOrNpdId,
  findPetroleumInvestmentSnapshotForEntity,
  findPetroleumReserveSnapshotForEntity,
  getCompanySlugLookup,
  getPetroleumSyncState,
  PetroleumFieldSnapshotListInput,
  PetroleumLicenceSnapshotListInput,
  listPetroleumCompanyLinks,
  listPetroleumDiscoveries,
  listPetroleumEvents,
  listPetroleumFacilities,
  listPetroleumForecastSnapshots,
  listPetroleumFieldSnapshots,
  listPetroleumFields,
  listPetroleumInvestmentSnapshots,
  listPetroleumEventsFiltered,
  listPetroleumLicenceSnapshots,
  listPetroleumLicencesByNpdIds,
  listPetroleumLicences,
  listPetroleumOperatorSnapshots,
  listPetroleumPublicationSnapshots,
  listPetroleumProductionPoints,
  listPetroleumProductionPointsForEntity,
  listPetroleumProductionPointsForEntities,
  listPetroleumReserveSnapshots,
  listPetroleumSurveys,
  listPetroleumTufs,
  listPetroleumWellbores,
  replacePetroleumCoreData,
  replacePetroleumEventsForSource,
  replacePetroleumMetricsData,
  replacePetroleumPublicationData,
  upsertPetroleumSyncState,
} from "@/server/persistence/petroleum-market-repository";
import {
  PetroleumCoreSyncPayload,
  PetroleumEventsSyncPayload,
  PetroleumMetricsSyncPayload,
  PetroleumPublicationsSyncPayload,
} from "@/server/services/petroleum-market-types";

type CoreDataset = {
  companyLinks: PetroleumCompanyLink[];
  fields: PetroleumField[];
  discoveries: PetroleumDiscovery[];
  licences: PetroleumLicence[];
  facilities: PetroleumFacility[];
  tufs: PetroleumTuf[];
  surveys: PetroleumSurvey[];
  wellbores: PetroleumWellbore[];
};

type MetricsDataset = {
  productionPoints: PetroleumProductionPoint[];
  reserveSnapshots: PetroleumReserveSnapshot[];
  investmentSnapshots: PetroleumInvestmentSnapshot[];
};

const SYNC_KEYS = {
  core: "petroleum-core",
  metrics: "petroleum-metrics",
  publications: "petroleum-publications",
  havtil: "petroleum-events-havtil",
  gassco: "petroleum-events-gassco",
} as const;

const FEATURE_LIMITS: Record<PetroleumLayerId, number> = {
  fields: 160,
  discoveries: 260,
  licences: 320,
  facilities: 220,
  tuf: 120,
  wellbores: 350,
  surveys: 220,
  regulatoryEvents: 0,
  gasscoEvents: 0,
};


function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function parseJsonArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function parseCoordinate(value: unknown): [number, number] | null {
  return Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
    ? [value[0], value[1]]
    : null;
}

function parseBbox(value: unknown): [number, number, number, number] | null {
  return Array.isArray(value) &&
    value.length === 4 &&
    value.every((entry) => typeof entry === "number")
    ? [value[0], value[1], value[2], value[3]]
    : null;
}

function bboxIntersects(
  candidate: [number, number, number, number] | null,
  target: [number, number, number, number] | null | undefined,
) {
  if (!candidate || !target) {
    return true;
  }

  return !(
    candidate[2] < target[0] ||
    candidate[0] > target[2] ||
    candidate[3] < target[1] ||
    candidate[1] > target[3]
  );
}

function toLinkedCompany(input: {
  npdCompanyId?: number | null;
  companyName?: string | null;
  orgNumber?: string | null;
  companySlug?: string | null;
}): PetroleumLinkedCompany | null {
  if (!input.companyName && !input.npdCompanyId) {
    return null;
  }

  return {
    npdCompanyId: input.npdCompanyId ?? null,
    companyName: input.companyName ?? `Selskap ${input.npdCompanyId ?? ""}`.trim(),
    orgNumber: input.orgNumber ?? null,
    slug: input.companySlug ?? null,
  };
}

function enrichCompanyArray(
  value: unknown,
  companyLookup: Map<number, { linkedCompanyOrgNumber: string | null; linkedCompanySlug: string | null }>,
) {
  return parseJsonArray(value).map((entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }

    const record = entry as Record<string, unknown>;
    const npdCompanyId = typeof record.npdCompanyId === "number" ? record.npdCompanyId : null;
    const company = npdCompanyId ? companyLookup.get(npdCompanyId) : undefined;

    return {
      ...record,
      orgNumber: (record.orgNumber as string | null | undefined) ?? company?.linkedCompanyOrgNumber ?? null,
      companySlug: (record.companySlug as string | null | undefined) ?? company?.linkedCompanySlug ?? null,
    };
  });
}

async function enrichCorePayloadWithCompanyLinks(payload: PetroleumCoreSyncPayload) {
  const orgNumbers = payload.companyLinks
    .map((item) => item.orgNumber)
    .filter((value): value is string => Boolean(value));
  const localCompanies = await getCompanySlugLookup(orgNumbers);

  const companyLinks = payload.companyLinks.map((item) => {
    const localCompany = item.orgNumber ? localCompanies.get(item.orgNumber) : undefined;

    return {
      ...item,
      linkedCompanyOrgNumber: localCompany?.orgNumber ?? null,
      linkedCompanySlug: localCompany?.slug ?? null,
    };
  });

  const companyLookup = new Map(companyLinks.map((item) => [item.npdCompanyId, item]));

  return {
    companyLinks,
    fields: payload.fields.map((item) => {
      const companyLink = item.operatorNpdCompanyId
        ? companyLookup.get(item.operatorNpdCompanyId)
        : undefined;

      return {
        ...item,
        operatorOrgNumber: companyLink?.linkedCompanyOrgNumber ?? item.operatorOrgNumber ?? null,
        operatorCompanySlug: companyLink?.linkedCompanySlug ?? item.operatorCompanySlug ?? null,
        operatorHistory: enrichCompanyArray(item.operatorHistory, companyLookup),
        licensees: enrichCompanyArray(item.licensees, companyLookup),
      };
    }),
    discoveries: payload.discoveries.map((item) => {
      const companyLink = item.operatorNpdCompanyId
        ? companyLookup.get(item.operatorNpdCompanyId)
        : undefined;

      return {
        ...item,
        operatorOrgNumber: companyLink?.linkedCompanyOrgNumber ?? item.operatorOrgNumber ?? null,
        operatorCompanySlug: companyLink?.linkedCompanySlug ?? item.operatorCompanySlug ?? null,
      };
    }),
    licences: payload.licences.map((item) => {
      const companyLink = item.operatorNpdCompanyId
        ? companyLookup.get(item.operatorNpdCompanyId)
        : undefined;

      return {
        ...item,
        operatorOrgNumber: companyLink?.linkedCompanyOrgNumber ?? item.operatorOrgNumber ?? null,
        operatorCompanySlug: companyLink?.linkedCompanySlug ?? item.operatorCompanySlug ?? null,
        licensees: enrichCompanyArray(item.licensees, companyLookup),
        transfers: enrichCompanyArray(item.transfers, companyLookup),
      };
    }),
    facilities: payload.facilities.map((item) => {
      const companyLink = item.currentOperatorNpdId
        ? companyLookup.get(item.currentOperatorNpdId)
        : undefined;

      return {
        ...item,
        currentOperatorOrgNumber:
          companyLink?.linkedCompanyOrgNumber ?? item.currentOperatorOrgNumber ?? null,
        currentOperatorSlug: companyLink?.linkedCompanySlug ?? item.currentOperatorSlug ?? null,
      };
    }),
    tufs: payload.tufs.map((item) => {
      const companyLink = item.operatorNpdCompanyId
        ? companyLookup.get(item.operatorNpdCompanyId)
        : undefined;

      return {
        ...item,
        operatorOrgNumber: companyLink?.linkedCompanyOrgNumber ?? item.operatorOrgNumber ?? null,
        operatorCompanySlug: companyLink?.linkedCompanySlug ?? item.operatorCompanySlug ?? null,
      };
    }),
    surveys: payload.surveys,
    wellbores: payload.wellbores.map((item) => {
      const companyLink = item.drillingOperatorNpdCompanyId
        ? companyLookup.get(item.drillingOperatorNpdCompanyId)
        : undefined;

      return {
        ...item,
        drillingOperatorOrgNumber:
          companyLink?.linkedCompanyOrgNumber ?? item.drillingOperatorOrgNumber ?? null,
        drillingOperatorSlug: companyLink?.linkedCompanySlug ?? item.drillingOperatorSlug ?? null,
      };
    }),
  } satisfies PetroleumCoreSyncPayload;
}

async function enrichMetricsPayloadWithFieldNames(payload: PetroleumMetricsSyncPayload) {
  const fields = await listPetroleumFields();
  const fieldLookup = new Map(fields.map((field) => [field.npdId, field.name]));

  return {
    productionPoints: payload.productionPoints.map((item) => ({
      ...item,
      entityName: fieldLookup.get(item.entityNpdId) ?? item.entityName,
    })),
    reserveSnapshots: payload.reserveSnapshots.map((item) => ({
      ...item,
      entityName: fieldLookup.get(item.entityNpdId) ?? item.entityName,
    })),
    investmentSnapshots: payload.investmentSnapshots.map((item) => ({
      ...item,
      entityName: fieldLookup.get(item.entityNpdId) ?? item.entityName,
    })),
  } satisfies PetroleumMetricsSyncPayload;
}

async function syncCoreData() {
  await upsertPetroleumSyncState({ key: SYNC_KEYS.core, status: "RUNNING" });

  try {
    const payload = await fetchSodirPetroleumCoreData();
    const enrichedPayload = await enrichCorePayloadWithCompanyLinks(payload);
    await replacePetroleumCoreData(enrichedPayload);
    await upsertPetroleumSyncState({
      key: SYNC_KEYS.core,
      status: "SUCCESS",
      markSuccess: true,
      metadata: {
        companyLinks: enrichedPayload.companyLinks.length,
        fields: enrichedPayload.fields.length,
        discoveries: enrichedPayload.discoveries.length,
        licences: enrichedPayload.licences.length,
        facilities: enrichedPayload.facilities.length,
        tufs: enrichedPayload.tufs.length,
        surveys: enrichedPayload.surveys.length,
        wellbores: enrichedPayload.wellbores.length,
      },
    });
  } catch (error) {
    await upsertPetroleumSyncState({
      key: SYNC_KEYS.core,
      status: "ERROR",
      errorMessage: error instanceof Error ? error.message : "Unknown sync error",
    });
    throw error;
  }
}

async function syncMetricsData() {
  await upsertPetroleumSyncState({ key: SYNC_KEYS.metrics, status: "RUNNING" });

  try {
    const payload = await fetchSodirPetroleumMetricsData();
    const enrichedPayload = await enrichMetricsPayloadWithFieldNames(payload);
    await replacePetroleumMetricsData(enrichedPayload);
    await upsertPetroleumSyncState({
      key: SYNC_KEYS.metrics,
      status: "SUCCESS",
      markSuccess: true,
      metadata: {
        productionPoints: enrichedPayload.productionPoints.length,
        reserveSnapshots: enrichedPayload.reserveSnapshots.length,
        investmentSnapshots: enrichedPayload.investmentSnapshots.length,
      },
    });
  } catch (error) {
    await upsertPetroleumSyncState({
      key: SYNC_KEYS.metrics,
      status: "ERROR",
      errorMessage: error instanceof Error ? error.message : "Unknown sync error",
    });
    throw error;
  }
}

async function syncPublicationData() {
  await upsertPetroleumSyncState({ key: SYNC_KEYS.publications, status: "RUNNING" });

  try {
    const payload = await fetchSodirPetroleumPublicationsData();
    await replacePetroleumPublicationData(payload);
    await upsertPetroleumSyncState({
      key: SYNC_KEYS.publications,
      status: "SUCCESS",
      markSuccess: true,
      metadata: {
        forecasts: payload.forecasts.length,
        publications: payload.publications.length,
      },
    });
  } catch (error) {
    await upsertPetroleumSyncState({
      key: SYNC_KEYS.publications,
      status: "ERROR",
      errorMessage: error instanceof Error ? error.message : "Unknown sync error",
    });
    throw error;
  }
}

async function syncEventSource(
  key: keyof typeof SYNC_KEYS,
  source: "HAVTIL" | "GASSCO",
  fetcher: () => Promise<PetroleumEventsSyncPayload>,
) {
  await upsertPetroleumSyncState({ key: SYNC_KEYS[key], status: "RUNNING" });

  try {
    const payload = await fetcher();
    await replacePetroleumEventsForSource(source, payload);
    await upsertPetroleumSyncState({
      key: SYNC_KEYS[key],
      status: "SUCCESS",
      markSuccess: true,
      metadata: {
        count: payload.events.length,
        availabilityMessage: payload.availabilityMessage ?? null,
      },
    });
  } catch (error) {
    await upsertPetroleumSyncState({
      key: SYNC_KEYS[key],
      status: "ERROR",
      errorMessage: error instanceof Error ? error.message : "Unknown sync error",
    });
    throw error;
  }
}

async function getCoreDataset(): Promise<CoreDataset> {
  const [companyLinks, fields, discoveries, licences, facilities, tufs, surveys, wellbores] =
    await Promise.all([
    listPetroleumCompanyLinks(),
    listPetroleumFields(),
    listPetroleumDiscoveries(),
    listPetroleumLicences(),
    listPetroleumFacilities(),
    listPetroleumTufs(),
    listPetroleumSurveys(),
    listPetroleumWellbores(),
    ]);

  return { companyLinks, fields, discoveries, licences, facilities, tufs, surveys, wellbores };
}

async function getFeatureDataset(layers: PetroleumLayerId[]) {
  const needsFields = layers.includes("fields");
  const needsDiscoveries = layers.includes("discoveries");
  const needsLicences = layers.includes("licences");
  const needsFacilities = layers.includes("facilities");
  const needsTufs = layers.includes("tuf");
  const needsSurveys = layers.includes("surveys");
  const needsWellbores = layers.includes("wellbores");
  const needsMetrics = needsFields;

  const [
    fields,
    discoveries,
    licences,
    facilities,
    tufs,
    surveys,
    wellbores,
    productionPoints,
    reserveSnapshots,
    investmentSnapshots,
  ] = await Promise.all([
    needsFields ? listPetroleumFields() : Promise.resolve([] as PetroleumField[]),
    needsDiscoveries ? listPetroleumDiscoveries() : Promise.resolve([] as PetroleumDiscovery[]),
    needsLicences ? listPetroleumLicences() : Promise.resolve([] as PetroleumLicence[]),
    needsFacilities ? listPetroleumFacilities() : Promise.resolve([] as PetroleumFacility[]),
    needsTufs ? listPetroleumTufs() : Promise.resolve([] as PetroleumTuf[]),
    needsSurveys ? listPetroleumSurveys() : Promise.resolve([] as PetroleumSurvey[]),
    needsWellbores ? listPetroleumWellbores() : Promise.resolve([] as PetroleumWellbore[]),
    needsMetrics ? listPetroleumProductionPoints() : Promise.resolve([] as PetroleumProductionPoint[]),
    needsMetrics ? listPetroleumReserveSnapshots() : Promise.resolve([] as PetroleumReserveSnapshot[]),
    needsMetrics ? listPetroleumInvestmentSnapshots() : Promise.resolve([] as PetroleumInvestmentSnapshot[]),
  ]);

  return {
    fields,
    discoveries,
    licences,
    facilities,
    tufs,
    surveys,
    wellbores,
    productionPoints,
    reserveSnapshots,
    investmentSnapshots,
  };
}

export async function getPetroleumCoreDataset() {
  return getCoreDataset();
}

export async function syncPetroleumCoreDataNow() {
  await syncCoreData();
}

export async function syncPetroleumMetricsDataNow() {
  await syncMetricsData();
}

export async function syncPetroleumPublicationDataNow() {
  await syncPublicationData();
}

export async function syncPetroleumEventsNow() {
  await Promise.all([
    syncEventSource("havtil", "HAVTIL", fetchHavtilPetroleumEvents),
    syncEventSource("gassco", "GASSCO", fetchGasscoPetroleumEvents),
  ]);
}

async function getMetricsDataset(): Promise<MetricsDataset> {
  const [productionPoints, reserveSnapshots, investmentSnapshots] = await Promise.all([
    listPetroleumProductionPoints(),
    listPetroleumReserveSnapshots(),
    listPetroleumInvestmentSnapshots(),
  ]);

  return { productionPoints, reserveSnapshots, investmentSnapshots };
}

async function getPersistedEvents() {
  return listPetroleumEvents();
}

async function getPublicationDataset() {
  const [forecasts, publications] = await Promise.all([
    listPetroleumForecastSnapshots(),
    listPetroleumPublicationSnapshots(),
  ]);

  return { forecasts, publications };
}

function buildReserveLookup(reserves: PetroleumReserveSnapshot[]) {
  return new Map(reserves.map((item) => [item.entityNpdId, item]));
}

function buildInvestmentLookup(investments: PetroleumInvestmentSnapshot[]) {
  return new Map(investments.map((item) => [item.entityNpdId, item]));
}

function getEntityOperator(
  entity: PetroleumField | PetroleumDiscovery | PetroleumLicence | PetroleumFacility | PetroleumTuf,
) {
  if ("operatorNpdCompanyId" in entity) {
    return toLinkedCompany({
      npdCompanyId: entity.operatorNpdCompanyId,
      companyName: entity.operatorCompanyName,
      orgNumber: entity.operatorOrgNumber,
      companySlug: entity.operatorCompanySlug,
    });
  }

  return toLinkedCompany({
    npdCompanyId: entity.currentOperatorNpdId,
    companyName: entity.currentOperatorName,
    orgNumber: entity.currentOperatorOrgNumber,
    companySlug: entity.currentOperatorSlug,
  });
}

function getEntityLicenseeIds(entity: PetroleumField | PetroleumLicence) {
  const values = parseJsonArray(entity.licensees);
  return values
    .map((entry) =>
      entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).npdCompanyId === "number"
        ? String((entry as Record<string, unknown>).npdCompanyId)
        : null,
    )
    .filter((value): value is string => Boolean(value));
}

function parseNumericFilterValues(values?: string[]) {
  return (values ?? [])
    .map((value) => Number(value))
    .filter((value): value is number => Number.isFinite(value));
}

function buildFieldSnapshotQuery(filters: PetroleumMarketFilters): PetroleumFieldSnapshotListInput {
  return {
    areas: filters.areas,
    statuses: filters.status,
    hcTypes: filters.hcTypes,
    operatorNpdCompanyIds: parseNumericFilterValues(filters.operatorIds),
    licenseeCompanyIds: parseNumericFilterValues(filters.licenseeIds),
    query: filters.query,
  };
}

function buildLicenceSnapshotQuery(filters: PetroleumMarketFilters): PetroleumLicenceSnapshotListInput {
  return {
    areas: filters.areas,
    statuses: filters.status,
    operatorNpdCompanyIds: parseNumericFilterValues(filters.operatorIds),
    licenseeCompanyIds: parseNumericFilterValues(filters.licenseeIds),
    query: filters.query,
  };
}

function matchesCommonFilters(
  filters: PetroleumMarketFilters,
  input: {
    name: string;
    bbox?: unknown;
    status?: string | null;
    area?: string | null;
    operatorId?: number | null;
    hcType?: string | null;
    licenseeIds?: string[];
  },
) {
  if (filters.query && !normalizeText(input.name).includes(normalizeText(filters.query))) {
    return false;
  }

  if (filters.status?.length) {
    const status = normalizeText(input.status);
    if (!filters.status.some((value) => normalizeText(value) === status)) {
      return false;
    }
  }

  if (filters.areas?.length) {
    const area = normalizeText(input.area);
    if (!filters.areas.some((value) => normalizeText(value) === area)) {
      return false;
    }
  }

  if (filters.operatorIds?.length) {
    const operatorId = input.operatorId ? String(input.operatorId) : null;
    if (!operatorId || !filters.operatorIds.includes(operatorId)) {
      return false;
    }
  }

  if (filters.hcTypes?.length) {
    const hcType = normalizeText(input.hcType);
    if (!filters.hcTypes.some((value) => normalizeText(value) === hcType)) {
      return false;
    }
  }

  if (filters.licenseeIds?.length) {
    const licenseeIds = input.licenseeIds ?? [];
    if (!licenseeIds.some((value) => filters.licenseeIds?.includes(value))) {
      return false;
    }
  }

  if (!bboxIntersects(parseBbox(input.bbox), filters.bbox ?? null)) {
    return false;
  }

  return true;
}

function filterFields(fields: PetroleumField[], filters: PetroleumMarketFilters) {
  return fields.filter((field) =>
    matchesCommonFilters(filters, {
      name: field.name,
      bbox: field.bbox,
      status: field.activityStatus,
      area: field.mainArea,
      operatorId: field.operatorNpdCompanyId,
      hcType: field.hydrocarbonType,
      licenseeIds: getEntityLicenseeIds(field),
    }),
  );
}

function filterDiscoveries(discoveries: PetroleumDiscovery[], filters: PetroleumMarketFilters) {
  return discoveries.filter((item) =>
    matchesCommonFilters(filters, {
      name: item.name,
      bbox: item.bbox,
      status: item.activityStatus,
      area: item.areaName,
      operatorId: item.operatorNpdCompanyId,
      hcType: item.hydrocarbonType,
    }),
  );
}

function filterLicences(licences: PetroleumLicence[], filters: PetroleumMarketFilters) {
  return licences.filter((item) =>
    matchesCommonFilters(filters, {
      name: item.name,
      bbox: item.bbox,
      status: item.status ?? item.currentPhase,
      area: item.mainArea,
      operatorId: item.operatorNpdCompanyId,
      licenseeIds: getEntityLicenseeIds(item),
    }),
  );
}

function filterFacilities(facilities: PetroleumFacility[], filters: PetroleumMarketFilters) {
  return facilities.filter((item) =>
    matchesCommonFilters(filters, {
      name: item.name,
      bbox: item.bbox,
      status: item.phase,
      area: item.belongsToName,
      operatorId: item.currentOperatorNpdId,
    }),
  );
}

function filterTufs(tufs: PetroleumTuf[], filters: PetroleumMarketFilters) {
  return tufs.filter((item) =>
    matchesCommonFilters(filters, {
      name: item.name,
      bbox: item.bbox,
      status: item.currentPhase,
      area: item.belongsToName,
      operatorId: item.operatorNpdCompanyId,
      hcType: item.medium,
    }),
  );
}

function getSurveyReferenceYear(item: PetroleumSurvey) {
  return (
    item.finalizedAt?.getUTCFullYear() ??
    item.startedAt?.getUTCFullYear() ??
    item.plannedFromDate?.getUTCFullYear() ??
    item.plannedToDate?.getUTCFullYear() ??
    null
  );
}

function limitLayerItems<T>(items: T[], layerId: PetroleumLayerId) {
  const limit = FEATURE_LIMITS[layerId];
  if (!limit || items.length <= limit) {
    return items;
  }

  return items.slice(0, limit);
}

function sortFieldsForMap(items: PetroleumField[]) {
  return [...items].sort((left, right) => {
    const producingDelta =
      Number(normalizeText(right.activityStatus).includes("producing")) -
      Number(normalizeText(left.activityStatus).includes("producing"));
    if (producingDelta !== 0) {
      return producingDelta;
    }

    return left.name.localeCompare(right.name, "nb");
  });
}

function sortDiscoveriesForMap(items: PetroleumDiscovery[]) {
  return [...items].sort((left, right) => {
    const yearDelta = (right.discoveryYear ?? 0) - (left.discoveryYear ?? 0);
    if (yearDelta !== 0) {
      return yearDelta;
    }

    return left.name.localeCompare(right.name, "nb");
  });
}

function sortLicencesForMap(items: PetroleumLicence[]) {
  return [...items].sort((left, right) => {
    const activeDelta = Number(Boolean(right.active)) - Number(Boolean(left.active));
    if (activeDelta !== 0) {
      return activeDelta;
    }

    return left.name.localeCompare(right.name, "nb");
  });
}

function sortFacilitiesForMap(items: PetroleumFacility[]) {
  return [...items].sort((left, right) => {
    const startupDelta = (right.startupDate?.getTime() ?? 0) - (left.startupDate?.getTime() ?? 0);
    if (startupDelta !== 0) {
      return startupDelta;
    }

    return left.name.localeCompare(right.name, "nb");
  });
}

function sortTufsForMap(items: PetroleumTuf[]) {
  return [...items].sort((left, right) => left.name.localeCompare(right.name, "nb"));
}

function sortSurveysForMap(items: PetroleumSurvey[]) {
  return [...items].sort((left, right) => {
    const yearDelta = (getSurveyReferenceYear(right) ?? 0) - (getSurveyReferenceYear(left) ?? 0);
    if (yearDelta !== 0) {
      return yearDelta;
    }

    return left.name.localeCompare(right.name, "nb");
  });
}

function sortWellboresForMap(items: PetroleumWellbore[]) {
  return [...items].sort((left, right) => {
    const dateDelta =
      (right.completionDate?.getTime() ?? right.entryDate?.getTime() ?? 0) -
      (left.completionDate?.getTime() ?? left.entryDate?.getTime() ?? 0);
    if (dateDelta !== 0) {
      return dateDelta;
    }

    return left.name.localeCompare(right.name, "nb");
  });
}

function filterSurveys(surveys: PetroleumSurvey[], filters: PetroleumMarketFilters) {
  return surveys.filter((item) => {
    if (
      !matchesCommonFilters(filters, {
        name: item.name,
        bbox: item.bbox,
        status: item.status,
        area: item.geographicalArea,
        operatorId: item.companyNpdId,
        hcType: item.mainType,
      })
    ) {
      return false;
    }

    if (filters.surveyStatuses?.length && !filters.surveyStatuses.includes(item.status ?? "")) {
      return false;
    }

    if (filters.surveyCategories?.length) {
      const categories = [item.category, item.mainType, item.subType].filter(Boolean);
      if (!categories.some((value) => filters.surveyCategories?.includes(value ?? ""))) {
        return false;
      }
    }

    const referenceYear = getSurveyReferenceYear(item);
    if (filters.surveyYearFrom && (!referenceYear || referenceYear < filters.surveyYearFrom)) {
      return false;
    }
    if (filters.surveyYearTo && (!referenceYear || referenceYear > filters.surveyYearTo)) {
      return false;
    }

    return true;
  });
}

function filterWellbores(wellbores: PetroleumWellbore[], filters: PetroleumMarketFilters) {
  return wellbores.filter((item) =>
    matchesCommonFilters(filters, {
      name: item.name,
      bbox: item.bbox,
      status: item.status ?? item.purpose,
      area: item.mainArea,
      operatorId: item.drillingOperatorNpdCompanyId,
      hcType: item.content,
    }),
  );
}

function buildFieldProductionLookup(productionPoints: PetroleumProductionPoint[]) {
  const byField = new Map<number, PetroleumProductionPoint[]>();

  for (const point of productionPoints) {
    const next = byField.get(point.entityNpdId) ?? [];
    next.push(point);
    byField.set(point.entityNpdId, next);
  }

  for (const values of byField.values()) {
    values.sort((left, right) =>
      left.year === right.year ? (left.month ?? 0) - (right.month ?? 0) : left.year - right.year,
    );
  }

  return byField;
}

function getLatestAnnualPoint(points: PetroleumProductionPoint[]) {
  return [...points]
    .filter((point) => point.period === "year")
    .sort((left, right) => right.year - left.year)[0] ?? null;
}

function getLatestMonthlyPoint(points: PetroleumProductionPoint[]) {
  return [...points]
    .filter((point) => point.period !== "year" && point.month)
    .sort((left, right) =>
      left.year === right.year ? (right.month ?? 0) - (left.month ?? 0) : right.year - left.year,
    )[0] ?? null;
}

function getDaysInPeriod(year: number, month?: number | null) {
  if (!month) {
    return new Date(Date.UTC(year + 1, 0, 0)).getUTCDate() === 31 ? (isLeapYear(year) ? 366 : 365) : 365;
  }

  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isLeapYear(year: number) {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

function getProductionVolume(point: PetroleumProductionPoint, product: PetroleumProductSeries) {
  switch (product) {
    case "oil":
      return point.oilNetMillSm3 ?? null;
    case "gas":
      return point.gasNetBillSm3 ?? null;
    case "ngl":
      return point.nglNetMillSm3 ?? null;
    case "condensate":
      return point.condensateNetMillSm3 ?? null;
    case "liquids":
      return (point.oilNetMillSm3 ?? 0) + (point.nglNetMillSm3 ?? 0) + (point.condensateNetMillSm3 ?? 0);
    case "oe":
      return point.oeNetMillSm3 ?? null;
    case "producedWater":
      return point.producedWaterMillSm3 ?? null;
    default:
      return null;
  }
}

function getRateUnit(product: PetroleumProductSeries, view: PetroleumMetricView): PetroleumRateUnit {
  if (view === "volume") {
    if (product === "gas") return "billSm3";
    return "msm3";
  }

  if (product === "gas") {
    return "billSm3";
  }

  if (product === "producedWater") {
    return "msm3";
  }

  return "boepd";
}

function toRate(value: number | null, year: number, month: number | null | undefined, product: PetroleumProductSeries) {
  if (value === null || value === undefined) {
    return null;
  }

  const days = getDaysInPeriod(year, month);
  if (!days) {
    return null;
  }

  if (product === "gas" || product === "producedWater") {
    return value / days;
  }

  return (value * 1_000_000 * 6.2898) / days;
}

function getMetricValue(
  point: PetroleumProductionPoint,
  product: PetroleumProductSeries,
  view: PetroleumMetricView,
) {
  const volume = getProductionVolume(point, product);
  return view === "rate" ? toRate(volume, point.year, point.month, product) : volume;
}

function getMetricFromPointSet(
  points: PetroleumProductionPoint[],
  product: PetroleumProductSeries,
  view: PetroleumMetricView,
  period: "annual" | "monthly" = "annual",
) {
  const point = period === "annual" ? getLatestAnnualPoint(points) : getLatestMonthlyPoint(points);
  if (!point) {
    return {
      value: null,
      unit: getRateUnit(product, view),
      point: null,
    };
  }

  return {
    value: getMetricValue(point, product, view),
    unit: getRateUnit(product, view),
    point,
  };
}

function getYearToDateMetrics(
  productionPoints: PetroleumProductionPoint[],
  allowedFieldIds: Set<number>,
  product: PetroleumProductSeries,
  view: PetroleumMetricView,
) {
  const monthlyPoints = productionPoints
    .filter((point) => point.entityType === "FIELD" && allowedFieldIds.has(point.entityNpdId) && point.month)
    .sort((left, right) =>
      left.year === right.year ? (left.month ?? 0) - (right.month ?? 0) : left.year - right.year,
    );

  const latestPoint = monthlyPoints[monthlyPoints.length - 1];
  if (!latestPoint?.month) {
    return {
      latestMonth: null,
      latestYear: null,
      currentValue: null,
      previousValue: null,
      deltaPercent: null,
      currentMonthValue: null,
      previousSameMonthValue: null,
      currentMonthDeltaPercent: null,
    };
  }

  const latestYear = latestPoint.year;
  const latestMonth = latestPoint.month;
  const currentPeriodPoints = monthlyPoints.filter(
    (point) => point.year === latestYear && (point.month ?? 0) <= latestMonth,
  );
  const previousPeriodPoints = monthlyPoints.filter(
    (point) => point.year === latestYear - 1 && (point.month ?? 0) <= latestMonth,
  );

  const sumValue = (points: PetroleumProductionPoint[]) =>
    points.reduce((sum, point) => sum + (getProductionVolume(point, product) ?? 0), 0);

  const currentVolume = sumValue(currentPeriodPoints);
  const previousVolume = sumValue(previousPeriodPoints);
  const currentDays = currentPeriodPoints.reduce(
    (sum, point) => sum + getDaysInPeriod(point.year, point.month),
    0,
  );
  const previousDays = previousPeriodPoints.reduce(
    (sum, point) => sum + getDaysInPeriod(point.year, point.month),
    0,
  );

  const currentValue =
    view === "rate"
      ? currentDays > 0
        ? toRate(currentVolume, latestYear, latestMonth, product) !== null
          ? (product === "gas" || product === "producedWater"
              ? currentVolume / currentDays
              : (currentVolume * 1_000_000 * 6.2898) / currentDays)
          : null
        : null
      : currentVolume;
  const previousValue =
    view === "rate"
      ? previousDays > 0
        ? product === "gas" || product === "producedWater"
          ? previousVolume / previousDays
          : (previousVolume * 1_000_000 * 6.2898) / previousDays
        : null
      : previousVolume;

  const currentMonthPoints = monthlyPoints.filter(
    (point) => point.year === latestYear && point.month === latestMonth,
  );
  const previousSameMonthPoints = monthlyPoints.filter(
    (point) => point.year === latestYear - 1 && point.month === latestMonth,
  );
  const currentMonthVolume = sumValue(currentMonthPoints);
  const previousSameMonthVolume = sumValue(previousSameMonthPoints);
  const currentMonthDays = latestMonth ? getDaysInPeriod(latestYear, latestMonth) : 0;
  const previousSameMonthDays = latestMonth ? getDaysInPeriod(latestYear - 1, latestMonth) : 0;

  const currentMonthValue =
    view === "rate"
      ? currentMonthDays > 0
        ? product === "gas" || product === "producedWater"
          ? currentMonthVolume / currentMonthDays
          : (currentMonthVolume * 1_000_000 * 6.2898) / currentMonthDays
        : null
      : currentMonthVolume;
  const previousSameMonthValue =
    view === "rate"
      ? previousSameMonthDays > 0
        ? product === "gas" || product === "producedWater"
          ? previousSameMonthVolume / previousSameMonthDays
          : (previousSameMonthVolume * 1_000_000 * 6.2898) / previousSameMonthDays
        : null
      : previousSameMonthVolume;

  return {
    latestMonth,
    latestYear,
    currentValue,
    previousValue,
    deltaPercent:
      previousValue && previousValue !== 0 ? ((currentValue ?? 0) - previousValue) / previousValue : null,
    currentMonthValue,
    previousSameMonthValue,
    currentMonthDeltaPercent:
      previousSameMonthValue && previousSameMonthValue !== 0
        ? ((currentMonthValue ?? 0) - previousSameMonthValue) / previousSameMonthValue
        : null,
  };
}

function getFieldYearToDateMetrics(
  points: PetroleumProductionPoint[],
  product: PetroleumProductSeries,
  view: PetroleumMetricView,
) {
  const monthlyPoints = points.filter((point) => point.entityType === "FIELD" && point.month);

  const latestPoint = monthlyPoints[monthlyPoints.length - 1];
  if (!latestPoint?.month) {
    return {
      latestMonth: null,
      latestYear: null,
      currentValue: null,
      previousValue: null,
      deltaPercent: null,
      currentMonthValue: null,
      previousSameMonthValue: null,
      currentMonthDeltaPercent: null,
    };
  }

  const latestYear = latestPoint.year;
  const latestMonth = latestPoint.month;
  const currentPeriodPoints = monthlyPoints.filter(
    (point) => point.year === latestYear && (point.month ?? 0) <= latestMonth,
  );
  const previousPeriodPoints = monthlyPoints.filter(
    (point) => point.year === latestYear - 1 && (point.month ?? 0) <= latestMonth,
  );

  const sumValue = (entries: PetroleumProductionPoint[]) =>
    entries.reduce((sum, point) => sum + (getProductionVolume(point, product) ?? 0), 0);

  const currentVolume = sumValue(currentPeriodPoints);
  const previousVolume = sumValue(previousPeriodPoints);
  const currentDays = currentPeriodPoints.reduce(
    (sum, point) => sum + getDaysInPeriod(point.year, point.month),
    0,
  );
  const previousDays = previousPeriodPoints.reduce(
    (sum, point) => sum + getDaysInPeriod(point.year, point.month),
    0,
  );

  const currentValue =
    view === "rate"
      ? currentDays > 0
        ? product === "gas" || product === "producedWater"
          ? currentVolume / currentDays
          : (currentVolume * 1_000_000 * 6.2898) / currentDays
        : null
      : currentVolume;
  const previousValue =
    view === "rate"
      ? previousDays > 0
        ? product === "gas" || product === "producedWater"
          ? previousVolume / previousDays
          : (previousVolume * 1_000_000 * 6.2898) / previousDays
        : null
      : previousVolume;

  const currentMonthPoints = monthlyPoints.filter(
    (point) => point.year === latestYear && point.month === latestMonth,
  );
  const previousSameMonthPoints = monthlyPoints.filter(
    (point) => point.year === latestYear - 1 && point.month === latestMonth,
  );
  const currentMonthVolume = sumValue(currentMonthPoints);
  const previousSameMonthVolume = sumValue(previousSameMonthPoints);
  const currentMonthDays = latestMonth ? getDaysInPeriod(latestYear, latestMonth) : 0;
  const previousSameMonthDays = latestMonth ? getDaysInPeriod(latestYear - 1, latestMonth) : 0;

  const currentMonthValue =
    view === "rate"
      ? currentMonthDays > 0
        ? product === "gas" || product === "producedWater"
          ? currentMonthVolume / currentMonthDays
          : (currentMonthVolume * 1_000_000 * 6.2898) / currentMonthDays
        : null
      : currentMonthVolume;
  const previousSameMonthValue =
    view === "rate"
      ? previousSameMonthDays > 0
        ? product === "gas" || product === "producedWater"
          ? previousSameMonthVolume / previousSameMonthDays
          : (previousSameMonthVolume * 1_000_000 * 6.2898) / previousSameMonthDays
        : null
      : previousSameMonthVolume;

  return {
    latestMonth,
    latestYear,
    currentValue,
    previousValue,
    deltaPercent:
      previousValue && previousValue !== 0 ? ((currentValue ?? 0) - previousValue) / previousValue : null,
    currentMonthValue,
    previousSameMonthValue,
    currentMonthDeltaPercent:
      previousSameMonthValue && previousSameMonthValue !== 0
        ? ((currentMonthValue ?? 0) - previousSameMonthValue) / previousSameMonthValue
        : null,
  };
}

function mapFieldFeature(
  field: PetroleumField,
  metrics?: {
    latestProductionOe?: number | null;
    remainingOe?: number | null;
    expectedFutureInvestmentNok?: number | null;
    selectedProductionValue?: number | null;
    selectedProductionUnit?: PetroleumRateUnit | null;
    selectedProductionLabel?: string | null;
    productionYoYPercent?: number | null;
  },
): PetroleumMapFeature | null {
  return field.geometry
    ? {
        id: `FIELD:${field.slug}`,
        layerId: "fields",
        entityType: "FIELD",
        entityId: field.slug,
        entityNpdId: field.npdId,
        name: field.name,
        geometry: field.geometry as never,
        bbox: parseBbox(field.bbox as unknown) ?? undefined,
        centroid: parseCoordinate(field.centroid as unknown) ?? undefined,
        status: field.activityStatus,
        area: field.mainArea,
        hcType: field.hydrocarbonType,
        operator: getEntityOperator(field),
        latestProductionOe: metrics?.latestProductionOe ?? null,
        remainingOe: metrics?.remainingOe ?? null,
        expectedFutureInvestmentNok: metrics?.expectedFutureInvestmentNok ?? null,
        selectedProductionValue: metrics?.selectedProductionValue ?? null,
        selectedProductionUnit: metrics?.selectedProductionUnit ?? null,
        selectedProductionLabel: metrics?.selectedProductionLabel ?? null,
        productionYoYPercent: metrics?.productionYoYPercent ?? null,
        detailUrl: `/market/oil-gas?entity=FIELD:${field.slug}`,
        factPageUrl: field.factPageUrl,
        factMapUrl: field.factMapUrl,
        sourceSystem: field.sourceSystem,
        sourceEntityType: field.sourceEntityType,
        sourceId: field.sourceId,
        fetchedAt: field.fetchedAt,
        normalizedAt: field.normalizedAt,
      }
    : null;
}

function mapDiscoveryFeature(item: PetroleumDiscovery): PetroleumMapFeature | null {
  return item.geometry
    ? {
        id: `DISCOVERY:${item.slug}`,
        layerId: "discoveries",
        entityType: "DISCOVERY",
        entityId: item.slug,
        entityNpdId: item.npdId,
        name: item.name,
        geometry: item.geometry as never,
        bbox: parseBbox(item.bbox as unknown) ?? undefined,
        centroid: parseCoordinate(item.centroid as unknown) ?? undefined,
        status: item.activityStatus,
        area: item.areaName,
        hcType: item.hydrocarbonType,
        operator: getEntityOperator(item),
        relatedFieldName: item.relatedFieldName,
        detailUrl: `/market/oil-gas?entity=DISCOVERY:${item.slug}`,
        factPageUrl: item.factPageUrl,
        factMapUrl: item.factMapUrl,
        sourceSystem: item.sourceSystem,
        sourceEntityType: item.sourceEntityType,
        sourceId: item.sourceId,
        fetchedAt: item.fetchedAt,
        normalizedAt: item.normalizedAt,
      }
    : null;
}

function mapLicenceFeature(item: PetroleumLicence): PetroleumMapFeature | null {
  return item.geometry
    ? {
        id: `LICENCE:${item.slug}`,
        layerId: "licences",
        entityType: "LICENCE",
        entityId: item.slug,
        entityNpdId: item.npdId,
        name: item.name,
        geometry: item.geometry as never,
        bbox: parseBbox(item.bbox as unknown) ?? undefined,
        centroid: parseCoordinate(item.centroid as unknown) ?? undefined,
        status: item.status ?? item.currentPhase,
        area: item.mainArea,
        operator: getEntityOperator(item),
        currentAreaSqKm: item.currentAreaSqKm,
        transferCount: parseJsonArray(item.transfers).length,
        detailUrl: `/market/oil-gas?entity=LICENCE:${item.slug}`,
        factPageUrl: item.factPageUrl,
        factMapUrl: item.factMapUrl,
        sourceSystem: item.sourceSystem,
        sourceEntityType: item.sourceEntityType,
        sourceId: item.sourceId,
        fetchedAt: item.fetchedAt,
        normalizedAt: item.normalizedAt,
      }
    : null;
}

function mapFacilityFeature(item: PetroleumFacility): PetroleumMapFeature | null {
  return item.geometry
    ? {
        id: `FACILITY:${item.slug}`,
        layerId: "facilities",
        entityType: "FACILITY",
        entityId: item.slug,
        entityNpdId: item.npdId,
        name: item.name,
        geometry: item.geometry as never,
        bbox: parseBbox(item.bbox as unknown) ?? undefined,
        centroid: parseCoordinate(item.centroid as unknown) ?? undefined,
        status: item.phase,
        area: item.belongsToName,
        operator: getEntityOperator(item),
        facilityKind: item.kind,
        detailUrl: `/market/oil-gas?entity=FACILITY:${item.slug}`,
        factPageUrl: item.factPageUrl,
        factMapUrl: item.factMapUrl,
        sourceSystem: item.sourceSystem,
        sourceEntityType: item.sourceEntityType,
        sourceId: item.sourceId,
        fetchedAt: item.fetchedAt,
        normalizedAt: item.normalizedAt,
      }
    : null;
}

function mapTufFeature(item: PetroleumTuf): PetroleumMapFeature | null {
  return item.geometry
    ? {
        id: `TUF:${item.slug}`,
        layerId: "tuf",
        entityType: "TUF",
        entityId: item.slug,
        entityNpdId: item.npdId,
        name: item.name,
        geometry: item.geometry as never,
        bbox: parseBbox(item.bbox as unknown) ?? undefined,
        centroid: parseCoordinate(item.centroid as unknown) ?? undefined,
        status: item.currentPhase,
        area: item.belongsToName,
        hcType: item.medium,
        operator: getEntityOperator(item),
        detailUrl: `/market/oil-gas?entity=TUF:${item.slug}`,
        factPageUrl: item.factPageUrl,
        factMapUrl: item.factMapUrl,
        sourceSystem: item.sourceSystem,
        sourceEntityType: item.sourceEntityType,
        sourceId: item.sourceId,
        fetchedAt: item.fetchedAt,
        normalizedAt: item.normalizedAt,
      }
    : null;
}

function mapSurveyFeature(item: PetroleumSurvey): PetroleumMapFeature | null {
  return item.geometry
    ? {
        id: `SURVEY:${item.slug}`,
        layerId: "surveys",
        entityType: "SURVEY",
        entityId: item.slug,
        entityNpdId: item.npdId,
        name: item.name,
        geometry: item.geometry as never,
        bbox: parseBbox(item.bbox as unknown) ?? undefined,
        centroid: parseCoordinate(item.centroid as unknown) ?? undefined,
        status: item.status,
        area: item.geographicalArea,
        category: item.category,
        subType: item.subType,
        companyName: item.companyName,
        surveyYear: getSurveyReferenceYear(item),
        startedAt: item.startedAt,
        finalizedAt: item.finalizedAt,
        plannedFromDate: item.plannedFromDate,
        plannedToDate: item.plannedToDate,
        detailUrl: `/market/oil-gas?entity=SURVEY:${item.slug}`,
        factPageUrl: item.factPageUrl,
        sourceSystem: item.sourceSystem,
        sourceEntityType: item.sourceEntityType,
        sourceId: item.sourceId,
        fetchedAt: item.fetchedAt,
        normalizedAt: item.normalizedAt,
      }
    : null;
}

function mapWellboreFeature(item: PetroleumWellbore): PetroleumMapFeature | null {
  return item.geometry
    ? {
        id: `WELLBORE:${item.slug}`,
        layerId: "wellbores",
        entityType: "WELLBORE",
        entityId: item.slug,
        entityNpdId: item.npdId,
        name: item.name,
        geometry: item.geometry as never,
        bbox: parseBbox(item.bbox as unknown) ?? undefined,
        centroid: parseCoordinate(item.centroid as unknown) ?? undefined,
        status: item.status ?? item.purpose,
        area: item.mainArea,
        hcType: item.content,
        operator: toLinkedCompany({
          npdCompanyId: item.drillingOperatorNpdCompanyId,
          companyName: item.drillingOperatorName,
          orgNumber: item.drillingOperatorOrgNumber,
          companySlug: item.drillingOperatorSlug,
        }),
        relatedFieldName: item.fieldName,
        companyName: item.drillingOperatorName,
        wellType: item.wellType,
        purpose: item.purpose,
        waterDepth: item.waterDepth,
        totalDepth: item.totalDepth,
        detailUrl: `/market/oil-gas?entity=WELLBORE:${item.slug}`,
        factPageUrl: item.factPageUrl,
        sourceSystem: item.sourceSystem,
        sourceEntityType: item.sourceEntityType,
        sourceId: item.sourceId,
        fetchedAt: item.fetchedAt,
        normalizedAt: item.normalizedAt,
      }
    : null;
}

function derivePetregEvents(licences: PetroleumLicence[]): PetroleumEventRow[] {
  return licences.flatMap((licence) =>
    parseJsonArray(licence.registerMessages)
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
      .map((entry) => ({
        id: `${licence.slug}:${entry.messageGuid ?? entry.documentNumber ?? "petreg"}`,
        source: "PETREG" as const,
        eventType: String(entry.messageKind ?? "LICENCE_MESSAGE"),
        title: `${licence.name}: ${String(entry.messageKind ?? "Petreg-melding")}`,
        summary: typeof entry.message === "string" ? entry.message : null,
        publishedAt:
          typeof entry.registeredAt === "string" && entry.registeredAt
            ? new Date(entry.registeredAt)
            : null,
        detailUrl: licence.factPageUrl,
        entityType: "LICENCE",
        entityId: licence.slug,
        entityNpdId: licence.npdId,
        entityName: licence.name,
        relatedCompany: toLinkedCompany({
          npdCompanyId: licence.operatorNpdCompanyId,
          companyName: licence.operatorCompanyName,
          orgNumber: licence.operatorOrgNumber,
          companySlug: licence.operatorCompanySlug,
        }),
        tags: [String(entry.messageKind ?? "Petreg")],
        sourceSystem: licence.sourceSystem,
        sourceEntityType: "petreg_licence_message",
        sourceId: `${licence.sourceId}:${entry.messageGuid ?? entry.documentNumber ?? "petreg"}`,
        fetchedAt: licence.fetchedAt,
        normalizedAt: licence.normalizedAt,
      })),
  );
}

function mapPersistedEvent(event: PetroleumEvent): PetroleumEventRow {
  return {
    id: event.externalId,
    source: event.source as "HAVTIL" | "GASSCO" | "PETREG",
    eventType: event.eventType,
    title: event.title,
    summary: event.summary,
    publishedAt: event.publishedAt,
    detailUrl: event.detailUrl,
    entityType: event.entityType as PetroleumEventRow["entityType"],
    entityId: event.entityName ? undefined : undefined,
    entityNpdId: event.entityNpdId,
    entityName: event.entityName,
    relatedCompany: toLinkedCompany({
      companyName: event.relatedCompanyName,
      orgNumber: event.relatedCompanyOrgNumber,
      companySlug: event.relatedCompanySlug,
    }),
    tags: parseJsonArray(event.tags).map((tag) => String(tag)),
    sourceSystem: event.sourceSystem,
    sourceEntityType: event.sourceEntityType,
    sourceId: event.sourceId,
    fetchedAt: event.fetchedAt,
    normalizedAt: event.normalizedAt,
  };
}

function mapPersistedForecast(
  snapshot: PetroleumForecastSnapshot,
  overrides?: Partial<PetroleumForecastSnapshotView>,
): PetroleumForecastSnapshotView {
  return {
    id: snapshot.externalId,
    scope: snapshot.scope === "FILTERED" ? "FILTERED" : "NCS",
    sourceLabel: snapshot.sourceLabel,
    title: snapshot.title,
    summary: snapshot.summary,
    publishedAt: snapshot.publishedAt,
    horizonLabel: snapshot.horizonLabel,
    appliesToProduct: (snapshot.appliesToProduct as PetroleumProductSeries | null) ?? null,
    forecastScopeLabel: snapshot.forecastScopeLabel,
    trendLabel: snapshot.trendLabel,
    declineRatePercent: snapshot.declineRatePercent,
    investmentLevelNok:
      typeof snapshot.investmentLevelNok === "bigint" ? Number(snapshot.investmentLevelNok) : null,
    keyPoints: parseJsonArray(snapshot.keyPoints).map((value) => String(value)),
    detailUrl: snapshot.detailUrl,
    backgroundDataUrl: snapshot.backgroundDataUrl,
    sourceSystem: snapshot.sourceSystem,
    sourceEntityType: snapshot.sourceEntityType,
    sourceId: snapshot.sourceId,
    fetchedAt: snapshot.fetchedAt,
    normalizedAt: snapshot.normalizedAt,
    rawPayload: snapshot.rawPayload,
    ...overrides,
  };
}

function mapPersistedPublication(
  snapshot: PetroleumPublicationSnapshot,
): PetroleumPublicationSnapshotView {
  return {
    id: snapshot.externalId,
    category: snapshot.category as PetroleumPublicationSnapshotView["category"],
    title: snapshot.title,
    summary: snapshot.summary,
    publishedAt: snapshot.publishedAt,
    detailUrl: snapshot.detailUrl,
    backgroundDataUrl: snapshot.backgroundDataUrl,
    pdfUrl: snapshot.pdfUrl,
    sheetNames: parseJsonArray(snapshot.sheetNames).map((value) => String(value)),
    sourceSystem: snapshot.sourceSystem,
    sourceEntityType: snapshot.sourceEntityType,
    sourceId: snapshot.sourceId,
    fetchedAt: snapshot.fetchedAt,
    normalizedAt: snapshot.normalizedAt,
    rawPayload: snapshot.rawPayload,
  };
}

function attachEntityConcepts(
  entityType: PetroleumEntityDetail["entityType"],
): PetroleumConceptEntry[] {
  const conceptIds =
    entityType === "FIELD"
      ? ["field", "licence", "development", "forecast"]
      : entityType === "DISCOVERY"
        ? ["discovery", "licence", "survey"]
        : entityType === "LICENCE"
          ? ["licence", "discovery", "field"]
          : entityType === "FACILITY"
            ? ["facility", "tuf", "development"]
            : entityType === "TUF"
              ? ["tuf", "facility", "field"]
              : entityType === "WELLBORE"
                ? ["survey", "development", "discovery"]
                : ["survey", "discovery", "field"];

  return conceptIds
    .map((conceptId) => getPetroleumConceptById(conceptId))
    .filter((value): value is PetroleumConceptEntry => Boolean(value));
}

async function buildSourceStatus(): Promise<PetroleumSourceStatus[]> {
  const [core, havtil, gassco] = await Promise.all([
    getPetroleumSyncState(SYNC_KEYS.core),
    getPetroleumSyncState(SYNC_KEYS.havtil),
    getPetroleumSyncState(SYNC_KEYS.gassco),
  ]);

  const makeStatus = (
    source: "SODIR" | "HAVTIL" | "GASSCO",
    state: PetroleumSyncState | null,
  ): PetroleumSourceStatus => ({
    source,
    available: Boolean(state?.lastSuccessAt),
    message: state?.lastSuccessAt
      ? ((state.metadata as Record<string, unknown> | null)?.availabilityMessage as string | undefined)
      : state?.errorMessage ?? undefined,
    lastSuccessAt: state?.lastSuccessAt ?? null,
  });

  return [makeStatus("SODIR", core), makeStatus("HAVTIL", havtil), makeStatus("GASSCO", gassco)];
}

function getFieldMetric(
  productionLookup: Map<number, PetroleumProductionPoint[]>,
  fieldNpdId: number,
  product: PetroleumProductSeries,
  view: PetroleumMetricView,
) {
  return getMetricFromPointSet(productionLookup.get(fieldNpdId) ?? [], product, view);
}

function getLatestNcsMetric(
  productionPoints: PetroleumProductionPoint[],
  product: PetroleumProductSeries,
  view: PetroleumMetricView,
) {
  const annualPoints = productionPoints.filter((point) => point.period === "year");
  const latestYear = annualPoints.reduce((latest, point) => Math.max(latest, point.year), 0);
  if (!latestYear) {
    return null;
  }

  const totalVolume = annualPoints
    .filter((point) => point.year === latestYear)
    .reduce((sum, point) => sum + (getProductionVolume(point, product) ?? 0), 0);

  return view === "rate"
    ? product === "gas" || product === "producedWater"
      ? totalVolume / getDaysInPeriod(latestYear)
      : (totalVolume * 1_000_000 * 6.2898) / getDaysInPeriod(latestYear)
    : totalVolume;
}

function getSnapshotProductionVolume(
  snapshot: PetroleumFieldSnapshot,
  product: PetroleumProductSeries,
) {
  switch (product) {
    case "oil":
      return snapshot.latestSelectedProductionOil ?? null;
    case "gas":
      return snapshot.latestSelectedProductionGas ?? null;
    case "liquids":
      return snapshot.latestSelectedProductionLiquids ?? null;
    case "oe":
      return snapshot.latestSelectedProductionOe ?? snapshot.latestAnnualOe ?? null;
    default:
      return null;
  }
}

function getSnapshotMetric(
  snapshot: PetroleumFieldSnapshot,
  productionLookup: Map<number, PetroleumProductionPoint[]>,
  product: PetroleumProductSeries,
  view: PetroleumMetricView,
) {
  const fromPoints = getFieldMetric(productionLookup, snapshot.fieldNpdId, product, view);
  if (fromPoints.value !== null && fromPoints.value !== undefined) {
    return fromPoints;
  }

  const volume = getSnapshotProductionVolume(snapshot, product);
  if (volume === null || volume === undefined) {
    return { value: null, unit: getRateUnit(product, view), point: null };
  }

  const value =
    view === "rate"
      ? product === "gas" || product === "producedWater"
        ? volume / 365
        : (volume * 1_000_000 * 6.2898) / 365
      : volume;

  return {
    value,
    unit: getRateUnit(product, view),
    point: null,
  };
}

function pickPrimaryForecast(forecasts: PetroleumForecastSnapshot[]) {
  return forecasts.find((snapshot) => snapshot.sourceEntityType === "shelf_year_forecast") ?? forecasts[0] ?? null;
}

function pickMonthlyForecast(forecasts: PetroleumForecastSnapshot[]) {
  return (
    forecasts.find((snapshot) => snapshot.sourceEntityType === "monthly_production_forecast") ?? null
  );
}

function deriveFilteredForecast(
  baseForecast: PetroleumForecastSnapshot,
  selectedShare: number | null,
): PetroleumForecastSnapshotView {
  return mapPersistedForecast(baseForecast, {
    id: `${baseForecast.externalId}:filtered`,
    scope: "FILTERED",
    forecastScopeLabel: "Avledet fra siste sokkelforecast og valgt produksjonsandel",
    summary: selectedShare
      ? `Filtertilpasset forecast er avledet fra siste offisielle sokkelforecast og dagens utvalgsandel av produksjonen (${(selectedShare * 100).toFixed(1)} %).`
      : "Filtertilpasset forecast kunne ikke beregnes sikkert og vises derfor fortsatt på sokkelnivå.",
  });
}

function buildFilterOptions(
  fieldSnapshots: PetroleumFieldSnapshot[],
  licenceSnapshots: PetroleumLicenceSnapshot[],
  companyLinks: PetroleumCompanyLink[],
): PetroleumFilterOptions {
  const statusCounts = new Map<string, number>();
  const areaCounts = new Map<string, number>();
  const operatorCounts = new Map<string, { label: string; count: number }>();
  const licenseeCounts = new Map<string, { label: string; count: number }>();
  const hcCounts = new Map<string, number>();
  const companyLabelByNpd = new Map(
    companyLinks.map((link) => [String(link.npdCompanyId), link.companyName] as const),
  );

  const bump = (map: Map<string, number>, value?: string | null) => {
    const key = value?.trim();
    if (!key) return;
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  for (const field of fieldSnapshots) {
    bump(statusCounts, field.status);
    bump(areaCounts, field.area);
    bump(hcCounts, field.hcType);
    if (field.operatorNpdCompanyId && field.operatorName) {
      const key = String(field.operatorNpdCompanyId);
      operatorCounts.set(key, {
        label: field.operatorName,
        count: (operatorCounts.get(key)?.count ?? 0) + 1,
      });
    }
    for (const companyId of field.licenseeCompanyIds) {
      const key = String(companyId);
      licenseeCounts.set(key, {
        label: companyLabelByNpd.get(key) ?? key,
        count: (licenseeCounts.get(key)?.count ?? 0) + 1,
      });
    }
  }

  for (const item of licenceSnapshots) {
    bump(statusCounts, item.status ?? item.currentPhase);
    bump(areaCounts, item.area);
    if (item.operatorNpdCompanyId && item.operatorName) {
      const key = String(item.operatorNpdCompanyId);
      operatorCounts.set(key, {
        label: item.operatorName,
        count: (operatorCounts.get(key)?.count ?? 0) + 1,
      });
    }
    for (const companyId of item.licenseeCompanyIds) {
      const key = String(companyId);
      licenseeCounts.set(key, {
        label: companyLabelByNpd.get(key) ?? key,
        count: (licenseeCounts.get(key)?.count ?? 0) + 1,
      });
    }
  }

  const toOptions = (map: Map<string, number>): PetroleumFilterOption[] =>
    [...map.entries()]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "nb-NO"));

  return {
    statuses: toOptions(statusCounts),
    areas: toOptions(areaCounts),
    operators: [...operatorCounts.entries()]
      .map(([value, item]) => ({ value, label: item.label, count: item.count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "nb-NO")),
    licensees: [...licenseeCounts.entries()]
      .map(([value, item]) => ({ value, label: item.label, count: item.count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "nb-NO")),
    hcTypes: toOptions(hcCounts),
  };
}

export async function getPetroleumMarketFeatures(filters: PetroleumMarketFilters) {
  const layers = normalizeLayerSelection(filters.layers);
  const featureDataset = await getFeatureDataset(layers);
  const features: PetroleumMapFeature[] = [];
  const productionLookup = buildFieldProductionLookup(featureDataset.productionPoints);
  const reserveLookup = buildReserveLookup(featureDataset.reserveSnapshots);
  const investmentLookup = buildInvestmentLookup(featureDataset.investmentSnapshots);
  const selectedProduct = filters.product ?? "oe";
  const selectedView = filters.view ?? "volume";

  if (layers.includes("fields")) {
    features.push(
      ...limitLayerItems(sortFieldsForMap(filterFields(featureDataset.fields, filters)), "fields")
          .map((field) => {
            const fieldPoints = productionLookup.get(field.npdId) ?? [];
            const fieldMetric = getMetricFromPointSet(fieldPoints, selectedProduct, selectedView, "annual");
            const ytdMetrics = getFieldYearToDateMetrics(fieldPoints, selectedProduct, selectedView);

          return mapFieldFeature(field, {
            latestProductionOe: getLatestAnnualPoint(fieldPoints)?.oeNetMillSm3 ?? null,
            remainingOe: reserveLookup.get(field.npdId)?.remainingOe ?? null,
            expectedFutureInvestmentNok:
              (investmentLookup.get(field.npdId)?.expectedFutureInvestmentMillNok ?? 0) * 1_000_000,
            selectedProductionValue: fieldMetric.value,
            selectedProductionUnit: fieldMetric.unit,
            selectedProductionLabel: selectedView === "rate" ? "boepd / dagrate" : "Siste volum",
            productionYoYPercent: ytdMetrics.deltaPercent,
          });
        })
        .filter(Boolean) as PetroleumMapFeature[],
    );
  }
  if (layers.includes("discoveries")) {
    features.push(
      ...limitLayerItems(
        sortDiscoveriesForMap(filterDiscoveries(featureDataset.discoveries, filters)),
        "discoveries",
      )
          .map(mapDiscoveryFeature)
          .filter(Boolean) as PetroleumMapFeature[],
    );
  }
  if (layers.includes("licences")) {
    features.push(
      ...limitLayerItems(sortLicencesForMap(filterLicences(featureDataset.licences, filters)), "licences")
        .map(mapLicenceFeature)
        .filter(Boolean) as PetroleumMapFeature[],
    );
  }
  if (layers.includes("facilities")) {
    features.push(
      ...limitLayerItems(
        sortFacilitiesForMap(filterFacilities(featureDataset.facilities, filters)),
        "facilities",
      )
          .map(mapFacilityFeature)
          .filter(Boolean) as PetroleumMapFeature[],
    );
  }
  if (layers.includes("tuf")) {
    features.push(
      ...limitLayerItems(sortTufsForMap(filterTufs(featureDataset.tufs, filters)), "tuf")
        .map(mapTufFeature)
        .filter(Boolean) as PetroleumMapFeature[],
    );
  }
  if (layers.includes("surveys")) {
    if (filters.bbox) {
      features.push(
        ...limitLayerItems(sortSurveysForMap(filterSurveys(featureDataset.surveys, filters)), "surveys")
          .map(mapSurveyFeature)
          .filter(Boolean) as PetroleumMapFeature[],
      );
    }
  }
  if (layers.includes("wellbores")) {
    if (filters.bbox) {
      features.push(
        ...limitLayerItems(
          sortWellboresForMap(filterWellbores(featureDataset.wellbores, filters)),
          "wellbores",
        )
          .map(mapWellboreFeature)
          .filter(Boolean) as PetroleumMapFeature[],
      );
    }
  }

  return features;
}

export async function getPetroleumMarketSummary(
  filters: PetroleumMarketFilters,
): Promise<PetroleumSummaryResponse> {
  const selectedProduct = filters.product ?? "oe";
  const selectedView = filters.view ?? "volume";
  const fieldQuery = buildFieldSnapshotQuery(filters);
  const licenceQuery = buildLicenceSnapshotQuery(filters);

  const [
    filteredFields,
    filteredLicences,
    allFieldSnapshots,
    allLicenceSnapshots,
    operatorSnapshots,
    companyLinks,
    persistedEvents,
    sourceStatus,
    publicationDataset,
    rawLicences,
    allAnnualPoints,
  ] = await Promise.all([
    listPetroleumFieldSnapshots(fieldQuery),
    listPetroleumLicenceSnapshots(licenceQuery),
    listPetroleumFieldSnapshots(),
    listPetroleumLicenceSnapshots(),
    listPetroleumOperatorSnapshots(),
    listPetroleumCompanyLinks(),
    getPersistedEvents(),
    buildSourceStatus(),
    getPublicationDataset(),
    listPetroleumLicences(),
    listPetroleumProductionPointsForEntities({ entityType: "FIELD", period: "year" }),
  ]);

  const filteredFieldIds = filteredFields.map((field) => field.fieldNpdId);
  const filteredFieldIdSet = new Set(filteredFieldIds);
  const filteredLicenceIdSet = new Set(filteredLicences.map((licence) => licence.licenceNpdId));
  const filteredProductionPoints =
    filteredFieldIds.length > 0
      ? await listPetroleumProductionPointsForEntities({
          entityType: "FIELD",
          entityNpdIds: filteredFieldIds,
        })
      : [];
  const productionLookup = buildFieldProductionLookup(filteredProductionPoints);
  const latestProductionYear =
    allAnnualPoints.reduce((latest, point) => Math.max(latest, point.year), 0) || null;
  const latestNcsProductionOe = latestProductionYear
    ? allAnnualPoints
        .filter((point) => point.year === latestProductionYear)
        .reduce((sum, point) => sum + (point.oeNetMillSm3 ?? 0), 0)
    : null;
  const selectedAnnualOe = filteredFields.reduce((sum, field) => sum + (field.latestAnnualOe ?? 0), 0);
  const selectedRemainingOe = filteredFields.reduce((sum, field) => sum + (field.remainingOe ?? 0), 0);
  const selectedRecoverableOe = filteredFields.reduce((sum, field) => sum + (field.recoverableOe ?? 0), 0);
  const selectedHistoricalInvestmentsNok = filteredProductionPoints.reduce(
    (sum, point) => sum + ((point.investmentsMillNok ?? 0) * 1_000_000),
    0,
  );
  const selectedFutureInvestmentsNok = filteredFields.reduce((sum, field) => {
    const next =
      typeof field.expectedFutureInvestmentNok === "bigint" ? Number(field.expectedFutureInvestmentNok) : 0;
    return sum + next;
  }, 0);
  const operatorIds = new Set(
    filteredFields
      .map((field) => field.operatorNpdCompanyId)
      .filter((value): value is number => typeof value === "number"),
  );
  const ytdMetrics = getYearToDateMetrics(
    filteredProductionPoints,
    filteredFieldIdSet,
    selectedProduct,
    selectedView,
  );
  const recentEvents = [
    ...persistedEvents.map(mapPersistedEvent),
    ...derivePetregEvents(
      rawLicences.filter(
        (licence) =>
          filteredLicenceIdSet.has(licence.npdId) ||
          (licence.operatorNpdCompanyId && operatorIds.has(licence.operatorNpdCompanyId)),
      ),
    ),
  ].filter((event) => {
    const publishedAt = event.publishedAt?.getTime();
    if (!publishedAt) return false;
    if (Date.now() - publishedAt > 365 * 24 * 3_600_000) return false;
    if (!event.entityNpdId) return true;
    return filteredFieldIdSet.has(event.entityNpdId) || filteredLicenceIdSet.has(event.entityNpdId);
  });

  const topFields = filteredFields
    .map((field) => {
      const metric = getSnapshotMetric(field, productionLookup, selectedProduct, selectedView);

      return {
        entityId: field.fieldSlug,
        npdId: field.fieldNpdId,
        name: field.name,
        area: field.area,
        operatorName: field.operatorName,
        operatorSlug: field.operatorSlug,
        status: field.status,
        oe: field.latestAnnualOe ?? null,
        remainingOe: field.remainingOe ?? null,
        expectedFutureInvestmentNok:
          typeof field.expectedFutureInvestmentNok === "bigint" ? Number(field.expectedFutureInvestmentNok) : null,
        latestProductionValue: metric.value,
        latestProductionUnit: metric.unit,
      };
    })
    .sort((left, right) => (right.oe ?? 0) - (left.oe ?? 0))
    .slice(0, 8);

  const operatorConcentration = [...operatorIds]
    .map((operatorNpdId) => {
      const operatorFields = filteredFields.filter((field) => field.operatorNpdCompanyId === operatorNpdId);
      const fieldReference = operatorFields[0];
      const operatorReference = operatorSnapshots.find((item) => item.npdCompanyId === operatorNpdId);

      return {
        operatorName:
          fieldReference?.operatorName ?? operatorReference?.operatorName ?? `Operator ${operatorNpdId}`,
        operatorOrgNumber: fieldReference?.operatorOrgNumber ?? operatorReference?.orgNumber ?? null,
        operatorSlug: fieldReference?.operatorSlug ?? operatorReference?.slug ?? null,
        oe: operatorFields.reduce((sum, field) => sum + (field.latestAnnualOe ?? 0), 0),
        fieldCount: operatorFields.length,
        latestProductionValue: operatorFields.reduce((sum, field) => {
          const metric = getSnapshotMetric(field, productionLookup, selectedProduct, selectedView);
          return sum + (metric.value ?? 0);
        }, 0),
        latestProductionUnit: getRateUnit(selectedProduct, selectedView),
      };
    })
    .sort((left, right) => (right.oe ?? 0) - (left.oe ?? 0))
    .slice(0, 8);

  const mappedPublications = publicationDataset.publications.map(mapPersistedPublication);
  const primaryForecastSnapshot = pickPrimaryForecast(publicationDataset.forecasts);
  const monthlyForecastSnapshot = pickMonthlyForecast(publicationDataset.forecasts);
  const selectedProductionShareOfNcs =
    latestNcsProductionOe && latestNcsProductionOe > 0 ? selectedAnnualOe / latestNcsProductionOe : null;
  const forecast =
    primaryForecastSnapshot && (filters.areas?.length || filters.operatorIds?.length || filters.bbox || filters.query)
      ? deriveFilteredForecast(primaryForecastSnapshot, selectedProductionShareOfNcs)
      : primaryForecastSnapshot
        ? mapPersistedForecast(primaryForecastSnapshot)
        : null;

  let forecastDeviationPercent: number | null = null;
  const monthlyMetrics = monthlyForecastSnapshot?.rawPayload as
    | {
        metrics?: {
          actual?: Partial<Record<PetroleumProductSeries, number>>;
          forecast?: Partial<Record<PetroleumProductSeries, number>>;
        };
      }
    | undefined;
  const monthlyActual = monthlyMetrics?.metrics?.actual?.[selectedProduct === "liquids" ? "liquids" : selectedProduct];
  const monthlyForecast =
    monthlyMetrics?.metrics?.forecast?.[selectedProduct === "liquids" ? "liquids" : selectedProduct];
  if (typeof monthlyActual === "number" && typeof monthlyForecast === "number" && monthlyForecast !== 0) {
    forecastDeviationPercent = (monthlyActual - monthlyForecast) / monthlyForecast;
  }

  return {
    kpis: {
      activeFieldCount: filteredFields.filter((field) => normalizeText(field.status).includes("producing")).length,
      activeLicenceCount: filteredLicences.filter((licence) => Boolean(licence.active)).length,
      selectedLatestProductionOe: selectedAnnualOe,
      selectedRemainingOe,
      selectedOperatorCount: operatorIds.size,
      recentEventCount: recentEvents.length,
      selectedProduct,
      selectedView,
      selectedLatestProductionValue:
        ytdMetrics.currentValue ??
        filteredFields.reduce((sum, field) => {
          const metric = getSnapshotMetric(field, productionLookup, selectedProduct, selectedView);
          return sum + (metric.value ?? 0);
        }, 0),
      selectedLatestProductionUnit: getRateUnit(selectedProduct, selectedView),
      yoyYtdValue: ytdMetrics.currentValue,
      yoyYtdDeltaPercent: ytdMetrics.deltaPercent,
      currentMonthVsLastYearPercent: ytdMetrics.currentMonthDeltaPercent,
      forecastDeviationPercent,
    },
    benchmark: {
      latestProductionYear,
      latestProductionOe: latestNcsProductionOe,
      selectedProductionShareOfNcs,
      selectedRecoverableOe,
      selectedRemainingOe,
      selectedHistoricalInvestmentsNok,
      selectedFutureInvestmentsNok,
      totalFields: allFieldSnapshots.length,
      totalLicences: allLicenceSnapshots.length,
      totalOperators: operatorSnapshots.length,
    },
    topFields,
    operatorConcentration,
    filterOptions: buildFilterOptions(allFieldSnapshots, allLicenceSnapshots, companyLinks),
    sourceStatus,
    latestProductionYear,
    selectedProduct,
    selectedView,
    forecast,
    publications: mappedPublications,
  };
}

export async function getPetroleumMarketTimeseries(input: {
  filters: PetroleumMarketFilters;
  entityType: PetroleumTimeSeriesEntityType;
  entityIds?: string[];
  granularity: PetroleumTimeSeriesGranularity;
  measures: PetroleumTimeSeriesMeasure[];
  product?: PetroleumProductSeries;
  view?: PetroleumMetricView;
  comparison?: PetroleumTimeSeriesComparison;
}) {
  const fieldSnapshots = await listPetroleumFieldSnapshots(buildFieldSnapshotQuery(input.filters));
  const currentYear = new Date().getUTCFullYear();
  const fieldLookup = new Map(
    fieldSnapshots.map((field) => [
      field.fieldNpdId,
      {
        ...field,
        operatorCompanyName: field.operatorName,
        mainArea: field.area,
      },
    ]),
  );
  const groups = new Map<string, PetroleumTimeSeriesPoint>();
  const selectedProduct = input.product ?? input.filters.product ?? "oe";
  const selectedView = input.view ?? input.filters.view ?? "volume";
  const productionPoints = await listPetroleumProductionPointsForEntities({
    entityType: "FIELD",
    entityNpdIds: fieldSnapshots.map((field) => field.fieldNpdId),
    yearTo: currentYear,
    period: input.granularity === "month" ? "month" : "year",
  });

  for (const point of productionPoints) {
    if (point.entityType !== "FIELD") {
      continue;
    }

    const field = fieldLookup.get(point.entityNpdId);
    if (!field) {
      continue;
    }

    let groupKey = "selected";
    let label = "Valgt utvalg";

    if (input.entityType === "field") {
      if (input.entityIds?.length && !input.entityIds.includes(field.fieldSlug)) {
        continue;
      }
      groupKey = field.fieldSlug;
      label = field.name;
    } else if (input.entityType === "operator") {
      const operatorId = field.operatorNpdCompanyId ? String(field.operatorNpdCompanyId) : "unknown";
      if (input.entityIds?.length && !input.entityIds.includes(operatorId)) {
        continue;
      }
      groupKey = operatorId;
      label = field.operatorCompanyName ?? "Ukjent operatør";
    } else if (input.entityType === "area") {
      if (input.entityIds?.length) {
        const area = field.mainArea ?? "Ukjent område";
        if (!input.entityIds.includes(area)) {
          continue;
        }
        groupKey = area;
        label = area;
      }
    }

    const periodKey =
      input.granularity === "month" && point.month
        ? `${point.year}-${String(point.month).padStart(2, "0")}`
        : `${point.year}`;
    const key = `${groupKey}:${periodKey}`;
    const current = groups.get(key) ?? {
      key,
      entityType: input.entityType,
      label,
      year: point.year,
      month: input.granularity === "month" ? point.month ?? null : null,
      dayCount: getDaysInPeriod(point.year, input.granularity === "month" ? point.month : null),
      oil: 0,
      gas: 0,
      liquids: 0,
      condensate: 0,
      ngl: 0,
      oe: 0,
      producedWater: 0,
      investments: 0,
      oilRate: 0,
      gasRate: 0,
      liquidsRate: 0,
      condensateRate: 0,
      nglRate: 0,
      oeRate: 0,
      producedWaterRate: 0,
      selectedValue: 0,
      selectedRate: 0,
      selectedUnit: getRateUnit(selectedProduct, selectedView),
    };

    current.oil = (current.oil ?? 0) + (point.oilNetMillSm3 ?? 0);
    current.gas = (current.gas ?? 0) + (point.gasNetBillSm3 ?? 0);
    current.condensate = (current.condensate ?? 0) + (point.condensateNetMillSm3 ?? 0);
    current.ngl = (current.ngl ?? 0) + (point.nglNetMillSm3 ?? 0);
    current.liquids = (current.liquids ?? 0) + (point.oilNetMillSm3 ?? 0) + (point.nglNetMillSm3 ?? 0) + (point.condensateNetMillSm3 ?? 0);
    current.oe = (current.oe ?? 0) + (point.oeNetMillSm3 ?? 0);
    current.producedWater = (current.producedWater ?? 0) + (point.producedWaterMillSm3 ?? 0);
    current.investments = (current.investments ?? 0) + ((point.investmentsMillNok ?? 0) * 1_000_000);
    current.oilRate = (current.oilRate ?? 0) + (toRate(point.oilNetMillSm3 ?? null, point.year, point.month, "oil") ?? 0);
    current.gasRate = (current.gasRate ?? 0) + (toRate(point.gasNetBillSm3 ?? null, point.year, point.month, "gas") ?? 0);
    current.liquidsRate =
      (current.liquidsRate ?? 0) + (toRate(getProductionVolume(point, "liquids"), point.year, point.month, "liquids") ?? 0);
    current.condensateRate =
      (current.condensateRate ?? 0) +
      (toRate(point.condensateNetMillSm3 ?? null, point.year, point.month, "condensate") ?? 0);
    current.nglRate = (current.nglRate ?? 0) + (toRate(point.nglNetMillSm3 ?? null, point.year, point.month, "ngl") ?? 0);
    current.oeRate = (current.oeRate ?? 0) + (toRate(point.oeNetMillSm3 ?? null, point.year, point.month, "oe") ?? 0);
    current.producedWaterRate =
      (current.producedWaterRate ?? 0) +
      (toRate(point.producedWaterMillSm3 ?? null, point.year, point.month, "producedWater") ?? 0);
    groups.set(key, current);
  }

  return [...groups.values()]
    .map((point) => {
      const selectedValue =
        selectedProduct === "oil"
          ? point.oil
          : selectedProduct === "gas"
            ? point.gas
            : selectedProduct === "ngl"
              ? point.ngl
              : selectedProduct === "condensate"
                ? point.condensate
                : selectedProduct === "liquids"
                  ? point.liquids
                  : selectedProduct === "producedWater"
                    ? point.producedWater
                    : point.oe;
      const selectedRate =
        selectedProduct === "oil"
          ? point.oilRate
          : selectedProduct === "gas"
            ? point.gasRate
            : selectedProduct === "ngl"
              ? point.nglRate
              : selectedProduct === "condensate"
                ? point.condensateRate
                : selectedProduct === "liquids"
                  ? point.liquidsRate
                  : selectedProduct === "producedWater"
                    ? point.producedWaterRate
                    : point.oeRate;

      return {
        ...point,
        selectedValue,
        selectedRate,
        selectedUnit: getRateUnit(selectedProduct, selectedView),
      };
    })
    .sort((left, right) =>
      left.year === right.year ? (left.month ?? 0) - (right.month ?? 0) : left.year - right.year,
    );
}

export async function getPetroleumMarketTable(filters: PetroleumMarketFilters): Promise<PetroleumTableResponse> {
  const mode = filters.tableMode ?? "fields";
  const page = filters.page ?? 0;
  const size = filters.size ?? 25;
  const selectedProduct = filters.product ?? "oe";
  const selectedView = filters.view ?? "volume";
  let items: PetroleumTableResponse["items"] = [];

  if (mode === "licences") {
    const licenceQuery = buildLicenceSnapshotQuery(filters);
    const [totalCount, licenceRows] = await Promise.all([
      countPetroleumLicenceSnapshots(licenceQuery),
      listPetroleumLicenceSnapshots({
        ...licenceQuery,
        skip: page * size,
        take: size,
        orderBy: [{ name: "asc" }],
      }),
    ]);

    items = licenceRows.map((licence) => ({
      mode,
      entityId: licence.licenceSlug,
      npdId: licence.licenceNpdId,
      name: licence.name,
      area: licence.area,
      status: licence.status,
      currentPhase: licence.currentPhase,
      operatorName: licence.operatorName,
      operatorSlug: licence.operatorSlug,
      currentAreaSqKm: licence.currentAreaSqKm,
      originalAreaSqKm: licence.originalAreaSqKm,
      transferCount: licence.transferCount,
    }));

    return {
      mode,
      items,
      page,
      size,
      totalCount,
    };
  } else if (mode === "operators") {
    const fieldRows = await listPetroleumFieldSnapshots(buildFieldSnapshotQuery(filters));
    const licenceRows = await listPetroleumLicenceSnapshots(buildLicenceSnapshotQuery(filters));
    const productionPoints =
      fieldRows.length > 0
        ? await listPetroleumProductionPointsForEntities({
            entityType: "FIELD",
            entityNpdIds: fieldRows.map((field) => field.fieldNpdId),
          })
        : [];
    const productionLookup = buildFieldProductionLookup(productionPoints);
    const operatorIds = new Set([
      ...fieldRows
        .map((field) => field.operatorNpdCompanyId)
        .filter((value): value is number => typeof value === "number"),
      ...licenceRows
        .map((licence) => licence.operatorNpdCompanyId)
        .filter((value): value is number => typeof value === "number"),
    ]);

    items = [...operatorIds].map((operatorId) => {
      const operatorFields = fieldRows.filter((field) => field.operatorNpdCompanyId === operatorId);
      const operatorLicences = licenceRows.filter((licence) => licence.operatorNpdCompanyId === operatorId);
      const reference = operatorFields[0] ?? operatorLicences[0];
      return {
        mode,
        operatorId: String(operatorId),
        operatorName: reference?.operatorName ?? `Operator ${operatorId}`,
        operatorOrgNumber: reference?.operatorOrgNumber ?? null,
        operatorSlug: reference?.operatorSlug ?? null,
        fieldCount: operatorFields.length,
        licenceCount: operatorLicences.length,
        latestProductionOe: operatorFields.reduce((sum, field) => sum + (field.latestAnnualOe ?? 0), 0),
        latestProductionValue: operatorFields.reduce((sum, field) => {
          const metric = getSnapshotMetric(field, productionLookup, selectedProduct, selectedView);
          return sum + (metric.value ?? 0);
        }, 0),
        latestProductionUnit: getRateUnit(selectedProduct, selectedView),
        remainingOe: operatorFields.reduce((sum, field) => sum + (field.remainingOe ?? 0), 0),
      };
    });
    items.sort(
      (left, right) =>
        ((right.mode === "operators" ? right.latestProductionOe : 0) ?? 0) -
          ((left.mode === "operators" ? left.latestProductionOe : 0) ?? 0) ||
        ("operatorName" in left && "operatorName" in right
          ? (left.operatorName ?? "").localeCompare(right.operatorName ?? "", "nb-NO")
          : 0),
    );

    const totalCount = items.length;
    const pagedItems = items.slice(page * size, page * size + size);

    return {
      mode,
      items: pagedItems,
      page,
      size,
      totalCount,
    };
  } else {
    const fieldQuery = buildFieldSnapshotQuery(filters);
    const [totalCount, fieldRows] = await Promise.all([
      countPetroleumFieldSnapshots(fieldQuery),
      listPetroleumFieldSnapshots({
        ...fieldQuery,
        skip: page * size,
        take: size,
        orderBy: [{ latestAnnualOe: "desc" }, { name: "asc" }],
      }),
    ]);
    const productionPoints =
      fieldRows.length > 0
        ? await listPetroleumProductionPointsForEntities({
            entityType: "FIELD",
            entityNpdIds: fieldRows.map((field) => field.fieldNpdId),
          })
        : [];
    const productionLookup = buildFieldProductionLookup(productionPoints);

    items = fieldRows.map((field) => {
      const metric = getSnapshotMetric(field, productionLookup, selectedProduct, selectedView);

      return {
        mode,
        entityId: field.fieldSlug,
        npdId: field.fieldNpdId,
        name: field.name,
        area: field.area,
        status: field.status,
        hcType: field.hcType,
        operatorName: field.operatorName,
        operatorSlug: field.operatorSlug,
        latestProductionOe: field.latestAnnualOe ?? null,
        latestProductionValue: metric.value,
        latestProductionUnit: metric.unit,
        remainingOe: field.remainingOe ?? null,
        expectedFutureInvestmentNok:
          typeof field.expectedFutureInvestmentNok === "bigint" ? Number(field.expectedFutureInvestmentNok) : null,
      };
    });

    return {
      mode,
      items,
      page,
      size,
      totalCount,
    };
  }
}

function resolveEntityType(value: string) {
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "FIELD" ||
    normalized === "DISCOVERY" ||
    normalized === "LICENCE" ||
    normalized === "FACILITY" ||
    normalized === "TUF" ||
    normalized === "SURVEY" ||
    normalized === "WELLBORE"
  ) {
    return normalized as PetroleumEntityDetail["entityType"];
  }

  return null;
}

export async function getPetroleumEntityDetailById(entityTypeInput: string, id: string): Promise<PetroleumEntityDetail | null> {
  const entityType = resolveEntityType(entityTypeInput);
  if (!entityType) {
    return null;
  }

  const entity = await findPetroleumEntityDetailBySlugOrNpdId(entityType, id);
  if (!entity) {
    return null;
  }

  const currentYear = new Date().getUTCFullYear();
  const [reserve, investment, productionPoints, persistedEvents] = await Promise.all([
    findPetroleumReserveSnapshotForEntity(entityType, entity.npdId),
    findPetroleumInvestmentSnapshotForEntity(entityType, entity.npdId),
    listPetroleumProductionPointsForEntity({
      entityType,
      entityNpdId: entity.npdId,
      yearTo: currentYear,
    }),
    listPetroleumEventsFiltered({
      entityRefs: [{ entityType, entityNpdIds: [entity.npdId] }],
      take: 50,
    }),
  ]);
  const timeseries = productionPoints
    .map((point) => ({
      key: `${point.entityNpdId}:${point.year}:${point.month ?? 0}`,
      entityType: "field",
      label: entity.name,
      year: point.year,
      month: point.month,
      oil: point.oilNetMillSm3,
      gas: point.gasNetBillSm3,
      condensate: point.condensateNetMillSm3,
      ngl: point.nglNetMillSm3,
      oe: point.oeNetMillSm3,
      producedWater: point.producedWaterMillSm3,
      investments: point.investmentsMillNok ? point.investmentsMillNok * 1_000_000 : null,
    }));

  const relatedEvents = [
    ...persistedEvents
      .filter((event) => event.entityType === entityType && event.entityNpdId === entity.npdId)
      .map(mapPersistedEvent),
    ...derivePetregEvents(entityType === "LICENCE" ? [entity as PetroleumLicence] : []),
  ];

  const licenseeEntries =
    "licensees" in entity
      ? parseJsonArray(entity.licensees).filter(
          (entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"),
        )
      : [];
  const relatedCompanyLinks = [
    entityType === "WELLBORE"
      ? toLinkedCompany({
          npdCompanyId: (entity as PetroleumWellbore).drillingOperatorNpdCompanyId,
          companyName: (entity as PetroleumWellbore).drillingOperatorName,
          orgNumber: (entity as PetroleumWellbore).drillingOperatorOrgNumber,
          companySlug: (entity as PetroleumWellbore).drillingOperatorSlug,
        })
      : getEntityOperator(entity as PetroleumField | PetroleumDiscovery | PetroleumLicence | PetroleumFacility | PetroleumTuf),
    ...licenseeEntries.map((entry) =>
      toLinkedCompany({
        npdCompanyId: typeof entry.npdCompanyId === "number" ? entry.npdCompanyId : null,
        companyName: typeof entry.companyName === "string" ? entry.companyName : null,
        orgNumber: typeof entry.orgNumber === "string" ? entry.orgNumber : null,
        companySlug: typeof entry.companySlug === "string" ? entry.companySlug : null,
      }),
    ),
  ].filter((value): value is PetroleumLinkedCompany => Boolean(value));

  return {
    id: entity.slug,
    entityType,
    entityNpdId: entity.npdId,
    name: entity.name,
    status:
      "activityStatus" in entity
        ? entity.activityStatus
        : "currentPhase" in entity
          ? entity.currentPhase ?? ("status" in entity ? entity.status : null)
          : "phase" in entity
            ? entity.phase
            : "status" in entity
              ? entity.status
              : null,
    area:
      "mainArea" in entity
        ? entity.mainArea
        : "areaName" in entity
          ? entity.areaName
          : "belongsToName" in entity
            ? entity.belongsToName
            : "geographicalArea" in entity
              ? entity.geographicalArea
              : null,
    hcType:
      "hydrocarbonType" in entity
        ? entity.hydrocarbonType
        : "medium" in entity
          ? entity.medium
          : null,
    phase: "currentPhase" in entity ? entity.currentPhase : "phase" in entity ? entity.phase : null,
    geometry: (entity.geometry as never) ?? null,
    centroid: parseCoordinate(entity.centroid as unknown) ?? null,
    factPageUrl: entity.factPageUrl ?? null,
    factMapUrl: "factMapUrl" in entity ? entity.factMapUrl ?? null : null,
    operator:
      entityType === "SURVEY"
        ? null
        : entityType === "WELLBORE"
          ? toLinkedCompany({
              npdCompanyId: (entity as PetroleumWellbore).drillingOperatorNpdCompanyId,
              companyName: (entity as PetroleumWellbore).drillingOperatorName,
              orgNumber: (entity as PetroleumWellbore).drillingOperatorOrgNumber,
              companySlug: (entity as PetroleumWellbore).drillingOperatorSlug,
            })
          : getEntityOperator(entity as PetroleumField | PetroleumDiscovery | PetroleumLicence | PetroleumFacility | PetroleumTuf),
    licensees: licenseeEntries.map((entry) => ({
      npdCompanyId: typeof entry.npdCompanyId === "number" ? entry.npdCompanyId : null,
      companyName:
        typeof entry.companyName === "string"
          ? entry.companyName
          : `Selskap ${typeof entry.npdCompanyId === "number" ? entry.npdCompanyId : ""}`.trim(),
      orgNumber: typeof entry.orgNumber === "string" ? entry.orgNumber : null,
      slug: typeof entry.companySlug === "string" ? entry.companySlug : null,
      share: typeof entry.sharePercent === "number" ? entry.sharePercent : null,
      sdfiShare: typeof entry.sdfiSharePercent === "number" ? entry.sdfiSharePercent : null,
      validFrom:
        typeof entry.validFrom === "string" && entry.validFrom ? new Date(entry.validFrom) : null,
      validTo: typeof entry.validTo === "string" && entry.validTo ? new Date(entry.validTo) : null,
    })),
    reserve: reserve
      ? {
          entityType,
          entityId: entity.slug,
          entityNpdId: entity.npdId,
          entityName: reserve.entityName ?? entity.name,
          updatedAt: reserve.updatedAtSource ?? null,
          recoverableOil: reserve.recoverableOil ?? null,
          recoverableGas: reserve.recoverableGas ?? null,
          recoverableNgl: reserve.recoverableNgl ?? null,
          recoverableCondensate: reserve.recoverableCondensate ?? null,
          recoverableOe: reserve.recoverableOe ?? null,
          remainingOil: reserve.remainingOil ?? null,
          remainingGas: reserve.remainingGas ?? null,
          remainingNgl: reserve.remainingNgl ?? null,
          remainingCondensate: reserve.remainingCondensate ?? null,
          remainingOe: reserve.remainingOe ?? null,
        }
      : null,
    investment: investment
      ? {
          entityType,
          entityId: entity.slug,
          entityNpdId: entity.npdId,
          entityName: investment.entityName ?? entity.name,
          expectedFutureInvestmentNok: (investment.expectedFutureInvestmentMillNok ?? 0) * 1_000_000,
          fixedYear: investment.fixedYear ?? null,
        }
      : null,
    timeseries: timeseries.map((point) => ({ ...point, entityType: "field" })),
    relatedEvents,
    relatedCompanyLinks,
    concepts: attachEntityConcepts(entityType),
    metadata: {
      sourceSystem: entity.sourceSystem,
      sourceEntityType: entity.sourceEntityType,
      sourceId: entity.sourceId,
      ...("category" in entity ? { category: entity.category ?? null } : {}),
      ...("mainType" in entity ? { mainType: entity.mainType ?? null } : {}),
      ...("subType" in entity ? { subType: entity.subType ?? null } : {}),
      ...("companyName" in entity ? { companyName: entity.companyName ?? null } : {}),
      ...("startedAt" in entity ? { startedAt: entity.startedAt?.toISOString() ?? null } : {}),
      ...("finalizedAt" in entity ? { finalizedAt: entity.finalizedAt?.toISOString() ?? null } : {}),
      ...("plannedFromDate" in entity ? { plannedFromDate: entity.plannedFromDate?.toISOString() ?? null } : {}),
      ...("plannedToDate" in entity ? { plannedToDate: entity.plannedToDate?.toISOString() ?? null } : {}),
      ...("wellType" in entity ? { wellType: entity.wellType ?? null } : {}),
      ...("purpose" in entity ? { purpose: entity.purpose ?? null } : {}),
      ...("waterDepth" in entity ? { waterDepth: entity.waterDepth ?? null } : {}),
      ...("totalDepth" in entity ? { totalDepth: entity.totalDepth ?? null } : {}),
      ...("fieldName" in entity ? { fieldName: entity.fieldName ?? null } : {}),
    },
  };
}

export async function getPetroleumEvents(
  filters: PetroleumMarketFilters,
  limit = 100,
): Promise<PetroleumEventRow[]> {
  const [fieldSnapshots, licenceSnapshots] = await Promise.all([
    listPetroleumFieldSnapshots(buildFieldSnapshotQuery(filters)),
    listPetroleumLicenceSnapshots(buildLicenceSnapshotQuery(filters)),
  ]);
  const licenceIds = licenceSnapshots.map((licence) => licence.licenceNpdId);
  const hasEventFilters = Boolean(
    filters.query ||
      filters.status?.length ||
      filters.areas?.length ||
      filters.operatorIds?.length ||
      filters.licenseeIds?.length ||
      filters.hcTypes?.length,
  );
  const [persistedEvents, filteredLicences] = await Promise.all([
    hasEventFilters
      ? listPetroleumEventsFiltered({
          entityRefs: [
            ...(fieldSnapshots.length
              ? [{ entityType: "FIELD" as const, entityNpdIds: fieldSnapshots.map((field) => field.fieldNpdId) }]
              : []),
            ...(licenceIds.length
              ? [{ entityType: "LICENCE" as const, entityNpdIds: licenceIds }]
              : []),
          ],
          take: limit * 3,
        })
      : listPetroleumEventsFiltered({ take: limit * 3 }),
    listPetroleumLicencesByNpdIds(licenceIds),
  ]);
  const allowedLicenceIds = new Set(licenceIds);

  return [
    ...persistedEvents.map(mapPersistedEvent),
    ...derivePetregEvents(filteredLicences),
  ]
    .filter((event) => !event.entityNpdId || !event.entityType || event.entityType !== "LICENCE" || allowedLicenceIds.has(event.entityNpdId))
    .sort((left, right) => (right.publishedAt?.getTime() ?? 0) - (left.publishedAt?.getTime() ?? 0))
    .slice(0, limit);
}
