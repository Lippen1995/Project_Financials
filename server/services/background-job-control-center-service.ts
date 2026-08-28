import { prisma } from "@/lib/prisma";

export type BackgroundJobHealth = "healthy" | "active" | "warning" | "error";

export type BackgroundJobRunView = {
  status: string;
  startedAt: string;
  completedAt: string | null;
  claimedCount: number;
  succeededCount: number;
  failedCount: number;
  errorMessage: string | null;
};

export type BackgroundJobControlCenterItem = {
  jobKey: string;
  title: string;
  description: string;
  cadenceLabel: string;
  queueDepth: number;
  dueCount: number;
  runningCount: number;
  errorCount: number;
  oldestQueuedAt: string | null;
  health: BackgroundJobHealth;
  statusLabel: string;
  latestRun: BackgroundJobRunView | null;
  latestSuccess: BackgroundJobRunView | null;
  latestFailure: BackgroundJobRunView | null;
};

type JobSpec = {
  jobKey: string;
  title: string;
  description: string;
  cadenceLabel: string;
  staleAfterMs: number;
};

const JOB_SPECS: JobSpec[] = [
  {
    jobKey: "structured-financials-queue",
    title: "Strukturerte regnskap",
    description: "Henter offisielle regnskapsdata fra Brreg for selskaper som venter.",
    cadenceLabel: "Hvert 5. minutt",
    staleAfterMs: 15 * 60 * 1_000,
  },
  {
    jobKey: "company-announcement-queue",
    title: "Brreg-kunngjøringer",
    description: "Populerer lokale kunngjøringer uten nettverkskall i selskapsprofilen.",
    cadenceLabel: "Hvert 5. minutt",
    staleAfterMs: 15 * 60 * 1_000,
  },
  {
    jobKey: "ai-search-jobs",
    title: "Premium AI-søk",
    description: "Utfører budsjetterte AI-søk for abonnement med denne rettigheten.",
    cadenceLabel: "Hvert minutt",
    staleAfterMs: 5 * 60 * 1_000,
  },
  {
    jobKey: "ssb-classifications",
    title: "SSB Klass",
    description: "Oppdaterer det lokale, versjonerte speilet av offisielle klassifikasjoner.",
    cadenceLabel: "Daglig kl. 03:00 UTC",
    staleAfterMs: 36 * 60 * 60 * 1_000,
  },
];

type StatusGroup = { status: string; _count: { id: number } };

function statusCount(groups: StatusGroup[], status: string) {
  return groups.find((group) => group.status === status)?._count.id ?? 0;
}

function runView(run: {
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  claimedCount: number;
  succeededCount: number;
  failedCount: number;
  errorMessage: string | null;
} | undefined): BackgroundJobRunView | null {
  if (!run) return null;
  return {
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    claimedCount: run.claimedCount,
    succeededCount: run.succeededCount,
    failedCount: run.failedCount,
    errorMessage: run.errorMessage,
  };
}

function latestByJob<T extends { jobKey: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.jobKey, row]));
}

