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

function hoursSince(date?: Date | null) {
  if (!date) return Number.POSITIVE_INFINITY;
  return (Date.now() - date.getTime()) / 3_600_000;
}

async function ensureSyncFresh(key: keyof typeof SYNC_KEYS, maxAgeHours: number, run: () => Promise<void>) {
  const state = await getPetroleumSyncState(SYNC_KEYS[key]);
  if (hoursSince(state?.lastSuccessAt) <= maxAgeHours) {
    return;
  }

  await run();
}

async function syncEiaPrices() {
  await upsertPetroleumSyncState({ key: SYNC_KEYS.prices, status: "RUNNING" });

  try {
    const payload = await fetchEiaPetroleumMarketSeries();
    await replacePetroleumMarketSeriesData({
      series: payload.series,
      observations: payload.observations,
    });

    await upsertPetroleumSyncState({
      key: SYNC_KEYS.prices,
      status: "SUCCESS",
      markSuccess: true,
      metadata: {
        seriesCount: payload.series.length,
        observationCount: payload.observations.length,
        availabilityMessage: payload.availabilityMessage ?? null,
      },
    });
  } catch (error) {
    await upsertPetroleumSyncState({
      key: SYNC_KEYS.prices,
      status: "ERROR",
      errorMessage: error instanceof Error ? error.message : "Unknown sync error",
    });
    throw error;
  }
}

async function syncSsbNorwayExport() {
  await upsertPetroleumSyncState({ key: SYNC_KEYS.norwayExport, status: "RUNNING" });

  try {
    const payload = await fetchSsbPetroleumMarketSeries();
    if (payload.series.length > 0 || payload.observations.length > 0) {
      await replacePetroleumMarketSeriesData({
        series: payload.series,
        observations: payload.observations,
      });
    }

    await upsertPetroleumSyncState({
      key: SYNC_KEYS.norwayExport,
      status: "SUCCESS",
      markSuccess: true,
      metadata: {
        seriesCount: payload.series.length,
        observationCount: payload.observations.length,
        availabilityMessage: payload.availabilityMessage ?? null,
      },
    });
  } catch (error) {
    await upsertPetroleumSyncState({
      key: SYNC_KEYS.norwayExport,
      status: "ERROR",
      errorMessage: error instanceof Error ? error.message : "Unknown sync error",
    });
    throw error;
  }
}

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

async function ensureMacroReady() {
  await Promise.all([
    ensureSyncFresh("prices", 6, syncEiaPrices),
    ensureSyncFresh("norwayExport", 12, syncSsbNorwayExport),
    ensureSyncFresh("fiscal", 24, syncFiscalSnapshots),
  ]);
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
  await ensureMacroReady();

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
  await ensureMacroReady();
  const series = await listPetroleumMarketSeries();
  const selected = series.find((item) => item.slug === slug);
  if (!selected) {
    return [];
  }

  const observations = await listPetroleumMarketObservations({ seriesId: selected.id });
  return toObservationPoints(observations);
}

export async function getPetroleumFiscalSnapshots(jurisdiction = "NO") {
  await ensureMacroReady();
  const rows = await listPetroleumFiscalSnapshots(jurisdiction);
  return toFiscalSnapshots(rows);
}
