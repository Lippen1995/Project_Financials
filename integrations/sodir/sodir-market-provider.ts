import env from "@/lib/env";
import { fetchJson } from "@/integrations/http";
import { PetroleumEntityType } from "@/lib/types";
import { slugify } from "@/lib/utils";
import {
  PetroleumCompanyLinkSnapshot,
  PetroleumCoreSyncPayload,
  PetroleumInvestmentSnapshotRecord,
  PetroleumMetricsSyncPayload,
  PetroleumProductionPointSnapshot,
  PetroleumReserveSnapshotRecord,
} from "@/server/services/petroleum-market-types";

type ArcGisFeature<T> = {
  attributes: T;
  geometry?: {
    x?: number;
    y?: number;
    points?: number[][][];
    paths?: number[][][];
    rings?: number[][][];
  } | null;
};

type ArcGisResponse<T> = {
  features?: ArcGisFeature<T>[];
  exceededTransferLimit?: boolean;
};

type CompanyAttributes = {
  cmpNpdidCompany: number;
  cmpLongName: string;
  cmpOrgNumberBrReg?: string | null;
  cmpFactPageUrl?: string | null;
  cmpActiveOnNcsCurrent?: string | number | boolean | null;
  cmpActiveOnNcsFormer?: string | number | boolean | null;
  cmpLicenceOperCurrent?: string | number | boolean | null;
  cmpLicenceLicenseeCurrent?: string | number | boolean | null;
  cmpTufOperCurrent?: string | number | boolean | null;
  cmpTufPartnerCurrent?: string | number | boolean | null;
};

type FieldAttributes = {
  fldNpdidField: number;
  fldName: string;
  fldCurrentActivitySatus?: string | null;
  fldDiscoveryYear?: number | null;
  fldOwnerKind?: string | null;
  fldOwnerName?: string | null;
  cmpLongName?: string | null;
  cmpNpdidCompany?: number | null;
  fldMainSupplyBase?: string | null;
  fldHcType?: string | null;
  fldMainArea?: string | null;
  wlbName?: string | null;
  fldFactPageUrl?: string | null;
  fldFactMapUrl?: string | null;
};

type DiscoveryAttributes = {
  dscNpdidDiscovery: number;
  dscName: string;
  dscCurrentActivityStatus?: string | null;
  dscDiscoveryYear?: number | null;
  dscOwnerKind?: string | null;
  dscOwnerName?: string | null;
  cmpLongName?: string | null;
  cmpNpdidCompany?: number | null;
  dscHcType?: string | null;
  nmaName?: string | null;
  fldName?: string | null;
  fldNpdidField?: number | null;
  dscFactPageUrl?: string | null;
  dscFactMapUrl?: string | null;
};

type LicenceAttributes = {
  prlNpdidLicence: number;
  prlName: string;
  prlLicensingActivityName?: string | null;
  prlStatus?: string | null;
  prlActive?: string | boolean | null;
  prlStratigraphical?: string | null;
  prlPhaseCurrent?: string | null;
  prlMainArea?: string | null;
  cmpLongName?: string | null;
  cmpNpdidCompany?: number | null;
  prlDateGranted?: number | null;
  prlDateValidTo?: number | null;
  prlOriginalArea?: number | null;
  prlCurrentArea?: number | null;
  prlFactPageUrl?: string | null;
  prlFactMapUrl?: string | null;
};

type FacilityAttributes = {
  fclNpdidFacility: number;
  fclName: string;
  fclFixedOrMoveable?: string | null;
  fclKind?: string | null;
  fclPhase?: string | null;
  fclFunctions?: string | null;
  fclWaterDepth?: number | null;
  fclDesignLifetime?: number | null;
  fclStartupDate?: number | null;
  fclBelongsToName?: string | null;
  fclBelongsToKind?: string | null;
  fclCurrentOperatorName?: string | null;
  fclNpdidCurrentOperator?: number | null;
  fclFactPageUrl?: string | null;
  fclFactMapUrl?: string | null;
};

type PipelineAttributes = {
  pplNpdidPipeline: number;
  pplName: string;
  pplCurrentPhase?: string | null;
  pplMainGroupingName?: string | null;
  pplMedium?: string | null;
  pplBelongsToName?: string | null;
  pplNpdidBelongsTo?: number | null;
  cmpLongName?: string | null;
  cmpNpdidCompany?: number | null;
  fclNameFrom?: string | null;
  fclNameTo?: string | null;
  pplDimension?: number | null;
  pplWaterDepth?: number | null;
  pplFactPageUrl?: string | null;
  pplFactMapUrl?: string | null;
};

