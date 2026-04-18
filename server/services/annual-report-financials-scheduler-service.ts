import crypto from "node:crypto";

import {
  summarizeDiscoveryResults,
  summarizeProcessingResults,
} from "@/integrations/brreg/annual-report-financials/publish-gate";
import {
  acquirePipelineJobLease,
  heartbeatPipelineJobLease,
  releasePipelineJobLease,
} from "@/server/persistence/annual-report-ingestion-repository";
import {
  getAnnualReportPipelineOverview,
  reprocessAnnualReportFilingsByCriteria,
  syncNewAnnualReportFilings,
} from "@/server/services/annual-report-financials-service";

const SCHEDULED_JOB_KEY = "annual-report-financial-sync";

function logSchedulerEvent(event: string, payload: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      scope: "annual-report-financials-scheduler",
      event,
      at: new Date().toISOString(),
      ...payload,
    }),
  );
}

function extractGroupedCount(
  item: { _count?: true | { _all?: number | null } } | undefined,
) {
  if (!item || !item._count || item._count === true) {
    return 0;
  }

  return item._count._all ?? 0;
}

export async function runScheduledAnnualReportFinancialSync(options?: {
  leaseSeconds?: number;
  lowConfidenceRetryLimit?: number;
}) {
  const leaseSeconds = options?.leaseSeconds ?? 15 * 60;
  const lowConfidenceRetryLimit = options?.lowConfidenceRetryLimit ?? 0;
  const leaseOwner = crypto.randomUUID();
  const acquired = await acquirePipelineJobLease({
    jobKey: SCHEDULED_JOB_KEY,
    leaseOwner,
    leaseSeconds,
    metadata: {
      lowConfidenceRetryLimit,
    },
  });

  if (!acquired.acquired) {
    logSchedulerEvent("lease.skipped", {
      jobKey: SCHEDULED_JOB_KEY,
      activeLeaseOwner: acquired.lease.leaseOwner,
      leaseExpiresAt: acquired.lease.leaseExpiresAt,
    });

    return {
      ok: true,
      skipped: true,
      reason: "Another scheduled annual-report sync run already holds the lease.",
      lease: {
        jobKey: acquired.lease.jobKey,
        leaseOwner: acquired.lease.leaseOwner,
        leaseExpiresAt: acquired.lease.leaseExpiresAt,
      },
    };
  }

  logSchedulerEvent("lease.acquired", {
    jobKey: SCHEDULED_JOB_KEY,
    leaseOwner,
    leaseExpiresAt: acquired.lease.leaseExpiresAt,
  });

  try {
    const syncResult = await syncNewAnnualReportFilings();
    await heartbeatPipelineJobLease({
      jobKey: SCHEDULED_JOB_KEY,
      leaseOwner,
      leaseSeconds,
    });

    const retryResult =
      lowConfidenceRetryLimit > 0
        ? await reprocessAnnualReportFilingsByCriteria({
            maxQualityScore: 0.75,
            limit: lowConfidenceRetryLimit,
            note: "Scheduled low-confidence retry",
          })
        : { matchedFilings: [], results: [] };

    const overview = await getAnnualReportPipelineOverview({ sampleLimit: 10 });
    const syncProcessingSummary = summarizeProcessingResults(syncResult.processed);
    const retryProcessingSummary = summarizeProcessingResults(retryResult.results);

    const summary = {
      checkedCompanies: syncResult.checkedCompanies,
      discoveredCount: summarizeDiscoveryResults(syncResult.discovered),
      changedSourceCount: syncResult.versionChecks.length,
      ...syncProcessingSummary,
      lowConfidenceRetryCount: retryResult.results.length,
      lowConfidenceRetrySummary: retryProcessingSummary,
      reviewQueueCount: overview.metrics.reviews.reduce(
        (sum, item) =>
          sum +
          (["PENDING_REVIEW", "REPROCESS_REQUESTED"].includes(item.status)
            ? extractGroupedCount(item)
            : 0),
        0,
      ),
      incompleteCoverageCount: overview.metrics.incompleteCoverageCount,
    };

    logSchedulerEvent("run.completed", summary);

    return {
      ok: true,
      skipped: false,
      leaseOwner,
      syncResult,
      retryResult,
      summary,
    };
  } finally {
    await releasePipelineJobLease({
      jobKey: SCHEDULED_JOB_KEY,
      leaseOwner,
    });
    logSchedulerEvent("lease.released", {
      jobKey: SCHEDULED_JOB_KEY,
      leaseOwner,
    });
  }
}
