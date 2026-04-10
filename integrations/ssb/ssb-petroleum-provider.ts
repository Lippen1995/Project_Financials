import env from "@/lib/env";
import { fetchJson } from "@/integrations/http";
import { MarketSeriesSyncPayload } from "@/integrations/eia/eia-market-provider";

type PxwebResponse = {
  dataset?: {
    dimension?: Record<string, { category?: { index?: Record<string, number> } }>;
    value?: Array<number | null>;
  };
};

async function fetchSsbTable(tableId: string, valueCode: string) {
  const url = `${env.ssbPxwebBaseUrl}/${tableId}.px`;
  return fetchJson<PxwebResponse>(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: [
          { code: "ContentsCode", selection: { filter: "item", values: [valueCode] } },
          { code: "Tid", selection: { filter: "all", values: ["*"] } },
        ],
        response: { format: "json-stat2" },
      }),
    },
    15_000,
  );
}

export async function fetchSsbPetroleumMarketSeries(): Promise<MarketSeriesSyncPayload> {
  if (!env.ssbPetroleumExportTableId && !env.ssbPetroleumInvestmentTableId) {
    return {
      series: [],
      observations: [],
      availabilityMessage: "SSB petroleum-tabeller er ikke konfigurert i miljøvariabler.",
    };
  }

  const fetchedAt = new Date();
  const normalizedAt = new Date();
  const series: Array<Record<string, unknown>> = [];
  const observations: Array<Record<string, unknown>> = [];

  if (env.ssbPetroleumExportTableId) {
    const exportPayload = await fetchSsbTable(env.ssbPetroleumExportTableId, "value").catch(() => null);
    series.push({
      slug: "norway-petroleum-export",
      name: "Norsk petroleumseksport",
      category: "NORWAY_EXPORT",
      region: "NORWAY",
      countryCode: "NO",
      product: "oe",
      unit: "NOK",
      frequency: "annual",
      sourceSystem: "SSB",
      sourceEntityType: "TABLE",
      sourceId: env.ssbPetroleumExportTableId,
      fetchedAt,
      normalizedAt,
      rawPayload: exportPayload,
    });

    const timeline = exportPayload?.dataset?.dimension?.Tid?.category?.index ?? {};
    const values = exportPayload?.dataset?.value ?? [];
    for (const [period, index] of Object.entries(timeline)) {
      const value = values[index] ?? null;
      const observationDate = /^\d{4}$/.test(period) ? new Date(`${period}-01-01T00:00:00.000Z`) : null;
      if (!observationDate) continue;
      observations.push({
        seriesSlug: "norway-petroleum-export",
        observationDate,
        year: observationDate.getUTCFullYear(),
        month: null,
        quarter: null,
        value,
        valueText: null,
        metadata: { period },
        fetchedAt,
        normalizedAt,
        rawPayload: { period, value },
      });
    }
  }

  return {
    series,
    observations,
    availabilityMessage: null,
  };
}
