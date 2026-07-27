import { z } from "zod";

import {
  PetroleumBbox,
  PetroleumMapDetailMode,
  PetroleumMapMode,
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
  "tuf",
];

export const OPTIONAL_PETROLEUM_LAYERS: PetroleumLayerId[] = [
  "facilities",
  "subsea",
  "terminals",
  "wellbores",
  "surveys",
  "regulatoryEvents",
  "gasscoEvents",
];

export const ALL_PETROLEUM_LAYERS: PetroleumLayerId[] = [
  ...DEFAULT_PETROLEUM_LAYERS,
  ...OPTIONAL_PETROLEUM_LAYERS,
];

export const PETROLEUM_LAYER_LABELS: Record<PetroleumLayerId, string> = {
  fields: "Felt",
  discoveries: "Funn",
  licences: "Lisenser",
  facilities: "Plattformer / FPSO",
  subsea: "Subsea-installasjoner",
  terminals: "Landanlegg / terminaler",
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

export const PETROLEUM_MAP_MODE_LABELS: Record<PetroleumMapMode, string> = {
  production: "Production",
  reserves: "Reserves",
  development: "Pipeline / Development",
  infrastructure: "Infrastructure",
  company: "Company exposure",
};

export const PETROLEUM_MAP_DETAIL_LABELS: Record<PetroleumMapDetailMode, string> = {
  overview: "Overview",
  detail: "Detail",
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
export const PETROLEUM_DEFAULT_MAP_MODE: PetroleumMapMode = "production";
export const PETROLEUM_DEFAULT_MAP_DETAIL_MODE: PetroleumMapDetailMode = "overview";
export const PETROLEUM_DEFAULT_EVENT_WINDOW_DAYS = 90;
export const PETROLEUM_DEFAULT_TABLE_MODE: PetroleumTableMode = "fields";
export const PETROLEUM_DEFAULT_SERIES_ENTITY_TYPE: PetroleumTimeSeriesEntityType = "area";
export const PETROLEUM_DEFAULT_GRANULARITY: PetroleumTimeSeriesGranularity = "year";
export const PETROLEUM_DEFAULT_COMPARISON: PetroleumTimeSeriesComparison = "none";
export const PETROLEUM_DEFAULT_SERIES_MEASURES: PetroleumTimeSeriesMeasure[] = [
  "oe",
  "investments",
];

const optionalQueryValue = (value: unknown) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return value;
};

const optionalStringSchema = (maxLength: number) =>
  z.preprocess(optionalQueryValue, z.string().max(maxLength).optional());

const csvSchema = <Item extends z.ZodTypeAny>(itemSchema: Item) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim()
        ? value.split(",").map((entry) => entry.trim())
        : [],
    z.array(itemSchema).max(50),
  );

const optionalIntegerSchema = (minimum: number, maximum: number) =>
  z.preprocess(
    optionalQueryValue,
    z.coerce.number().int().min(minimum).max(maximum).optional(),
  );

const optionalNumberSchema = (minimum: number, maximum: number) =>
  z.preprocess(
    optionalQueryValue,
    z.coerce.number().finite().min(minimum).max(maximum).optional(),
  );

const bboxSchema = z.preprocess(
  optionalQueryValue,
  z
    .string()
    .transform((value) => value.split(",").map((entry) => Number(entry.trim())))
    .pipe(
      z
        .tuple([
          z.number().finite().min(-180).max(180),
          z.number().finite().min(-90).max(90),
          z.number().finite().min(-180).max(180),
          z.number().finite().min(-90).max(90),
        ])
        .refine(([west, south, east, north]) => west < east && south < north),
    )
    .optional(),
);

