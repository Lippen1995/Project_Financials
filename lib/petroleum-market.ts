import {
  PetroleumBbox,
  PetroleumEntityType,
  PetroleumLayerId,
  PetroleumMarketFilters,
  PetroleumMarketTab,
  PetroleumMetricView,
  PetroleumProductSeries,
  PetroleumTableMode,
  PetroleumTimeSeriesComparison,
  PetroleumTimeSeriesEntityType,
  PetroleumTimeSeriesGranularity,
  PetroleumTimeSeriesMeasure,
} from "@/lib/types";

export const DEFAULT_PETROLEUM_LAYERS: PetroleumLayerId[] = [
  "fields",
  "discoveries",
  "licences",
  "facilities",
  "tuf",
];

export const OPTIONAL_PETROLEUM_LAYERS: PetroleumLayerId[] = [
  "wellbores",
  "surveys",
  "regulatoryEvents",
  "gasscoEvents",
];

export const PETROLEUM_LAYER_LABELS: Record<PetroleumLayerId, string> = {
  fields: "Felt",
  discoveries: "Funn",
  licences: "Lisenser",
  facilities: "Innretninger",
  tuf: "TUF / hovedrørledninger",
  wellbores: "Brønner",
  surveys: "Survey",
  regulatoryEvents: "Havtil/Petreg",
  gasscoEvents: "Gassco",
};

export const PETROLEUM_ENTITY_TYPE_LABELS: Record<PetroleumEntityType, string> = {
  FIELD: "Felt",
  DISCOVERY: "Funn",
  LICENCE: "Lisens",
  FACILITY: "Innretning",
  TUF: "TUF",
  SURVEY: "Survey",
  WELLBORE: "Brønn",
};

export const PETROLEUM_TAB_LABELS: Record<PetroleumMarketTab, string> = {
  market: "Oversikt",
  exploration: "Leting & Funn",
  wells: "Brønner & Boring",
  infrastructure: "Infrastruktur",
  seismic: "Seismikk & Undersøkelser",
  seabed: "Havbunn & Nye Næringer",
  companies: "Selskaper & Rettigheter",
  events: "Hendelser & Regulering",
  concepts: "Begreper",
};

export const PETROLEUM_PRODUCT_LABELS: Record<PetroleumProductSeries, string> = {
  oil: "Olje",
  gas: "Gass",
  ngl: "NGL",
  condensate: "Kondensat",
  liquids: "Væsker",
  oe: "Oljeekvivalenter",
  producedWater: "Produsert vann",
};

export const PETROLEUM_VIEW_LABELS: Record<PetroleumMetricView, string> = {
  volume: "Volum",
  rate: "Rate",
};

export const PETROLEUM_COMPARISON_LABELS: Record<PetroleumTimeSeriesComparison, string> = {
  none: "Standard",
  yoy: "YoY",
  ytd: "YTD",
  forecast: "Forecast",
};

export const PETROLEUM_TABLE_MODE_LABELS: Record<PetroleumTableMode, string> = {
  fields: "Felt",
  licences: "Lisenser",
  operators: "Operatører",
};

export const PETROLEUM_TIME_SERIES_MEASURE_LABELS: Record<PetroleumTimeSeriesMeasure, string> = {
  oil: "Olje",
  gas: "Gass",
  condensate: "Kondensat",
  liquids: "Væsker",
  ngl: "NGL",
  oe: "OE",
  producedWater: "Produsert vann",
  investments: "Investeringer",
};

export const PETROLEUM_DEFAULT_TAB: PetroleumMarketTab = "market";
export const PETROLEUM_DEFAULT_PRODUCT: PetroleumProductSeries = "oe";
export const PETROLEUM_DEFAULT_VIEW: PetroleumMetricView = "volume";
export const PETROLEUM_DEFAULT_TABLE_MODE: PetroleumTableMode = "fields";
export const PETROLEUM_DEFAULT_SERIES_ENTITY_TYPE: PetroleumTimeSeriesEntityType = "area";
export const PETROLEUM_DEFAULT_GRANULARITY: PetroleumTimeSeriesGranularity = "year";
export const PETROLEUM_DEFAULT_COMPARISON: PetroleumTimeSeriesComparison = "none";
export const PETROLEUM_DEFAULT_SERIES_MEASURES: PetroleumTimeSeriesMeasure[] = [
  "oe",
  "investments",
];

