import env from "@/lib/env";
import { fetchJson } from "@/integrations/http";

export type MarketSeriesSyncPayload = {
  series: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
  availabilityMessage?: string | null;
};

type EiaSeriesResponse = {
  response?: {
    data?: Array<{ period?: string; value?: number | string | null }>;
  };
};

const SERIES_CONFIG = [
  {
    slug: "brent-front-month",
    name: "Brent front month",
    category: "PRICE",
    region: "GLOBAL",
    product: "oil",
    unit: "USD/bbl",
    frequency: "daily",
    sourceId: "petroleum/pri/spt/data/?frequency=daily&data[0]=value&facets[series][]=RBRTE",
  },
  {
    slug: "wti-front-month",
    name: "WTI front month",
    category: "PRICE",
    region: "US",
    product: "oil",
    unit: "USD/bbl",
    frequency: "daily",
    sourceId: "petroleum/pri/spt/data/?frequency=daily&data[0]=value&facets[series][]=RWTC",
  },
  {
    slug: "henry-hub-spot",
    name: "Henry Hub spot",
    category: "PRICE",
    region: "US",
    product: "gas",
    unit: "USD/MMBtu",
    frequency: "daily",
    sourceId: "natural-gas/pri/fut/data/?frequency=daily&data[0]=value&facets[series][]=RNGWHHD",
  },
] as const;

function parseObservationDate(period: string) {
  const date = new Date(period);
  if (!Number.isNaN(date.getTime())) return date;
  if (/^\d{4}-\d{2}$/.test(period)) return new Date(`${period}-01T00:00:00.000Z`);
  if (/^\d{4}$/.test(period)) return new Date(`${period}-01-01T00:00:00.000Z`);
  return null;
}

export async function fetchEiaPetroleumMarketSeries(): Promise<MarketSeriesSyncPayload> {
  if (!env.eiaApiKey) {
    return {
      series: [],
      observations: [],
      availabilityMessage: "EIA_API_KEY mangler; EIA markedsserier er deaktivert.",
    };
  }

  const fetchedAt = new Date();
  const normalizedAt = new Date();
  const series: Array<Record<string, unknown>> = [];
  const observations: Array<Record<string, unknown>> = [];

  for (const config of SERIES_CONFIG) {
    const url = `${env.eiaBaseUrl}/${config.sourceId}&api_key=${encodeURIComponent(env.eiaApiKey)}&sort[0][column]=period&sort[0][direction]=asc`;
    const response = await fetchJson<EiaSeriesResponse>(url, undefined, 15_000);
    const points = response.response?.data ?? [];

    series.push({
      slug: config.slug,
      name: config.name,
      category: config.category,
      region: config.region,
      product: config.product,
      unit: config.unit,
      frequency: config.frequency,
      sourceSystem: "EIA",
      sourceEntityType: "MARKET_SERIES",
      sourceId: config.sourceId,
      fetchedAt,
      normalizedAt,
      rawPayload: response,
    });

    for (const point of points) {
      if (!point.period) continue;
      const observationDate = parseObservationDate(point.period);
      if (!observationDate) continue;

      const numericValue =
        typeof point.value === "number"
          ? point.value
          : typeof point.value === "string"
            ? Number.parseFloat(point.value)
            : null;

      observations.push({
        seriesSlug: config.slug,
        observationDate,
        year: observationDate.getUTCFullYear(),
        month: observationDate.getUTCMonth() + 1,
        quarter: Math.floor(observationDate.getUTCMonth() / 3) + 1,
        value: Number.isFinite(numericValue ?? Number.NaN) ? numericValue : null,
        valueText: typeof point.value === "string" ? point.value : null,
        metadata: { period: point.period },
        fetchedAt,
        normalizedAt,
        rawPayload: point,
      });
    }
  }

  return { series, observations, availabilityMessage: null };
}