type SurveyAttributes = {
  seaNpdidSurvey: number;
  seaName: string;
  seaStatus?: string | null;
  seaCategory?: string | null;
  seaSurveyTypeMain?: string | null;
  seaSurveyTypePart?: string | null;
  seaGeographicalArea?: string | null;
  seaCompanyReported?: string | null;
  cmpNpdidCompany?: number | null;
  seaDateStarting?: number | null;
  seaDateFinalized?: number | null;
  seaPlanFromDate?: number | null;
  seaPlanToDate?: number | null;
  seaFactPageUrl?: string | null;
};

type FieldOperatorAttributes = {
  fldNpdidField: number;
  cmpNpdidCompany?: number | null;
  cmpLongName?: string | null;
  fldOperatorFrom?: number | null;
  fldOperatorTo?: number | null;
};

type FieldLicenseeAttributes = {
  fldNpdidField: number;
  cmpNpdidCompany?: number | null;
  cmpLongName?: string | null;
  fldCompanyShare?: number | null;
  fldSdfiShare?: number | null;
  fldLicenseeFrom?: number | null;
  fldLicenseeTo?: number | null;
  fldOwnerKind?: string | null;
  fldOwnerName?: string | null;
  fldOwnerFrom?: number | null;
  fldOwnerTo?: number | null;
  cmpFactPageUrl?: string | null;
};

type LicenceLicenseeAttributes = {
  prlNpdidLicence: number;
  cmpNpdidCompany?: number | null;
  cmpLongName?: string | null;
  prlLicenseeInterest?: number | null;
  prlLicenseeSdfi?: number | null;
  prlLicenseeDateValidFrom?: number | null;
  prlLicenseeDateValidTo?: number | null;
  cmpFactPageUrl?: string | null;
};

type LicenceTransferAttributes = {
  prlNpdidLicence: number;
  cmpNpdidCompany?: number | null;
  cmpLongName?: string | null;
  prlTransferDateValidFrom?: number | null;
  prlTransferDirection?: string | null;
  prlTransferKind?: string | null;
  prlTransferredInterest?: number | null;
  prlTransferSdfi?: number | null;
  cmpFactPageUrl?: string | null;
};

type PetregMessageAttributes = {
  prlNpdidLicence?: number | null;
  ptlMessageDocumentNo?: string | null;
  ptlMessage?: string | null;
  ptlMessageRemark?: string | null;
  ptlMessageKindDesc?: string | null;
  ptlMessageRegisteredDate?: number | null;
  tufNpdidTuf?: number | null;
  tufName?: string | null;
  ptlPetregLicenceID?: string | null;
  ptlMessageGUID?: string | null;
};

type ProfileAttributes = {
  prfPeriod: string;
  prfYear: number;
  prfMonth?: number | null;
  prfInformationCarrier: string;
  prfInformationCarrierKind: string;
  prfNpdidInformationCarrier: number;
  prfPrdOilNetMillSm3?: number | null;
  prfPrdGasNetBillSm3?: number | null;
  prfPrdNGLNetMillSm3?: number | null;
  prfPrdCondensateNetMillSm3?: number | null;
  prfPrdOeNetMillSm3?: number | null;
  prfPrdProducedWaterInFieldMillS?: number | null;
  prfInvestmentsMillNOK?: number | null;
};

type ReserveAttributes = {
  fldNpdidField: number;
  fldDateOffResEstDisplay?: number | null;
  fldRecoverableOil?: number | null;
  fldRecoverableGas?: number | null;
  fldRecoverableNGL?: number | null;
  fldRecoverableCondensate?: number | null;
  fldRecoverableOE?: number | null;
  fldRemainingOil?: number | null;
  fldRemainingGas?: number | null;
  fldRemainingNGL?: number | null;
  fldRemainingCondensate?: number | null;
  fldRemainingOE?: number | null;
};

type InvestmentAttributes = {
  fldNpdidField: number;
  fldName: string;
  fldInvestmentExpected?: number | null;
  fldInvExpFixYear?: number | null;
};

const PAGE_SIZE = 2000;
const DATA_SERVICE_BASE = `${env.sodirFactmapsBaseUrl}/DataService/Data/FeatureServer`;

function buildLayerQueryUrl(layerId: number, params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, `${value}`);
    }
  }

  return `${DATA_SERVICE_BASE}/${layerId}/query?${query.toString()}`;
}