const petroleumFilterValuesSchema = z
  .object({
    tab: z
      .enum([
        "market",
        "exploration",
        "wells",
        "infrastructure",
        "seismic",
        "seabed",
        "companies",
        "events",
        "concepts",
      ])
      .default(PETROLEUM_DEFAULT_TAB),
    layers: csvSchema(z.enum(ALL_PETROLEUM_LAYERS as [PetroleumLayerId, ...PetroleumLayerId[]])),
    mapMode: z
      .enum(["production", "reserves", "development", "infrastructure", "company"])
      .default(PETROLEUM_DEFAULT_MAP_MODE),
    mapDetailMode: z
      .enum(["overview", "detail"])
      .default(PETROLEUM_DEFAULT_MAP_DETAIL_MODE),
    status: csvSchema(z.string().min(1).max(100)),
    surveyStatuses: csvSchema(z.string().min(1).max(100)),
    surveyCategories: csvSchema(z.string().min(1).max(100)),
    areas: csvSchema(z.string().min(1).max(100)),
    operatorIds: csvSchema(z.string().min(1).max(128)),
    licenseeIds: csvSchema(z.string().min(1).max(128)),
    hcTypes: csvSchema(z.string().min(1).max(100)),
    surveyYearFrom: optionalIntegerSchema(1800, 2100),
    surveyYearTo: optionalIntegerSchema(1800, 2100),
    eventWindowDays: z.preprocess(
      optionalQueryValue,
      z.coerce
        .number()
        .int()
        .min(1)
        .max(3650)
        .default(PETROLEUM_DEFAULT_EVENT_WINDOW_DAYS),
    ),
    mapZoom: optionalNumberSchema(0, 24),
    entity: optionalStringSchema(256),
    bbox: bboxSchema,
    query: optionalStringSchema(200),
    product: z
      .enum(["oil", "gas", "ngl", "condensate", "liquids", "oe", "producedWater"])
      .default(PETROLEUM_DEFAULT_PRODUCT),
    view: z.enum(["volume", "rate"]).default(PETROLEUM_DEFAULT_VIEW),
    comparison: z
      .enum(["none", "yoy", "ytd", "forecast"])
      .default(PETROLEUM_DEFAULT_COMPARISON),
    tableMode: z
      .enum(["fields", "licences", "operators"])
      .default(PETROLEUM_DEFAULT_TABLE_MODE),
    page: z.preprocess(
      optionalQueryValue,
      z.coerce.number().int().min(0).max(100_000).default(0),
    ),
    size: z.preprocess(
      optionalQueryValue,
      z.coerce.number().int().min(1).max(200).default(25),
    ),
    sort: optionalStringSchema(128),
  })
  .strict()
  .refine(
    ({ surveyYearFrom, surveyYearTo }) =>
      surveyYearFrom === undefined ||
      surveyYearTo === undefined ||
      surveyYearFrom <= surveyYearTo,
    {
      message: "surveyYearFrom must be less than or equal to surveyYearTo",
      path: ["surveyYearTo"],
    },
  )
  .transform(({ entity, ...values }): PetroleumMarketFilters => ({
    ...values,
    selectedEntity: entity,
  }));

function petroleumFilterInput(searchParams: URLSearchParams) {
  return {
    tab: searchParams.get("tab") ?? undefined,
    layers: searchParams.get("layers") ?? undefined,
    mapMode: searchParams.get("mapMode") ?? undefined,
    mapDetailMode: searchParams.get("mapDetailMode") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    surveyStatuses: searchParams.get("surveyStatuses") ?? undefined,
    surveyCategories: searchParams.get("surveyCategories") ?? undefined,
    areas: searchParams.get("areas") ?? undefined,
    operatorIds: searchParams.get("operatorIds") ?? undefined,
    licenseeIds: searchParams.get("licenseeIds") ?? undefined,
    hcTypes: searchParams.get("hcTypes") ?? undefined,
    surveyYearFrom: searchParams.get("surveyYearFrom") ?? undefined,
    surveyYearTo: searchParams.get("surveyYearTo") ?? undefined,
    eventWindowDays: searchParams.get("eventWindowDays") ?? undefined,
    mapZoom: searchParams.get("mapZoom") ?? undefined,
    entity: searchParams.get("entity") ?? undefined,
    bbox: searchParams.get("bbox") ?? undefined,
    query: searchParams.get("query") ?? undefined,
    product: searchParams.get("product") ?? undefined,
    view: searchParams.get("view") ?? undefined,
    comparison: searchParams.get("comparison") ?? undefined,
    tableMode: searchParams.get("tableMode") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    size: searchParams.get("size") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
  };
}

export const queryPetroleumFiltersSchema = z
  .custom<URLSearchParams>((value) => value instanceof URLSearchParams)
  .transform((searchParams, ctx) => {
    const parsed = petroleumFilterValuesSchema.safeParse(
      petroleumFilterInput(searchParams),
    );
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue(issue);
      }
      return z.NEVER;
    }
    return parsed.data;
  });