export async function buildBackgroundJobControlCenter(input: {
  now?: Date;
} = {}): Promise<BackgroundJobControlCenterItem[]> {
  const now = input.now ?? new Date();
  const jobKeys = JOB_SPECS.map((job) => job.jobKey);
  const runSelect = {
    jobKey: true,
    status: true,
    startedAt: true,
    completedAt: true,
    claimedCount: true,
    succeededCount: true,
    failedCount: true,
    errorMessage: true,
  } as const;

  const [
    latestRuns,
    latestSuccesses,
    latestFailures,
    activeLeases,
    structuredGroups,
    structuredDue,
    oldestStructured,
    announcementGroups,
    announcementDue,
    oldestAnnouncement,
    aiGroups,
    aiDue,
    oldestAi,
    ssbGroups,
    ssbDue,
    oldestSsb,
  ] = await Promise.all([
    prisma.backgroundJobRun.findMany({
      where: { jobKey: { in: jobKeys } },
      distinct: ["jobKey"],
      orderBy: [{ jobKey: "asc" }, { startedAt: "desc" }],
      select: runSelect,
    }),
    prisma.backgroundJobRun.findMany({
      where: { jobKey: { in: jobKeys }, status: { in: ["COMPLETED", "PARTIAL"] } },
      distinct: ["jobKey"],
      orderBy: [{ jobKey: "asc" }, { startedAt: "desc" }],
      select: runSelect,
    }),
    prisma.backgroundJobRun.findMany({
      where: { jobKey: { in: jobKeys }, status: "FAILED" },
      distinct: ["jobKey"],
      orderBy: [{ jobKey: "asc" }, { startedAt: "desc" }],
      select: runSelect,
    }),
    prisma.pipelineJobLease.findMany({
      where: { jobKey: { in: jobKeys }, leaseExpiresAt: { gt: now } },
      select: { jobKey: true },
    }),
    prisma.structuredFinancialFetchState.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.structuredFinancialFetchState.count({ where: { nextCheckAt: { lte: now } } }),
    prisma.structuredFinancialFetchState.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.companyAnnouncementFetchState.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.companyAnnouncementFetchState.count({ where: { nextCheckAt: { lte: now } } }),
    prisma.companyAnnouncementFetchState.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.aiSearchJob.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.aiSearchJob.count({
      where: { status: "PENDING", nextAttemptAt: { lte: now } },
    }),
    prisma.aiSearchJob.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.ssbClassificationSyncState.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.ssbClassificationSyncState.count({ where: { nextCheckAt: { lte: now } } }),
    prisma.ssbClassificationSyncState.findFirst({
      where: { nextCheckAt: { lte: now } },
      orderBy: { nextCheckAt: "asc" },
      select: { nextCheckAt: true },
    }),
  ]);

  const runsByJob = latestByJob(latestRuns);
  const successesByJob = latestByJob(latestSuccesses);
  const failuresByJob = latestByJob(latestFailures);
  const leasedJobs = new Set(activeLeases.map((lease) => lease.jobKey));
  const queueState = new Map<string, {
    queueDepth: number;
    dueCount: number;
    runningCount: number;
    errorCount: number;
    oldestQueuedAt: Date | null;
  }>([
    ["structured-financials-queue", {
      queueDepth: statusCount(structuredGroups, "PENDING"),
      dueCount: structuredDue,
      runningCount: 0,
      errorCount: statusCount(structuredGroups, "ERROR"),
      oldestQueuedAt: oldestStructured?.createdAt ?? null,
    }],
    ["company-announcement-queue", {
      queueDepth: statusCount(announcementGroups, "PENDING"),
      dueCount: announcementDue,
      runningCount: 0,
      errorCount: statusCount(announcementGroups, "ERROR"),
      oldestQueuedAt: oldestAnnouncement?.createdAt ?? null,
    }],
    ["ai-search-jobs", {
      queueDepth: statusCount(aiGroups, "PENDING"),
      dueCount: aiDue,
      runningCount: statusCount(aiGroups, "RUNNING"),
      errorCount: statusCount(aiGroups, "FAILED"),
      oldestQueuedAt: oldestAi?.createdAt ?? null,
    }],
    ["ssb-classifications", {
      queueDepth: ssbDue,
      dueCount: ssbDue,
      runningCount: 0,
      errorCount: statusCount(ssbGroups, "ERROR"),
      oldestQueuedAt: oldestSsb?.nextCheckAt ?? null,
    }],
  ]);

  for (const jobKey of leasedJobs) {
    const state = queueState.get(jobKey);
    if (state) state.runningCount = Math.max(1, state.runningCount);
  }

  return JOB_SPECS.map((spec) => {
    const state = queueState.get(spec.jobKey)!;
    const latestRunRecord = runsByJob.get(spec.jobKey);
    const latestSuccessRecord = successesByJob.get(spec.jobKey);
    const active = leasedJobs.has(spec.jobKey);
    const oldestAgeMs = state.oldestQueuedAt
      ? now.getTime() - state.oldestQueuedAt.getTime()
      : 0;
    const successAgeMs = latestSuccessRecord
      ? now.getTime() - latestSuccessRecord.startedAt.getTime()
      : Number.POSITIVE_INFINITY;

    let health: BackgroundJobHealth = "healthy";
    let statusLabel = "På plan";
    if (
      state.errorCount > 0
      || latestRunRecord?.status === "FAILED"
      || (latestRunRecord?.failedCount ?? 0) > 0
    ) {
      health = "error";
      statusLabel = "Feil krever tiltak";
    } else if (active) {
      health = "active";
      statusLabel = "Kjører nå";
    } else if (latestRunRecord?.status === "RUNNING") {
      health = "warning";
      statusLabel = "Kjøring uten aktiv lease";
    } else if (!latestRunRecord) {
      health = "warning";
      statusLabel = "Ingen kjøring registrert";
    } else if (!latestSuccessRecord) {
      health = "warning";
      statusLabel = "Ingen vellykket kjøring registrert";
    } else if (oldestAgeMs > spec.staleAfterMs || successAgeMs > spec.staleAfterMs) {
      health = "warning";
      statusLabel = state.queueDepth > 0 ? "Etterslep" : "Kjøring forsinket";
    }

    return {
      ...spec,
      ...state,
      oldestQueuedAt: state.oldestQueuedAt?.toISOString() ?? null,
      health,
      statusLabel,
      latestRun: runView(latestRunRecord),
      latestSuccess: runView(latestSuccessRecord),
      latestFailure: runView(failuresByJob.get(spec.jobKey)),
    };
  }).map(({ staleAfterMs: _staleAfterMs, ...job }) => job);
}