async function queryLayer<T>(layerId: number, returnGeometry = false) {
  const results: ArcGisFeature<T>[] = [];
  let offset = 0;

  while (true) {
    const response = await fetchJson<ArcGisResponse<T>>(
      buildLayerQueryUrl(layerId, {
        where: "1=1",
        outFields: "*",
        f: "json",
        outSR: returnGeometry ? 4326 : undefined,
        returnGeometry: returnGeometry ? "true" : "false",
        resultOffset: offset,
        resultRecordCount: PAGE_SIZE,
        orderByFields: "OBJECTID ASC",
      }),
      undefined,
      120_000,
    );

    const features = response.features ?? [];
    results.push(...features);

    if (features.length < PAGE_SIZE && !response.exceededTransferLimit) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return results;
}

function toBoolean(value: string | number | boolean | null | undefined) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    return ["y", "yes", "true", "1"].includes(value.trim().toLowerCase());
  }

  return null;
}

function toDate(value: number | null | undefined) {
  return value === null || value === undefined ? null : new Date(value);
}

function toNullableNumber(value: unknown) {
  return typeof value === "number" && !Number.isNaN(value) ? value : null;
}

function toSourceId(prefix: string, id: number | string) {
  return `${prefix}:${id}`;
}

function toSlug(name: string, npdId: number) {
  return slugify(`${name}-${npdId}`);
}

function normalizeGeometry(geometry?: ArcGisFeature<unknown>["geometry"] | null) {
  if (!geometry) return null;
  if (typeof geometry.x === "number" && typeof geometry.y === "number") {
    return { type: "Point" as const, coordinates: [geometry.x, geometry.y] };
  }
  if (Array.isArray(geometry.paths) && geometry.paths.length > 0) {
    return geometry.paths.length === 1
      ? { type: "LineString" as const, coordinates: geometry.paths[0].map(([x, y]) => [x, y]) }
      : {
          type: "MultiLineString" as const,
          coordinates: geometry.paths.map((path) => path.map(([x, y]) => [x, y])),
        };
  }
  if (Array.isArray(geometry.rings) && geometry.rings.length > 0) {
    return {
      type: "Polygon" as const,
      coordinates: geometry.rings.map((ring) => ring.map(([x, y]) => [x, y])),
    };
  }
  if (Array.isArray(geometry.points) && geometry.points.length > 0) {
    return {
      type: "MultiLineString" as const,
      coordinates: geometry.points.map((path) => path.map(([x, y]) => [x, y])),
    };
  }

  return null;
}

function flattenCoordinates(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  if (value.length === 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    return [[value[0], value[1]]];
  }

  return value.flatMap((entry) => flattenCoordinates(entry));
}

function getBbox(geometry: ReturnType<typeof normalizeGeometry>) {
  if (!geometry) return null;
  const coordinates = flattenCoordinates(geometry.coordinates);
  if (coordinates.length === 0) return null;
  const xs = coordinates.map(([x]) => x);
  const ys = coordinates.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const;
}

function getCentroid(geometry: ReturnType<typeof normalizeGeometry>) {
  if (!geometry) return null;
  const coordinates = flattenCoordinates(geometry.coordinates);
  if (coordinates.length === 0) return null;
  const [sumX, sumY] = coordinates.reduce(
    (accumulator, [nextX, nextY]) => [accumulator[0] + nextX, accumulator[1] + nextY],
    [0, 0],
  );
  return [sumX / coordinates.length, sumY / coordinates.length] as const;
}

function dedupeById<T>(items: T[], getId: (item: T) => number) {
  const map = new Map<number, T>();
  for (const item of items) {
    map.set(getId(item), item);
  }
  return [...map.values()];
}

function buildCompanyLinkLookup(links: PetroleumCompanyLinkSnapshot[]) {
  return new Map(links.map((item) => [item.npdCompanyId, item]));
}

function mapCompanyLink(feature: ArcGisFeature<CompanyAttributes>, fetchedAt: Date, normalizedAt: Date) {
  const attributes = feature.attributes;

  return {
    npdCompanyId: attributes.cmpNpdidCompany,
    companyName: attributes.cmpLongName,
    orgNumber: attributes.cmpOrgNumberBrReg?.trim() || null,
    factPageUrl: attributes.cmpFactPageUrl ?? null,
    activeOnNcsCurrent: toBoolean(attributes.cmpActiveOnNcsCurrent),
    activeOnNcsFormer: toBoolean(attributes.cmpActiveOnNcsFormer),
    licenceOperatorCurrent: toBoolean(attributes.cmpLicenceOperCurrent),
    licenceLicenseeCurrent: toBoolean(attributes.cmpLicenceLicenseeCurrent),
    tufOperatorCurrent: toBoolean(attributes.cmpTufOperCurrent),
    tufPartnerCurrent: toBoolean(attributes.cmpTufPartnerCurrent),
    sourceSystem: "SODIR",
    sourceEntityType: "company",
    sourceId: toSourceId("company", attributes.cmpNpdidCompany),
    fetchedAt,
    normalizedAt,
    rawPayload: attributes,
  } satisfies PetroleumCompanyLinkSnapshot;
}