const petroleumTimeseriesValuesSchema = z
  .object({
    entityIds: csvSchema(z.string().min(1).max(128)),
    entityType: z
      .enum(["field", "operator", "area"])
      .default(PETROLEUM_DEFAULT_SERIES_ENTITY_TYPE),
    granularity: z
      .enum(["month", "year"])
      .default(PETROLEUM_DEFAULT_GRANULARITY),
    measures: csvSchema(
      z.enum([
        "oil",
        "gas",
        "condensate",
        "ngl",
        "liquids",
        "oe",
        "producedWater",
        "investments",
      ]),
    ).transform((values) =>
      values.length > 0 ? values : PETROLEUM_DEFAULT_SERIES_MEASURES,
    ),
    yearFrom: optionalIntegerSchema(1800, 2100),
    yearTo: optionalIntegerSchema(1800, 2100),
  })
  .strict()
  .refine(
    ({ yearFrom, yearTo }) =>
      yearFrom === undefined || yearTo === undefined || yearFrom <= yearTo,
    {
      message: "yearFrom must be less than or equal to yearTo",
      path: ["yearTo"],
    },
  );

export const queryPetroleumEventsSchema = z
  .custom<URLSearchParams>((value) => value instanceof URLSearchParams)
  .transform((searchParams, ctx) => {
    const filters = queryPetroleumFiltersSchema.safeParse(searchParams);
    const limit = z.coerce.number().int().min(1).max(500).safeParse(
      searchParams.get("limit") ?? "100",
    );
    if (!filters.success || !limit.success) {
      for (const issue of [
        ...(filters.success ? [] : filters.error.issues),
        ...(limit.success ? [] : limit.error.issues),
      ]) {
        ctx.addIssue(issue);
      }
      return z.NEVER;
    }
    return { filters: filters.data, limit: limit.data };
  });

export const queryPetroleumTimeseriesSchema = z
  .custom<URLSearchParams>((value) => value instanceof URLSearchParams)
  .transform((searchParams, ctx) => {
    const filters = queryPetroleumFiltersSchema.safeParse(searchParams);
    const values = petroleumTimeseriesValuesSchema.safeParse({
      entityIds: searchParams.get("entityIds") ?? undefined,
      entityType: searchParams.get("entityType") ?? undefined,
      granularity: searchParams.get("granularity") ?? undefined,
      measures: searchParams.get("measures") ?? undefined,
      yearFrom: searchParams.get("yearFrom") ?? undefined,
      yearTo: searchParams.get("yearTo") ?? undefined,
    });
    if (!filters.success || !values.success) {
      for (const issue of [
        ...(filters.success ? [] : filters.error.issues),
        ...(values.success ? [] : values.error.issues),
      ]) {
        ctx.addIssue(issue);
      }
      return z.NEVER;
    }
    return {
      filters: filters.data,
      ...values.data,
      product: filters.data.product ?? PETROLEUM_DEFAULT_PRODUCT,
      view: filters.data.view ?? PETROLEUM_DEFAULT_VIEW,
      comparison: filters.data.comparison ?? PETROLEUM_DEFAULT_COMPARISON,
    };
  });

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
  const parsed = queryPetroleumFiltersSchema.safeParse(searchParams);
  if (parsed.success) {
    return parsed.data;
  }
  return petroleumFilterValuesSchema.parse(
    petroleumFilterInput(new URLSearchParams()),
  );
}

export function buildPetroleumSearchParams(
  filters: PetroleumMarketFilters,
  extra?: Record<string, string | number | undefined | null>,
) {
  const params = new URLSearchParams();
  const values: Array<[string, string | number | undefined | null]> = [
    ["tab", filters.tab],
    ["layers", filters.layers?.join(",")],
    ["mapMode", filters.mapMode],
    ["mapDetailMode", filters.mapDetailMode],
    ["status", filters.status?.join(",")],
    ["surveyStatuses", filters.surveyStatuses?.join(",")],
    ["surveyCategories", filters.surveyCategories?.join(",")],
    ["areas", filters.areas?.join(",")],
    ["operatorIds", filters.operatorIds?.join(",")],
    ["licenseeIds", filters.licenseeIds?.join(",")],
    ["hcTypes", filters.hcTypes?.join(",")],
    ["surveyYearFrom", filters.surveyYearFrom],
    ["surveyYearTo", filters.surveyYearTo],
    ["eventWindowDays", filters.eventWindowDays],
    ["mapZoom", filters.mapZoom],
    ["entity", filters.selectedEntity],
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

export function getDefaultLayersForMapMode(mapMode: PetroleumMapMode): PetroleumLayerId[] {
  switch (mapMode) {
    case "reserves":
      return ["fields", "discoveries", "licences", "tuf"];
    case "development":
      return ["discoveries", "fields", "licences", "tuf"];
    case "infrastructure":
      return ["fields", "licences", "facilities", "subsea", "terminals", "tuf"];
    case "company":
      return ["fields", "discoveries", "licences", "tuf"];
    case "production":
    default:
      return ["fields", "discoveries", "licences", "tuf"];
  }
}
