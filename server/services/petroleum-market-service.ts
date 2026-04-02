import {
  PetroleumCompanyLink,
  PetroleumDiscovery,
  PetroleumEvent,
  PetroleumFacility,
  PetroleumField,
  PetroleumInvestmentSnapshot,
  PetroleumLicence,
  PetroleumProductionPoint,
  PetroleumReserveSnapshot,
  PetroleumSurvey,
  PetroleumSyncState,
  PetroleumTuf,
} from "@prisma/client";

import { fetchGasscoPetroleumEvents } from "@/integrations/gassco/gassco-market-provider";
import { fetchHavtilPetroleumEvents } from "@/integrations/havtil/havtil-market-provider";
import {
  fetchSodirPetroleumCoreData,
  fetchSodirPetroleumMetricsData,
} from "@/integrations/sodir/sodir-market-provider";
import { normalizeLayerSelection } from "@/lib/petroleum-market";
import {
  PetroleumEntityCompanyInterest,
  PetroleumEntityDetail,
  PetroleumEventRow,
  PetroleumFilterOption,
  PetroleumFilterOptions,
  PetroleumLinkedCompany,
  PetroleumMapFeature,
  PetroleumMarketFilters,
  PetroleumSourceStatus,
  PetroleumSummaryResponse,
  PetroleumTableMode,
  PetroleumTableResponse,
  PetroleumTimeSeriesEntityType,
  PetroleumTimeSeriesGranularity,
  PetroleumTimeSeriesMeasure,
  PetroleumTimeSeriesPoint,
} from "@/lib/types";
import {
  getCompanySlugLookup,
  getPetroleumSyncState,
  listPetroleumCompanyLinks,
  listPetroleumDiscoveries,
  listPetroleumEvents,
  listPetroleumFacilities,
  listPetroleumFields,
  listPetroleumInvestmentSnapshots,
  listPetroleumLicences,
  listPetroleumProductionPoints,
  listPetroleumReserveSnapshots,
  listPetroleumSurveys,
  listPetroleumTufs,
  replacePetroleumCoreData,
  replacePetroleumEventsForSource,
  replacePetroleumMetricsData,
  upsertPetroleumSyncState,
} from "@/server/persistence/petroleum-market-repository";
import {
  PetroleumCoreSyncPayload,
  PetroleumEventsSyncPayload,
  PetroleumMetricsSyncPayload,
} from "@/server/services/petroleum-market-types";

type CoreDataset = {
  companyLinks: PetroleumCompanyLink[];
  fields: PetroleumField[];
  discoveries: PetroleumDiscovery[];
  licences: PetroleumLicence[];
  facilities: PetroleumFacility[];
  tufs: PetroleumTuf[];
  surveys: PetroleumSurvey[];
};

type MetricsDataset = {
  productionPoints: PetroleumProductionPoint[];
  reserveSnapshots: PetroleumReserveSnapshot[];
  investmentSnapshots: PetroleumInvestmentSnapshot[];
};

const SYNC_KEYS = {
  core: "petroleum-core",
  metrics: "petroleum-metrics",
  havtil: "petroleum-events-havtil",
  gassco: "petroleum-events-gassco",
} as const;

const MAX_AGE_HOURS = {
  core: 24,
  metrics: 24,
  havtil: 6,
  gassco: 0.25,
} as const;

function hoursSince(date?: Date | null) {
  if (!date) {
    return Number.POSITIVE_INFINITY;
  }

  return (Date.now() - date.getTime()) / 3_600_000;
}

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

async function ensureSyncFresh(key: keyof typeof SYNC_KEYS, maxAgeHours: number, run: () => Promise<void>) {
  const state = await getPetroleumSyncState(SYNC_KEYS[key]);
  if (hoursSince(state?.lastSuccessAt) <= maxAgeHours) {
    return;
  }

  await run();
}

async function ensureCoreReady() {
  await ensureSyncFresh("core", MAX_AGE_HOURS.core, syncCoreData);
}

async function ensureMetricsReady() {
  await ensureCoreReady();
  await ensureSyncFresh("metrics", MAX_AGE_HOURS.metrics, syncMetricsData);
}

async function ensureEventsReady() {
  await Promise.all([
    ensureSyncFresh("havtil", MAX_AGE_HOURS.havtil, () =>
      syncEventSource("havtil", "HAVTIL", fetchHavtilPetroleumEvents),
    ),
    ensureSyncFresh("gassco", MAX_AGE_HOURS.gassco, () =>
      syncEventSource("gassco", "GASSCO", fetchGasscoPetroleumEvents),
    ),
  ]);
}