function mapProfileEntityType(kind: string): PetroleumEntityType | null {
  return kind.trim().toUpperCase() === "FIELD" ? "FIELD" : null;
}

export async function fetchSodirPetroleumCoreData(): Promise<PetroleumCoreSyncPayload> {
  const fetchedAt = new Date();
  const normalizedAt = new Date();

  const [
    companyFeatures,
    fieldFeatures,
    discoveryFeatures,
    licenceFeatures,
    facilityFeatures,
    pipelineFeatures,
    surveyFeatures,
    fieldOperatorFeatures,
    fieldLicenseeFeatures,
    licenceLicenseeFeatures,
    licenceTransferFeatures,
    petregMessageFeatures,
  ] = await Promise.all([
    queryLayer<CompanyAttributes>(1200),
    queryLayer<FieldAttributes>(7100, true),
    queryLayer<DiscoveryAttributes>(7000, true),
    queryLayer<LicenceAttributes>(3000, true),
    queryLayer<FacilityAttributes>(6000, true),
    queryLayer<PipelineAttributes>(6100, true),
    queryLayer<SurveyAttributes>(4000, true),
    queryLayer<FieldOperatorAttributes>(7110),
    queryLayer<FieldLicenseeAttributes>(7108),
    queryLayer<LicenceLicenseeAttributes>(3007),
    queryLayer<LicenceTransferAttributes>(3003),
    queryLayer<PetregMessageAttributes>(3402),
  ]);

  const companyLinks = dedupeById(
    companyFeatures.map((feature) => mapCompanyLink(feature, fetchedAt, normalizedAt)),
    (item) => item.npdCompanyId,
  );
  const companyLookup = buildCompanyLinkLookup(companyLinks);

  const fieldOperatorHistory = new Map<number, Array<Record<string, unknown>>>();
  for (const feature of fieldOperatorFeatures) {
    const attributes = feature.attributes;
    const companyLink = attributes.cmpNpdidCompany
      ? companyLookup.get(attributes.cmpNpdidCompany)
      : undefined;
    const next = fieldOperatorHistory.get(attributes.fldNpdidField) ?? [];

    next.push({
      companyName: attributes.cmpLongName ?? null,
      npdCompanyId: attributes.cmpNpdidCompany ?? null,
      orgNumber: companyLink?.orgNumber ?? null,
      companySlug: companyLink?.linkedCompanySlug ?? null,
      from: toDate(attributes.fldOperatorFrom)?.toISOString() ?? null,
      to: toDate(attributes.fldOperatorTo)?.toISOString() ?? null,
    });
    fieldOperatorHistory.set(attributes.fldNpdidField, next);
  }

  const fieldLicensees = new Map<number, Array<Record<string, unknown>>>();
  const fieldOwnerHistory = new Map<number, Array<Record<string, unknown>>>();
  for (const feature of fieldLicenseeFeatures) {
    const attributes = feature.attributes;
    const companyLink = attributes.cmpNpdidCompany
      ? companyLookup.get(attributes.cmpNpdidCompany)
      : undefined;

    const nextLicensees = fieldLicensees.get(attributes.fldNpdidField) ?? [];
    nextLicensees.push({
      companyName: attributes.cmpLongName ?? null,
      npdCompanyId: attributes.cmpNpdidCompany ?? null,
      orgNumber: companyLink?.orgNumber ?? null,
      companySlug: companyLink?.linkedCompanySlug ?? null,
      factPageUrl: attributes.cmpFactPageUrl ?? null,
      sharePercent: toNullableNumber(attributes.fldCompanyShare),
      sdfiSharePercent: toNullableNumber(attributes.fldSdfiShare),
      validFrom: toDate(attributes.fldLicenseeFrom)?.toISOString() ?? null,
      validTo: toDate(attributes.fldLicenseeTo)?.toISOString() ?? null,
    });
    fieldLicensees.set(attributes.fldNpdidField, nextLicensees);

    const nextOwners = fieldOwnerHistory.get(attributes.fldNpdidField) ?? [];
    nextOwners.push({
      ownerKind: attributes.fldOwnerKind ?? null,
      ownerName: attributes.fldOwnerName ?? null,
      from: toDate(attributes.fldOwnerFrom)?.toISOString() ?? null,
      to: toDate(attributes.fldOwnerTo)?.toISOString() ?? null,
    });
    fieldOwnerHistory.set(attributes.fldNpdidField, nextOwners);
  }

  const licenceLicensees = new Map<number, Array<Record<string, unknown>>>();
  for (const feature of licenceLicenseeFeatures) {
    const attributes = feature.attributes;
    const companyLink = attributes.cmpNpdidCompany
      ? companyLookup.get(attributes.cmpNpdidCompany)
      : undefined;
    const next = licenceLicensees.get(attributes.prlNpdidLicence) ?? [];

    next.push({
      companyName: attributes.cmpLongName ?? null,
      npdCompanyId: attributes.cmpNpdidCompany ?? null,
      orgNumber: companyLink?.orgNumber ?? null,
      companySlug: companyLink?.linkedCompanySlug ?? null,
      factPageUrl: attributes.cmpFactPageUrl ?? null,
      sharePercent: toNullableNumber(attributes.prlLicenseeInterest),
      sdfiSharePercent: toNullableNumber(attributes.prlLicenseeSdfi),
      validFrom: toDate(attributes.prlLicenseeDateValidFrom)?.toISOString() ?? null,
      validTo: toDate(attributes.prlLicenseeDateValidTo)?.toISOString() ?? null,
    });
    licenceLicensees.set(attributes.prlNpdidLicence, next);
  }

  const licenceTransfers = new Map<number, Array<Record<string, unknown>>>();
  for (const feature of licenceTransferFeatures) {
    const attributes = feature.attributes;
    const companyLink = attributes.cmpNpdidCompany
      ? companyLookup.get(attributes.cmpNpdidCompany)
      : undefined;
    const next = licenceTransfers.get(attributes.prlNpdidLicence) ?? [];

    next.push({
      companyName: attributes.cmpLongName ?? null,
      npdCompanyId: attributes.cmpNpdidCompany ?? null,
      orgNumber: companyLink?.orgNumber ?? null,
      companySlug: companyLink?.linkedCompanySlug ?? null,
      direction: attributes.prlTransferDirection ?? null,
      kind: attributes.prlTransferKind ?? null,
      transferredInterest: toNullableNumber(attributes.prlTransferredInterest),
      transferSdfi: toNullableNumber(attributes.prlTransferSdfi),
      validFrom: toDate(attributes.prlTransferDateValidFrom)?.toISOString() ?? null,
      factPageUrl: attributes.cmpFactPageUrl ?? null,
    });
    licenceTransfers.set(attributes.prlNpdidLicence, next);
  }

  const licenceMessages = new Map<number, Array<Record<string, unknown>>>();
  for (const feature of petregMessageFeatures) {
    const attributes = feature.attributes;
    if (!attributes.prlNpdidLicence) continue;
    const next = licenceMessages.get(attributes.prlNpdidLicence) ?? [];

    next.push({
      documentNumber: attributes.ptlMessageDocumentNo ?? null,
      message: attributes.ptlMessage ?? null,
      remark: attributes.ptlMessageRemark ?? null,
      messageKind: attributes.ptlMessageKindDesc ?? null,
      registeredAt: toDate(attributes.ptlMessageRegisteredDate)?.toISOString() ?? null,
      tufName: attributes.tufName ?? null,
      tufNpdId: attributes.tufNpdidTuf ?? null,
      petregLicenceId: attributes.ptlPetregLicenceID ?? null,
      messageGuid: attributes.ptlMessageGUID ?? null,
    });
    licenceMessages.set(attributes.prlNpdidLicence, next);
  }

  const fields = dedupeById(
    fieldFeatures.map((feature) => {
      const attributes = feature.attributes;
      const geometry = normalizeGeometry(feature.geometry);
      const companyLink = attributes.cmpNpdidCompany
        ? companyLookup.get(attributes.cmpNpdidCompany)
        : undefined;

      return {
        npdId: attributes.fldNpdidField,
        slug: toSlug(attributes.fldName, attributes.fldNpdidField),
        name: attributes.fldName,
        activityStatus: attributes.fldCurrentActivitySatus ?? null,
        discoveryYear: attributes.fldDiscoveryYear ?? null,
        ownerKind: attributes.fldOwnerKind ?? null,
        ownerName: attributes.fldOwnerName ?? null,
        operatorCompanyName: attributes.cmpLongName ?? null,
        operatorNpdCompanyId: attributes.cmpNpdidCompany ?? null,
        operatorOrgNumber: companyLink?.orgNumber ?? null,
        operatorCompanySlug: companyLink?.linkedCompanySlug ?? null,
        mainSupplyBase: attributes.fldMainSupplyBase ?? null,
        hydrocarbonType: attributes.fldHcType ?? null,
        mainArea: attributes.fldMainArea ?? null,
        discoveryWellboreName: attributes.wlbName ?? null,
        factPageUrl: attributes.fldFactPageUrl ?? null,
        factMapUrl: attributes.fldFactMapUrl ?? null,
        geometry,
        bbox: getBbox(geometry),
        centroid: getCentroid(geometry),
        operatorHistory: fieldOperatorHistory.get(attributes.fldNpdidField) ?? [],
        licensees: fieldLicensees.get(attributes.fldNpdidField) ?? [],
        ownerHistory: fieldOwnerHistory.get(attributes.fldNpdidField) ?? [],
        sourceSystem: "SODIR",
        sourceEntityType: "field",
        sourceId: toSourceId("field", attributes.fldNpdidField),
        fetchedAt,
        normalizedAt,
        rawPayload: attributes,
      };
    }),
    (item) => item.npdId,
  );

  const discoveries = dedupeById(
    discoveryFeatures.map((feature) => {
      const attributes = feature.attributes;
      const geometry = normalizeGeometry(feature.geometry);
      const companyLink = attributes.cmpNpdidCompany
        ? companyLookup.get(attributes.cmpNpdidCompany)
        : undefined;

      return {
        npdId: attributes.dscNpdidDiscovery,
        slug: toSlug(attributes.dscName, attributes.dscNpdidDiscovery),
        name: attributes.dscName,
        activityStatus: attributes.dscCurrentActivityStatus ?? null,
        discoveryYear: attributes.dscDiscoveryYear ?? null,
        ownerKind: attributes.dscOwnerKind ?? null,
        ownerName: attributes.dscOwnerName ?? null,
        operatorCompanyName: attributes.cmpLongName ?? null,
        operatorNpdCompanyId: attributes.cmpNpdidCompany ?? null,
        operatorOrgNumber: companyLink?.orgNumber ?? null,
        operatorCompanySlug: companyLink?.linkedCompanySlug ?? null,
        hydrocarbonType: attributes.dscHcType ?? null,
        areaName: attributes.nmaName ?? null,
        relatedFieldName: attributes.fldName ?? null,
        relatedFieldNpdId: attributes.fldNpdidField ?? null,
        factPageUrl: attributes.dscFactPageUrl ?? null,
        factMapUrl: attributes.dscFactMapUrl ?? null,
        geometry,
        bbox: getBbox(geometry),
        centroid: getCentroid(geometry),
        operatorHistory: [],
        sourceSystem: "SODIR",
        sourceEntityType: "discovery",
        sourceId: toSourceId("discovery", attributes.dscNpdidDiscovery),
        fetchedAt,
        normalizedAt,
        rawPayload: attributes,
      };
    }),
    (item) => item.npdId,
  );

  const licences = dedupeById(
    licenceFeatures.map((feature) => {
      const attributes = feature.attributes;
      const geometry = normalizeGeometry(feature.geometry);
      const companyLink = attributes.cmpNpdidCompany
        ? companyLookup.get(attributes.cmpNpdidCompany)
        : undefined;

      return {
        npdId: attributes.prlNpdidLicence,
        slug: toSlug(attributes.prlName, attributes.prlNpdidLicence),
        name: attributes.prlName,
        licensingActivityName: attributes.prlLicensingActivityName ?? null,
        status: attributes.prlStatus ?? null,
        active: toBoolean(attributes.prlActive),
        stratigraphical: attributes.prlStratigraphical ?? null,
        currentPhase: attributes.prlPhaseCurrent ?? null,
        mainArea: attributes.prlMainArea ?? null,
        operatorCompanyName: attributes.cmpLongName ?? null,
        operatorNpdCompanyId: attributes.cmpNpdidCompany ?? null,
        operatorOrgNumber: companyLink?.orgNumber ?? null,
        operatorCompanySlug: companyLink?.linkedCompanySlug ?? null,
        grantedAt: toDate(attributes.prlDateGranted),
        validTo: toDate(attributes.prlDateValidTo),
        originalAreaSqKm: toNullableNumber(attributes.prlOriginalArea),
        currentAreaSqKm: toNullableNumber(attributes.prlCurrentArea),
        factPageUrl: attributes.prlFactPageUrl ?? null,
        factMapUrl: attributes.prlFactMapUrl ?? null,
        geometry,
        bbox: getBbox(geometry),
        centroid: getCentroid(geometry),
        licensees: licenceLicensees.get(attributes.prlNpdidLicence) ?? [],
        transfers: licenceTransfers.get(attributes.prlNpdidLicence) ?? [],
        registerMessages: licenceMessages.get(attributes.prlNpdidLicence) ?? [],
        sourceSystem: "SODIR",
        sourceEntityType: "licence",
        sourceId: toSourceId("licence", attributes.prlNpdidLicence),
        fetchedAt,
        normalizedAt,
        rawPayload: attributes,
      };
    }),
    (item) => item.npdId,
  );

  const facilities = dedupeById(
    facilityFeatures.map((feature) => {
      const attributes = feature.attributes;
      const geometry = normalizeGeometry(feature.geometry);
      const companyLink = attributes.fclNpdidCurrentOperator
        ? companyLookup.get(attributes.fclNpdidCurrentOperator)
        : undefined;

      return {
        npdId: attributes.fclNpdidFacility,
        slug: toSlug(attributes.fclName, attributes.fclNpdidFacility),
        name: attributes.fclName,
        fixedOrMoveable: attributes.fclFixedOrMoveable ?? null,
        kind: attributes.fclKind ?? null,
        phase: attributes.fclPhase ?? null,
        functions: attributes.fclFunctions ?? null,
        waterDepth: toNullableNumber(attributes.fclWaterDepth),
        designLifetime: attributes.fclDesignLifetime ?? null,
        startupDate: toDate(attributes.fclStartupDate),
        belongsToName: attributes.fclBelongsToName ?? null,
        belongsToKind: attributes.fclBelongsToKind ?? null,
        currentOperatorName: attributes.fclCurrentOperatorName ?? null,
        currentOperatorNpdId: attributes.fclNpdidCurrentOperator ?? null,
        currentOperatorOrgNumber: companyLink?.orgNumber ?? null,
        currentOperatorSlug: companyLink?.linkedCompanySlug ?? null,
        factPageUrl: attributes.fclFactPageUrl ?? null,
        factMapUrl: attributes.fclFactMapUrl ?? null,
        geometry,
        bbox: getBbox(geometry),
        centroid: getCentroid(geometry),
        sourceSystem: "SODIR",
        sourceEntityType: "facility",
        sourceId: toSourceId("facility", attributes.fclNpdidFacility),
        fetchedAt,
        normalizedAt,
        rawPayload: attributes,
      };
    }),
    (item) => item.npdId,
  );

  const tufs = dedupeById(
    pipelineFeatures.map((feature) => {
      const attributes = feature.attributes;
      const geometry = normalizeGeometry(feature.geometry);
      const companyLink = attributes.cmpNpdidCompany
        ? companyLookup.get(attributes.cmpNpdidCompany)
        : undefined;

      return {
        npdId: attributes.pplNpdidPipeline,
        slug: toSlug(attributes.pplName, attributes.pplNpdidPipeline),
        name: attributes.pplName,
        currentPhase: attributes.pplCurrentPhase ?? null,
        mainGroupingName: attributes.pplMainGroupingName ?? null,
        medium: attributes.pplMedium ?? null,
        belongsToName: attributes.pplBelongsToName ?? null,
        belongsToNpdId: attributes.pplNpdidBelongsTo ?? null,
        operatorCompanyName: attributes.cmpLongName ?? null,
        operatorNpdCompanyId: attributes.cmpNpdidCompany ?? null,
        operatorOrgNumber: companyLink?.orgNumber ?? null,
        operatorCompanySlug: companyLink?.linkedCompanySlug ?? null,
        fromFacilityName: attributes.fclNameFrom ?? null,
        toFacilityName: attributes.fclNameTo ?? null,
        dimensionInch: toNullableNumber(attributes.pplDimension),
        waterDepth: toNullableNumber(attributes.pplWaterDepth),
        factPageUrl: attributes.pplFactPageUrl ?? null,
        factMapUrl: attributes.pplFactMapUrl ?? null,
        geometry,
        bbox: getBbox(geometry),
        centroid: getCentroid(geometry),
        sourceSystem: "SODIR",
        sourceEntityType: "tuf",
        sourceId: toSourceId("tuf", attributes.pplNpdidPipeline),
        fetchedAt,
        normalizedAt,
        rawPayload: attributes,
      };
    }),
    (item) => item.npdId,
  );

  const surveys = dedupeById(
    surveyFeatures.map((feature) => {
      const attributes = feature.attributes;
      const geometry = normalizeGeometry(feature.geometry);

      return {
        npdId: attributes.seaNpdidSurvey,
        slug: toSlug(attributes.seaName, attributes.seaNpdidSurvey),
        name: attributes.seaName,
        status: attributes.seaStatus ?? null,
        category: attributes.seaCategory ?? null,
        mainType: attributes.seaSurveyTypeMain ?? null,
        subType: attributes.seaSurveyTypePart ?? null,
        geographicalArea: attributes.seaGeographicalArea ?? null,
        companyName: attributes.seaCompanyReported ?? null,
        companyNpdId: attributes.cmpNpdidCompany ?? null,
        startedAt: toDate(attributes.seaDateStarting),
        finalizedAt: toDate(attributes.seaDateFinalized),
        plannedFromDate: toDate(attributes.seaPlanFromDate),
        plannedToDate: toDate(attributes.seaPlanToDate),
        factPageUrl: attributes.seaFactPageUrl ?? null,
        geometry,
        bbox: getBbox(geometry),
        centroid: getCentroid(geometry),
        sourceSystem: "SODIR",
        sourceEntityType: "survey",
        sourceId: toSourceId("survey", attributes.seaNpdidSurvey),
        fetchedAt,
        normalizedAt,
        rawPayload: attributes,
      };
    }),
    (item) => item.npdId,
  );

  return {
    companyLinks,
    fields,
    discoveries,
    licences,
    facilities,
    tufs,
    surveys,
  };
}

