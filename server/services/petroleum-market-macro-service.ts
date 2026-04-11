import { fetchEiaPetroleumMarketSeries } from "@/integrations/eia/eia-market-provider";
import { fetchNorwegianPetroleumFiscalSnapshots } from "@/integrations/fiscal/norwegian-petroleum-fiscal-provider";
import { fetchSsbPetroleumMarketSeries } from "@/integrations/ssb/ssb-petroleum-provider";
import {
  getPetroleumSyncState,
  listPetroleumFiscalSnapshots,
  listPetroleumMarketObservations,
  listPetroleumMarketSeries,
  replacePetroleumFiscalSnapshots,
  replacePetroleumMarketSeriesData,
  upsertPetroleumSyncState,
} from "@/server/persistence/petroleum-market-repository";
import {
  PetroleumFiscalSnapshot,
  PetroleumMacroSummaryResponse,
  PetroleumMarketObservationPoint,
  PetroleumMarketSeriesSummary,
  PetroleumSourceStatus,
} from "@/lib/types";

const SYNC_KEYS = {
  prices: "petroleum-market-prices",
  norwayExport: "petroleum-market-norway-export",
  fiscal: "petroleum-market-fiscal",
} as const;

async function syncFiscalSnapshots() {
  await upsertPetroleumSyncState({ key: SYNC_KEYS.fiscal, status: "RUNNING" });

  try {
    const payload = await fetchNorwegianPetroleumFiscalSnapshots();
    await replacePetroleumFiscalSnapshots({ snapshots: payload.snapshots });
    await upsertPetroleumSyncState({
      key: SYNC_KEYS.fiscal,
      status: "SUCCESS",
      markSuccess: true,
      metadata: {
        snapshotCount: payload.snapshots.length,
        availabilityMessage: payload.availabilityMessage ?? null,
      },
    });
  } catch (error) {
    await upsertPetroleumSyncState({
      key: SYNC_KEYS.fiscal,
      status: "ERROR",
      errorMessage: error instanceof Error ? error.message : "Unknown sync error",
    });
    throw error;
  }
}

function toSeriesSummary(rows: Awaited<ReturnType<typeof listPetroleumMarketSeries>>): PetroleumMarketSeriesSummary[] {
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    region: row.region,
    countryCode: row.countryCode,
    product: row.product,
    unit: row.unit,
    frequency: row.frequency,
    sourceSystem: row.sourceSystem,
    sourceEntityType: row.sourceEntityType,
    sourceId: row.sourceId,
    fetchedAt: row.fetchedAt,
    normalizedAt: row.normalizedAt,
  }));
}

function toObservationPoints(rows: Awaited<ReturnType<typeof listPetroleumMarketObservations>>): PetroleumMarketObservationPoint[] {
  return rows.map((row) => ({
    seriesId: row.seriesId,
    observationDate: row.observationDate,
    year: row.year,
    month: row.month,
    quarter: row.quarter,
    value: row.value ? Number(row.value) : null,
    valueText: row.valueText,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  }));
}

function toFiscalSnapshots(rows: Awaited<ReturnType<typeof listPetroleumFiscalSnapshots>>): PetroleumFiscalSnapshot[] {
  return rows.map((row) => ({
    id: row.id,
    jurisdiction: row.jurisdiction,
    effectiveDate: row.effectiveDate,
    title: row.title,
    summary: row.summary,
    taxRate: row.taxRate ? Number(row.taxRate) : null,
    specialTaxRate: row.specialTaxRate ? Number(row.specialTaxRate) : null,
    normPriceReference: row.normPriceReference,
    detailUrl: row.detailUrl,
    sourceSystem: row.sourceSystem,
    sourceEntityType: row.sourceEntityType,
    sourceId: row.sourceId,
    fetchedAt: row.fetchedAt,
    normalizedAt: row.normalizedAt,
  }));
}

