import { getPetroleumSyncState } from "@/server/persistence/petroleum-market-repository";
import { refreshPetroleumCompanyExposureNow } from "@/server/services/petroleum-company-exposure-service";
import { syncPetroleumMacroDataNow } from "@/server/services/petroleum-market-macro-service";
import {
  syncPetroleumCoreDataNow,
  syncPetroleumEventsNow,
  syncPetroleumMetricsDataNow,
  syncPetroleumPublicationDataNow,
} from "@/server/services/petroleum-market-service";
import { refreshPetroleumSnapshotsNow } from "@/server/services/petroleum-snapshot-service";

const SYNC_KEYS = {
  core: "petroleum-core",
  metrics: "petroleum-metrics",
  publications: "petroleum-publications",
  havtil: "petroleum-events-havtil",
  gassco: "petroleum-events-gassco",
  prices: "petroleum-market-prices",
  norwayExport: "petroleum-market-norway-export",
  fiscal: "petroleum-market-fiscal",
  snapshots: "petroleum-snapshots",
  companyExposure: "petroleum-company-exposure",
} as const;

const SCHEDULED_MAX_AGE_HOURS = {
  core: 24,
  metrics: 24,
  publications: 24,
  events: 1,
  macro: 12,
  snapshots: 6,
  companyExposure: 6,
} as const;

export type PetroleumJobName =
  | "bootstrap-core"
  | "bootstrap-metrics"
  | "bootstrap-publications"
  | "bootstrap-events"
  | "bootstrap-macros"
  | "refresh-snapshots"
  | "refresh-company-exposure"
  | "bootstrap-all"
  | "scheduled";

function hoursSince(date?: Date | null) {
  if (!date) return Number.POSITIVE_INFINITY;
  return (Date.now() - date.getTime()) / 3_600_000;
}

async function isJobStale(key: string, maxAgeHours: number) {
  const state = await getPetroleumSyncState(key);
  if (state?.status === "RUNNING") {
    return false;
  }

  return hoursSince(state?.lastSuccessAt) > maxAgeHours;
}

async function runIfStale(key: string, maxAgeHours: number, run: () => Promise<unknown>) {
  const stale = await isJobStale(key, maxAgeHours);
  if (!stale) {
    return { ran: false, reason: "fresh" as const };
  }

  const result = await run();
  return { ran: true, result };
}

export async function syncPetroleumBootstrapNow() {
  const core = await syncPetroleumCoreDataNow();
  const metrics = await syncPetroleumMetricsDataNow();
  const publications = await syncPetroleumPublicationDataNow();
  const events = await syncPetroleumEventsNow();
  const macros = await syncPetroleumMacroDataNow();
  const snapshots = await refreshPetroleumSnapshotsNow();
  const companyExposure = await refreshPetroleumCompanyExposureNow();

  return {
    core,
    metrics,
    publications,
    events,
    macros,
    snapshots,
    companyExposure,
  };
}

export async function runScheduledPetroleumJobs() {
  const core = await runIfStale(SYNC_KEYS.core, SCHEDULED_MAX_AGE_HOURS.core, () =>
    syncPetroleumCoreDataNow(),
  );
  const metrics = await runIfStale(SYNC_KEYS.metrics, SCHEDULED_MAX_AGE_HOURS.metrics, () =>
    syncPetroleumMetricsDataNow(),
  );
  const publications = await runIfStale(
    SYNC_KEYS.publications,
    SCHEDULED_MAX_AGE_HOURS.publications,
    () => syncPetroleumPublicationDataNow(),
  );
  const havtilStale = await isJobStale(SYNC_KEYS.havtil, SCHEDULED_MAX_AGE_HOURS.events);
  const gasscoStale = await isJobStale(SYNC_KEYS.gassco, SCHEDULED_MAX_AGE_HOURS.events);
  const events =
    havtilStale || gasscoStale
      ? { ran: true, result: await syncPetroleumEventsNow() }
      : { ran: false, reason: "fresh" as const };
  const pricesStale = await isJobStale(SYNC_KEYS.prices, SCHEDULED_MAX_AGE_HOURS.macro);
  const norwayExportStale = await isJobStale(SYNC_KEYS.norwayExport, SCHEDULED_MAX_AGE_HOURS.macro);
  const fiscalStale = await isJobStale(SYNC_KEYS.fiscal, SCHEDULED_MAX_AGE_HOURS.macro);
  const macros =
    pricesStale || norwayExportStale || fiscalStale
      ? { ran: true, result: await syncPetroleumMacroDataNow() }
      : { ran: false, reason: "fresh" as const };
  const snapshots =
    core.ran || metrics.ran
      ? { ran: true, result: await refreshPetroleumSnapshotsNow() }
      : await runIfStale(SYNC_KEYS.snapshots, SCHEDULED_MAX_AGE_HOURS.snapshots, () =>
          refreshPetroleumSnapshotsNow(),
        );
  const companyExposure =
    snapshots.ran
      ? { ran: true, result: await refreshPetroleumCompanyExposureNow() }
      : await runIfStale(SYNC_KEYS.companyExposure, SCHEDULED_MAX_AGE_HOURS.companyExposure, () =>
          refreshPetroleumCompanyExposureNow(),
        );

  return {
    core,
    metrics,
    publications,
    events,
    macros,
    snapshots,
    companyExposure,
  };
}

export async function runPetroleumJobNow(job: PetroleumJobName) {
  switch (job) {
    case "bootstrap-core":
      return syncPetroleumCoreDataNow();
    case "bootstrap-metrics":
      return syncPetroleumMetricsDataNow();
    case "bootstrap-publications":
      return syncPetroleumPublicationDataNow();
    case "bootstrap-events":
      return syncPetroleumEventsNow();
    case "bootstrap-macros":
      return syncPetroleumMacroDataNow();
    case "refresh-snapshots":
      return refreshPetroleumSnapshotsNow();
    case "refresh-company-exposure":
      return refreshPetroleumCompanyExposureNow();
    case "bootstrap-all":
      return syncPetroleumBootstrapNow();
    case "scheduled":
      return runScheduledPetroleumJobs();
    default:
      return null;
  }
}