async function getCoreDataset(): Promise<CoreDataset> {
  await ensureCoreReady();

  const [companyLinks, fields, discoveries, licences, facilities, tufs, surveys] = await Promise.all([
    listPetroleumCompanyLinks(),
    listPetroleumFields(),
    listPetroleumDiscoveries(),
    listPetroleumLicences(),
    listPetroleumFacilities(),
    listPetroleumTufs(),
    listPetroleumSurveys(),
  ]);

  return { companyLinks, fields, discoveries, licences, facilities, tufs, surveys };
}

async function getMetricsDataset(): Promise<MetricsDataset> {
  await ensureMetricsReady();

  const [productionPoints, reserveSnapshots, investmentSnapshots] = await Promise.all([
    listPetroleumProductionPoints(),
    listPetroleumReserveSnapshots(),
    listPetroleumInvestmentSnapshots(),
  ]);

  return { productionPoints, reserveSnapshots, investmentSnapshots };
}

async function getPersistedEvents() {
  await ensureEventsReady();
  return listPetroleumEvents();
}

function buildCompanyLookup(companyLinks: PetroleumCompanyLink[]) {
  return new Map(companyLinks.map((item) => [item.npdCompanyId, item]));
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

function filterSurveys(surveys: PetroleumSurvey[], filters: PetroleumMarketFilters) {
  return surveys.filter((item) =>
    matchesCommonFilters(filters, {
      name: item.name,
      bbox: item.bbox,
      status: item.status,
      area: item.geographicalArea,
      operatorId: item.companyNpdId,
      hcType: item.mainType,
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

function mapFieldFeature(
  field: PetroleumField,
  metrics?: {
    latestProductionOe?: number | null;
    remainingOe?: number | null;
    expectedFutureInvestmentNok?: number | null;
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

function buildFilterOptions(core: CoreDataset): PetroleumFilterOptions {
  const statusCounts = new Map<string, number>();
  const areaCounts = new Map<string, number>();
  const operatorCounts = new Map<string, { label: string; count: number }>();
  const licenseeCounts = new Map<string, { label: string; count: number }>();
  const hcCounts = new Map<string, number>();

  const bump = (map: Map<string, number>, value?: string | null) => {
    const key = value?.trim();
    if (!key) return;
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  for (const field of core.fields) {
    bump(statusCounts, field.activityStatus);
    bump(areaCounts, field.mainArea);
    bump(hcCounts, field.hydrocarbonType);
    if (field.operatorNpdCompanyId && field.operatorCompanyName) {
      const key = String(field.operatorNpdCompanyId);
      operatorCounts.set(key, {
        label: field.operatorCompanyName,
        count: (operatorCounts.get(key)?.count ?? 0) + 1,
      });
    }
    for (const entry of parseJsonArray(field.licensees)) {
      if (entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).npdCompanyId === "number") {
        const key = String((entry as Record<string, unknown>).npdCompanyId);
        licenseeCounts.set(key, {
          label: String((entry as Record<string, unknown>).companyName ?? key),
          count: (licenseeCounts.get(key)?.count ?? 0) + 1,
        });
      }
    }
  }

  for (const item of core.discoveries) {
    bump(statusCounts, item.activityStatus);
    bump(areaCounts, item.areaName);
    bump(hcCounts, item.hydrocarbonType);
  }
  for (const item of core.licences) {
    bump(statusCounts, item.status ?? item.currentPhase);
    bump(areaCounts, item.mainArea);
  }
  for (const item of core.facilities) {
    bump(statusCounts, item.phase);
  }
  for (const item of core.tufs) {
    bump(statusCounts, item.currentPhase);
    bump(hcCounts, item.medium);
  }
  for (const item of core.surveys) {
    bump(statusCounts, item.status);
    bump(areaCounts, item.geographicalArea);
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
  const [core, metrics] = await Promise.all([getCoreDataset(), getMetricsDataset()]);
  const layers = normalizeLayerSelection(filters.layers);
  const features: PetroleumMapFeature[] = [];
  const productionLookup = buildFieldProductionLookup(metrics.productionPoints);
  const reserveLookup = buildReserveLookup(metrics.reserveSnapshots);
  const investmentLookup = buildInvestmentLookup(metrics.investmentSnapshots);

  if (layers.includes("fields")) {
    features.push(
      ...filterFields(core.fields, filters)
        .map((field) =>
          mapFieldFeature(field, {
            latestProductionOe: getLatestAnnualPoint(productionLookup.get(field.npdId) ?? [])?.oeNetMillSm3 ?? null,
            remainingOe: reserveLookup.get(field.npdId)?.remainingOe ?? null,
            expectedFutureInvestmentNok:
              (investmentLookup.get(field.npdId)?.expectedFutureInvestmentMillNok ?? 0) * 1_000_000,
          }),
        )
        .filter(Boolean) as PetroleumMapFeature[],
    );
  }
  if (layers.includes("discoveries")) {
    features.push(
      ...filterDiscoveries(core.discoveries, filters)
        .map(mapDiscoveryFeature)
        .filter(Boolean) as PetroleumMapFeature[],
    );
  }
  if (layers.includes("licences")) {
    features.push(...filterLicences(core.licences, filters).map(mapLicenceFeature).filter(Boolean) as PetroleumMapFeature[]);
  }
  if (layers.includes("facilities")) {
    features.push(
      ...filterFacilities(core.facilities, filters)
        .map(mapFacilityFeature)
        .filter(Boolean) as PetroleumMapFeature[],
    );
  }
  if (layers.includes("tuf")) {
    features.push(...filterTufs(core.tufs, filters).map(mapTufFeature).filter(Boolean) as PetroleumMapFeature[]);
  }
  if (layers.includes("surveys")) {
    features.push(...filterSurveys(core.surveys, filters).map(mapSurveyFeature).filter(Boolean) as PetroleumMapFeature[]);
  }

  return features;
}

export async function getPetroleumMarketSummary(
  filters: PetroleumMarketFilters,
): Promise<PetroleumSummaryResponse> {
  const [core, metrics, persistedEvents, sourceStatus] = await Promise.all([
    getCoreDataset(),
    getMetricsDataset(),
    getPersistedEvents(),
    buildSourceStatus(),
  ]);

  const filteredFields = filterFields(core.fields, filters);
  const filteredLicences = filterLicences(core.licences, filters);
  const productionLookup = buildFieldProductionLookup(metrics.productionPoints);
  const reserveLookup = buildReserveLookup(metrics.reserveSnapshots);
  const investmentLookup = buildInvestmentLookup(metrics.investmentSnapshots);
  const latestProductionYear =
    metrics.productionPoints.reduce((latest, point) => Math.max(latest, point.year), 0) || null;
  const filteredFieldIds = new Set(filteredFields.map((field) => field.npdId));
  const selectedAnnualOe = filteredFields.reduce(
    (sum, field) => sum + (getLatestAnnualPoint(productionLookup.get(field.npdId) ?? [])?.oeNetMillSm3 ?? 0),
    0,
  );
  const selectedRemainingOe = filteredFields.reduce(
    (sum, field) => sum + (reserveLookup.get(field.npdId)?.remainingOe ?? 0),
    0,
  );
  const selectedRecoverableOe = filteredFields.reduce(
    (sum, field) => sum + (reserveLookup.get(field.npdId)?.recoverableOe ?? 0),
    0,
  );
  const selectedHistoricalInvestmentsNok = filteredFields.reduce((sum, field) => {
    const points = productionLookup.get(field.npdId) ?? [];
    return sum + points.reduce((inner, point) => inner + ((point.investmentsMillNok ?? 0) * 1_000_000), 0);
  }, 0);
  const selectedFutureInvestmentsNok = filteredFields.reduce(
    (sum, field) => sum + ((investmentLookup.get(field.npdId)?.expectedFutureInvestmentMillNok ?? 0) * 1_000_000),
    0,
  );
  const latestNcsProductionOe = metrics.productionPoints
    .filter((point) => point.year === latestProductionYear && point.period === "year")
    .reduce((sum, point) => sum + (point.oeNetMillSm3 ?? 0), 0);
  const operatorIds = new Set(filteredFields.map((field) => field.operatorNpdCompanyId).filter(Boolean));
  const recentEvents = [
    ...persistedEvents.map(mapPersistedEvent),
    ...derivePetregEvents(core.licences),
  ].filter((event) => {
    const publishedAt = event.publishedAt?.getTime();
    if (!publishedAt) return false;
    if (Date.now() - publishedAt > 365 * 24 * 3_600_000) return false;
    return !event.entityNpdId || filteredFieldIds.has(event.entityNpdId) || filteredLicences.some((licence) => licence.npdId === event.entityNpdId);
  });

  const topFields = filteredFields
    .map((field) => ({
      entityId: field.slug,
      npdId: field.npdId,
      name: field.name,
      area: field.mainArea,
      operatorName: field.operatorCompanyName,
      operatorSlug: field.operatorCompanySlug,
      status: field.activityStatus,
      oe: getLatestAnnualPoint(productionLookup.get(field.npdId) ?? [])?.oeNetMillSm3 ?? null,
      remainingOe: reserveLookup.get(field.npdId)?.remainingOe ?? null,
      expectedFutureInvestmentNok:
        (investmentLookup.get(field.npdId)?.expectedFutureInvestmentMillNok ?? 0) * 1_000_000,
    }))
    .sort((left, right) => (right.oe ?? 0) - (left.oe ?? 0))
    .slice(0, 8);

  const operatorConcentration = [...operatorIds]
    .map((operatorNpdId) => {
      const operatorFields = filteredFields.filter((field) => field.operatorNpdCompanyId === operatorNpdId);
      const oe = operatorFields.reduce(
        (sum, field) => sum + (getLatestAnnualPoint(productionLookup.get(field.npdId) ?? [])?.oeNetMillSm3 ?? 0),
        0,
      );
      const reference = operatorFields[0];

      return {
        operatorName: reference?.operatorCompanyName ?? `Operator ${operatorNpdId}`,
        operatorOrgNumber: reference?.operatorOrgNumber ?? null,
        operatorSlug: reference?.operatorCompanySlug ?? null,
        oe,
        fieldCount: operatorFields.length,
      };
    })
    .sort((left, right) => (right.oe ?? 0) - (left.oe ?? 0))
    .slice(0, 8);

  return {
    kpis: {
      activeFieldCount: filteredFields.filter((field) => normalizeText(field.activityStatus).includes("producing")).length,
      activeLicenceCount: filteredLicences.filter((licence) => licence.active).length,
      selectedLatestProductionOe: selectedAnnualOe,
      selectedRemainingOe,
      selectedOperatorCount: operatorIds.size,
      recentEventCount: recentEvents.length,
    },
    benchmark: {
      latestProductionYear,
      latestProductionOe: latestNcsProductionOe,
      selectedProductionShareOfNcs:
        latestNcsProductionOe > 0 ? selectedAnnualOe / latestNcsProductionOe : null,
      selectedRecoverableOe,
      selectedRemainingOe,
      selectedHistoricalInvestmentsNok,
      selectedFutureInvestmentsNok,
      totalFields: core.fields.length,
      totalLicences: core.licences.length,
      totalOperators: new Set(core.fields.map((field) => field.operatorNpdCompanyId).filter(Boolean)).size,
    },
    topFields,
    operatorConcentration,
    filterOptions: buildFilterOptions(core),
    sourceStatus,
    latestProductionYear,
  };
}

export async function getPetroleumMarketTimeseries(input: {
  filters: PetroleumMarketFilters;
  entityType: PetroleumTimeSeriesEntityType;
  entityIds?: string[];
  granularity: PetroleumTimeSeriesGranularity;
  measures: PetroleumTimeSeriesMeasure[];
}) {
  const [core, metrics] = await Promise.all([getCoreDataset(), getMetricsDataset()]);
  const fields = filterFields(core.fields, input.filters);
  const allowedFieldIds = new Set(fields.map((field) => field.npdId));
  const fieldLookup = new Map(fields.map((field) => [field.npdId, field]));
  const groups = new Map<string, PetroleumTimeSeriesPoint>();

  for (const point of metrics.productionPoints) {
    if (point.entityType !== "FIELD" || !allowedFieldIds.has(point.entityNpdId)) {
      continue;
    }

    const field = fieldLookup.get(point.entityNpdId);
    if (!field) {
      continue;
    }

    let groupKey = "selected";
    let label = "Valgt utvalg";

    if (input.entityType === "field") {
      if (input.entityIds?.length && !input.entityIds.includes(field.slug)) {
        continue;
      }
      groupKey = field.slug;
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
      oil: 0,
      gas: 0,
      condensate: 0,
      ngl: 0,
      oe: 0,
      producedWater: 0,
      investments: 0,
    };

    current.oil = (current.oil ?? 0) + (point.oilNetMillSm3 ?? 0);
    current.gas = (current.gas ?? 0) + (point.gasNetBillSm3 ?? 0);
    current.condensate = (current.condensate ?? 0) + (point.condensateNetMillSm3 ?? 0);
    current.ngl = (current.ngl ?? 0) + (point.nglNetMillSm3 ?? 0);
    current.oe = (current.oe ?? 0) + (point.oeNetMillSm3 ?? 0);
    current.producedWater = (current.producedWater ?? 0) + (point.producedWaterMillSm3 ?? 0);
    current.investments = (current.investments ?? 0) + ((point.investmentsMillNok ?? 0) * 1_000_000);
    groups.set(key, current);
  }

  return [...groups.values()].sort((left, right) =>
    left.year === right.year ? (left.month ?? 0) - (right.month ?? 0) : left.year - right.year,
  );
}

export async function getPetroleumMarketTable(filters: PetroleumMarketFilters): Promise<PetroleumTableResponse> {
  const [core, metrics] = await Promise.all([getCoreDataset(), getMetricsDataset()]);
  const mode = filters.tableMode ?? "fields";
  const page = filters.page ?? 0;
  const size = filters.size ?? 25;
  const productionLookup = buildFieldProductionLookup(metrics.productionPoints);
  const reserveLookup = buildReserveLookup(metrics.reserveSnapshots);
  const investmentLookup = buildInvestmentLookup(metrics.investmentSnapshots);
  let items: PetroleumTableResponse["items"] = [];

  if (mode === "licences") {
    items = filterLicences(core.licences, filters).map((licence) => ({
      mode,
      entityId: licence.slug,
      npdId: licence.npdId,
      name: licence.name,
      area: licence.mainArea,
      status: licence.status,
      currentPhase: licence.currentPhase,
      operatorName: licence.operatorCompanyName,
      operatorSlug: licence.operatorCompanySlug,
      currentAreaSqKm: licence.currentAreaSqKm,
      originalAreaSqKm: licence.originalAreaSqKm,
      transferCount: parseJsonArray(licence.transfers).length,
    }));
  } else if (mode === "operators") {
    const fields = filterFields(core.fields, filters);
    const licences = filterLicences(core.licences, filters);
    const operatorIds = new Set([
      ...fields.map((field) => field.operatorNpdCompanyId).filter(Boolean),
      ...licences.map((licence) => licence.operatorNpdCompanyId).filter(Boolean),
    ]);

    items = [...operatorIds].map((operatorId) => {
      const operatorFields = fields.filter((field) => field.operatorNpdCompanyId === operatorId);
      const operatorLicences = licences.filter((licence) => licence.operatorNpdCompanyId === operatorId);
      const reference = operatorFields[0] ?? operatorLicences[0];
      return {
        mode,
        operatorId: String(operatorId),
        operatorName: reference?.operatorCompanyName ?? `Operator ${operatorId}`,
        operatorOrgNumber: reference?.operatorOrgNumber ?? null,
        operatorSlug: reference?.operatorCompanySlug ?? null,
        fieldCount: operatorFields.length,
        licenceCount: operatorLicences.length,
        latestProductionOe: operatorFields.reduce(
          (sum, field) => sum + (getLatestAnnualPoint(productionLookup.get(field.npdId) ?? [])?.oeNetMillSm3 ?? 0),
          0,
        ),
        remainingOe: operatorFields.reduce(
          (sum, field) => sum + (reserveLookup.get(field.npdId)?.remainingOe ?? 0),
          0,
        ),
      };
    });
  } else {
    items = filterFields(core.fields, filters).map((field) => ({
      mode,
      entityId: field.slug,
      npdId: field.npdId,
      name: field.name,
      area: field.mainArea,
      status: field.activityStatus,
      hcType: field.hydrocarbonType,
      operatorName: field.operatorCompanyName,
      operatorSlug: field.operatorCompanySlug,
      latestProductionOe: getLatestAnnualPoint(productionLookup.get(field.npdId) ?? [])?.oeNetMillSm3 ?? null,
      remainingOe: reserveLookup.get(field.npdId)?.remainingOe ?? null,
      expectedFutureInvestmentNok:
        (investmentLookup.get(field.npdId)?.expectedFutureInvestmentMillNok ?? 0) * 1_000_000,
    }));
  }

  const totalCount = items.length;
  const pagedItems = items.slice(page * size, page * size + size);

  return {
    mode,
    items: pagedItems,
    page,
    size,
    totalCount,
  };
}

function resolveEntityType(value: string) {
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "FIELD" ||
    normalized === "DISCOVERY" ||
    normalized === "LICENCE" ||
    normalized === "FACILITY" ||
    normalized === "TUF" ||
    normalized === "SURVEY"
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

  const [core, metrics, persistedEvents] = await Promise.all([
    getCoreDataset(),
    getMetricsDataset(),
    getPersistedEvents(),
  ]);

  const collection =
    entityType === "FIELD"
      ? core.fields
      : entityType === "DISCOVERY"
        ? core.discoveries
        : entityType === "LICENCE"
          ? core.licences
          : entityType === "FACILITY"
            ? core.facilities
            : entityType === "TUF"
              ? core.tufs
              : core.surveys;
  const numericId = Number(id);
  const entity = collection.find((item) => item.slug === id || item.npdId === numericId);
  if (!entity) {
    return null;
  }

  const reserveLookup = buildReserveLookup(metrics.reserveSnapshots);
  const investmentLookup = buildInvestmentLookup(metrics.investmentSnapshots);
  const timeseries = metrics.productionPoints
    .filter((point) => point.entityType === entityType && point.entityNpdId === entity.npdId)
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
    getEntityOperator(entity as PetroleumField | PetroleumDiscovery | PetroleumLicence | PetroleumFacility | PetroleumTuf),
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
    reserve: reserveLookup.has(entity.npdId)
      ? {
          entityType,
          entityId: entity.slug,
          entityNpdId: entity.npdId,
          entityName: reserveLookup.get(entity.npdId)?.entityName ?? entity.name,
          updatedAt: reserveLookup.get(entity.npdId)?.updatedAtSource ?? null,
          recoverableOil: reserveLookup.get(entity.npdId)?.recoverableOil ?? null,
          recoverableGas: reserveLookup.get(entity.npdId)?.recoverableGas ?? null,
          recoverableNgl: reserveLookup.get(entity.npdId)?.recoverableNgl ?? null,
          recoverableCondensate: reserveLookup.get(entity.npdId)?.recoverableCondensate ?? null,
          recoverableOe: reserveLookup.get(entity.npdId)?.recoverableOe ?? null,
          remainingOil: reserveLookup.get(entity.npdId)?.remainingOil ?? null,
          remainingGas: reserveLookup.get(entity.npdId)?.remainingGas ?? null,
          remainingNgl: reserveLookup.get(entity.npdId)?.remainingNgl ?? null,
          remainingCondensate: reserveLookup.get(entity.npdId)?.remainingCondensate ?? null,
          remainingOe: reserveLookup.get(entity.npdId)?.remainingOe ?? null,
        }
      : null,
    investment: investmentLookup.has(entity.npdId)
      ? {
          entityType,
          entityId: entity.slug,
          entityNpdId: entity.npdId,
          entityName: investmentLookup.get(entity.npdId)?.entityName ?? entity.name,
          expectedFutureInvestmentNok:
            (investmentLookup.get(entity.npdId)?.expectedFutureInvestmentMillNok ?? 0) * 1_000_000,
          fixedYear: investmentLookup.get(entity.npdId)?.fixedYear ?? null,
        }
      : null,
    timeseries: timeseries.map((point) => ({ ...point, entityType: "field" })),
    relatedEvents,
    relatedCompanyLinks,
    metadata: {
      sourceSystem: entity.sourceSystem,
      sourceEntityType: entity.sourceEntityType,
      sourceId: entity.sourceId,
    },
  };
}

export async function getPetroleumEvents(
  filters: PetroleumMarketFilters,
  limit = 100,
): Promise<PetroleumEventRow[]> {
  const [core, persistedEvents] = await Promise.all([getCoreDataset(), getPersistedEvents()]);
  const filteredLicences = filterLicences(core.licences, filters);
  const licenceIds = new Set(filteredLicences.map((licence) => licence.npdId));

  return [
    ...persistedEvents.map(mapPersistedEvent),
    ...derivePetregEvents(filteredLicences),
  ]
    .filter((event) => !event.entityNpdId || !event.entityType || licenceIds.has(event.entityNpdId))
    .sort((left, right) => (right.publishedAt?.getTime() ?? 0) - (left.publishedAt?.getTime() ?? 0))
    .slice(0, limit);
}