async function buildSourceStatus(): Promise<PetroleumSourceStatus[]> {
  const [eia, ssb, fiscal] = await Promise.all([
    getPetroleumSyncState(SYNC_KEYS.prices),
    getPetroleumSyncState(SYNC_KEYS.norwayExport),
    getPetroleumSyncState(SYNC_KEYS.fiscal),
  ]);

  return [
    {
      source: "EIA",
      available: eia?.status === "SUCCESS",
      message: (eia?.metadata as { availabilityMessage?: string } | null)?.availabilityMessage ?? eia?.errorMessage ?? undefined,
      lastSuccessAt: eia?.lastSuccessAt,
    },
    {
      source: "SSB",
      available: ssb?.status === "SUCCESS",
      message: (ssb?.metadata as { availabilityMessage?: string } | null)?.availabilityMessage ?? ssb?.errorMessage ?? undefined,
      lastSuccessAt: ssb?.lastSuccessAt,
    },
    {
      source: "FISCAL",
      available: fiscal?.status === "SUCCESS",
      message:
        (fiscal?.metadata as { availabilityMessage?: string } | null)?.availabilityMessage ??
        fiscal?.errorMessage ??
        undefined,
      lastSuccessAt: fiscal?.lastSuccessAt,
    },
  ];
}

export async function getPetroleumMacroSummary(): Promise<PetroleumMacroSummaryResponse> {
  const [seriesRows, fiscalRows, sourceStatus] = await Promise.all([
    listPetroleumMarketSeries(),
    listPetroleumFiscalSnapshots("NO"),
    buildSourceStatus(),
  ]);

  const observations: PetroleumMarketObservationPoint[] = [];
  for (const series of seriesRows) {
    const latest = await listPetroleumMarketObservations({ seriesId: series.id });
    const point = latest.at(-1);
    if (point) {
      observations.push(...toObservationPoints([point]));
    }
  }

  return {
    series: toSeriesSummary(seriesRows),
    latestObservations: observations,
    fiscalSnapshots: toFiscalSnapshots(fiscalRows),
    sourceStatus,
  };
}

export async function getPetroleumMarketSeriesTimeseries(slug: string) {
  const series = await listPetroleumMarketSeries();
  const selected = series.find((item) => item.slug === slug);
  if (!selected) {
    return [];
  }

  const observations = await listPetroleumMarketObservations({ seriesId: selected.id });
  return toObservationPoints(observations);
}

export async function getPetroleumFiscalSnapshots(jurisdiction = "NO") {
  const rows = await listPetroleumFiscalSnapshots(jurisdiction);
  return toFiscalSnapshots(rows);
}

export async function syncPetroleumMacroDataNow() {
  await Promise.all([
    upsertPetroleumSyncState({ key: SYNC_KEYS.prices, status: "RUNNING" }),
    upsertPetroleumSyncState({ key: SYNC_KEYS.norwayExport, status: "RUNNING" }),
  ]);

  try {
    const [eiaPayload, ssbPayload] = await Promise.all([
      fetchEiaPetroleumMarketSeries(),
      fetchSsbPetroleumMarketSeries(),
    ]);

    const combinedSeries = [...eiaPayload.series, ...ssbPayload.series];
    const combinedObservations = [...eiaPayload.observations, ...ssbPayload.observations];

    if (combinedSeries.length > 0 || combinedObservations.length > 0) {
      await replacePetroleumMarketSeriesData({
        series: combinedSeries,
        observations: combinedObservations,
      });
    }

    await Promise.all([
      upsertPetroleumSyncState({
        key: SYNC_KEYS.prices,
        status: "SUCCESS",
        markSuccess: true,
        metadata: {
          seriesCount: eiaPayload.series.length,
          observationCount: eiaPayload.observations.length,
          availabilityMessage: eiaPayload.availabilityMessage ?? null,
        },
      }),
      upsertPetroleumSyncState({
        key: SYNC_KEYS.norwayExport,
        status: "SUCCESS",
        markSuccess: true,
        metadata: {
          seriesCount: ssbPayload.series.length,
          observationCount: ssbPayload.observations.length,
          availabilityMessage: ssbPayload.availabilityMessage ?? null,
        },
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    await Promise.all([
      upsertPetroleumSyncState({
        key: SYNC_KEYS.prices,
        status: "ERROR",
        errorMessage: message,
      }),
      upsertPetroleumSyncState({
        key: SYNC_KEYS.norwayExport,
        status: "ERROR",
        errorMessage: message,
      }),
    ]);
    throw error;
  }

  await syncFiscalSnapshots();
}