export function parseArrayParam(value: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseNumberParam(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseBboxParam(value: string | null): PetroleumBbox | null {
  if (!value) {
    return null;
  }

  const parts = value
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));

  if (parts.length !== 4) {
    return null;
  }

  return [parts[0], parts[1], parts[2], parts[3]];
}

export function serializeBbox(bbox?: PetroleumBbox | null) {
  return bbox ? bbox.join(",") : undefined;
}

export function parsePetroleumFilters(searchParams: URLSearchParams): PetroleumMarketFilters {
  const page = parseNumberParam(searchParams.get("page"), 0);
  const size = parseNumberParam(searchParams.get("size"), 25);
  const tableMode = searchParams.get("tableMode");

  return {
    tab: (searchParams.get("tab") as PetroleumMarketTab | null) ?? PETROLEUM_DEFAULT_TAB,
    layers: parseArrayParam(searchParams.get("layers")) as PetroleumLayerId[],
    status: parseArrayParam(searchParams.get("status")),
    surveyStatuses: parseArrayParam(searchParams.get("surveyStatuses")),
    surveyCategories: parseArrayParam(searchParams.get("surveyCategories")),
    areas: parseArrayParam(searchParams.get("areas")),
    operatorIds: parseArrayParam(searchParams.get("operatorIds")),
    licenseeIds: parseArrayParam(searchParams.get("licenseeIds")),
    hcTypes: parseArrayParam(searchParams.get("hcTypes")),
    surveyYearFrom: searchParams.get("surveyYearFrom")
      ? parseNumberParam(searchParams.get("surveyYearFrom"), 0)
      : undefined,
    surveyYearTo: searchParams.get("surveyYearTo")
      ? parseNumberParam(searchParams.get("surveyYearTo"), 0)
      : undefined,
    bbox: parseBboxParam(searchParams.get("bbox")),
    query: searchParams.get("query")?.trim() || undefined,
    product:
      (searchParams.get("product") as PetroleumProductSeries | null) ?? PETROLEUM_DEFAULT_PRODUCT,
    view: (searchParams.get("view") as PetroleumMetricView | null) ?? PETROLEUM_DEFAULT_VIEW,
    comparison:
      (searchParams.get("comparison") as PetroleumTimeSeriesComparison | null) ??
      PETROLEUM_DEFAULT_COMPARISON,
    tableMode: tableMode ? (tableMode as PetroleumTableMode) : PETROLEUM_DEFAULT_TABLE_MODE,
    page,
    size,
    sort: searchParams.get("sort")?.trim() || undefined,
  };
}

export function buildPetroleumSearchParams(
  filters: PetroleumMarketFilters,
  extra?: Record<string, string | number | undefined | null>,
) {
  const params = new URLSearchParams();
  const values: Array<[string, string | number | undefined | null]> = [
    ["tab", filters.tab],
    ["layers", filters.layers?.join(",")],
    ["status", filters.status?.join(",")],
    ["surveyStatuses", filters.surveyStatuses?.join(",")],
    ["surveyCategories", filters.surveyCategories?.join(",")],
    ["areas", filters.areas?.join(",")],
    ["operatorIds", filters.operatorIds?.join(",")],
    ["licenseeIds", filters.licenseeIds?.join(",")],
    ["hcTypes", filters.hcTypes?.join(",")],
    ["surveyYearFrom", filters.surveyYearFrom],
    ["surveyYearTo", filters.surveyYearTo],
    ["bbox", serializeBbox(filters.bbox)],
    ["query", filters.query],
    ["product", filters.product],
    ["view", filters.view],
    ["comparison", filters.comparison],
    ["tableMode", filters.tableMode],
    ["page", filters.page],
    ["size", filters.size],
    ["sort", filters.sort],
  ];

  for (const [key, value] of [...values, ...Object.entries(extra ?? {})]) {
    if (value !== undefined && value !== null && `${value}`.trim() !== "") {
      params.set(key, `${value}`);
    }
  }

  return params;
}

export function isLayerSelected(filters: PetroleumMarketFilters, layerId: PetroleumLayerId) {
  const layers = filters.layers?.length ? filters.layers : DEFAULT_PETROLEUM_LAYERS;
  return layers.includes(layerId);
}

export function normalizeLayerSelection(layers?: PetroleumLayerId[]) {
  return layers?.length ? layers : DEFAULT_PETROLEUM_LAYERS;
}