export async function fetchSodirPetroleumMetricsData(): Promise<PetroleumMetricsSyncPayload> {
  const fetchedAt = new Date();
  const normalizedAt = new Date();
  const [profileFeatures, reserveFeatures, investmentFeatures] = await Promise.all([
    queryLayer<ProfileAttributes>(7300),
    queryLayer<ReserveAttributes>(7113),
    queryLayer<InvestmentAttributes>(7107),
  ]);

  const productionPoints: PetroleumProductionPointSnapshot[] = [];
  for (const feature of profileFeatures) {
    const attributes = feature.attributes;
    const entityType = mapProfileEntityType(attributes.prfInformationCarrierKind);
    if (!entityType) continue;

    productionPoints.push({
      entityType,
      entityNpdId: attributes.prfNpdidInformationCarrier,
      entityName: attributes.prfInformationCarrier,
      year: attributes.prfYear,
      month: attributes.prfMonth ?? null,
      period: attributes.prfPeriod ?? null,
      oilNetMillSm3: toNullableNumber(attributes.prfPrdOilNetMillSm3),
      gasNetBillSm3: toNullableNumber(attributes.prfPrdGasNetBillSm3),
      nglNetMillSm3: toNullableNumber(attributes.prfPrdNGLNetMillSm3),
      condensateNetMillSm3: toNullableNumber(attributes.prfPrdCondensateNetMillSm3),
      oeNetMillSm3: toNullableNumber(attributes.prfPrdOeNetMillSm3),
      producedWaterMillSm3: toNullableNumber(attributes.prfPrdProducedWaterInFieldMillS),
      investmentsMillNok: toNullableNumber(attributes.prfInvestmentsMillNOK),
      sourceSystem: "SODIR",
      sourceEntityType: "profiles",
      sourceId: toSourceId(
        "profiles",
        `${attributes.prfNpdidInformationCarrier}:${attributes.prfPeriod}:${attributes.prfYear}:${attributes.prfMonth ?? 0}`,
      ),
      fetchedAt,
      normalizedAt,
      rawPayload: attributes,
    });
  }

  const reserveSnapshots: PetroleumReserveSnapshotRecord[] = reserveFeatures.map((feature) => ({
    entityType: "FIELD",
    entityNpdId: feature.attributes.fldNpdidField,
    entityName: `${feature.attributes.fldNpdidField}`,
    updatedAtSource: toDate(feature.attributes.fldDateOffResEstDisplay),
    recoverableOil: toNullableNumber(feature.attributes.fldRecoverableOil),
    recoverableGas: toNullableNumber(feature.attributes.fldRecoverableGas),
    recoverableNgl: toNullableNumber(feature.attributes.fldRecoverableNGL),
    recoverableCondensate: toNullableNumber(feature.attributes.fldRecoverableCondensate),
    recoverableOe: toNullableNumber(feature.attributes.fldRecoverableOE),
    remainingOil: toNullableNumber(feature.attributes.fldRemainingOil),
    remainingGas: toNullableNumber(feature.attributes.fldRemainingGas),
    remainingNgl: toNullableNumber(feature.attributes.fldRemainingNGL),
    remainingCondensate: toNullableNumber(feature.attributes.fldRemainingCondensate),
    remainingOe: toNullableNumber(feature.attributes.fldRemainingOE),
    sourceSystem: "SODIR",
    sourceEntityType: "field_reserves",
    sourceId: toSourceId("field_reserves", feature.attributes.fldNpdidField),
    fetchedAt,
    normalizedAt,
    rawPayload: feature.attributes,
  }));

  const investmentSnapshots: PetroleumInvestmentSnapshotRecord[] = investmentFeatures.map((feature) => ({
    entityType: "FIELD",
    entityNpdId: feature.attributes.fldNpdidField,
    entityName: feature.attributes.fldName,
    expectedFutureInvestmentMillNok: toNullableNumber(feature.attributes.fldInvestmentExpected),
    fixedYear: feature.attributes.fldInvExpFixYear ?? null,
    sourceSystem: "SODIR",
    sourceEntityType: "field_investment_expected",
    sourceId: toSourceId("field_investment_expected", feature.attributes.fldNpdidField),
    fetchedAt,
    normalizedAt,
    rawPayload: feature.attributes,
  }));

  return {
    productionPoints,
    reserveSnapshots,
    investmentSnapshots,
  };
}
