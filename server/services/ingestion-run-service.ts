/**
 * Ingestion Run Service
 *
 * Tracks bulk filing-ingestion jobs so the admin UI can show live progress
 * ("12 of 40 filings done") even after the script's terminal is closed.
 * Progress lives in the database, not the process.
 *
 * Lifecycle: the bulk-ingest script creates a RUNNING row, updates the
 * counters as it works, and marks it COMPLETED or FAILED at the end. On
 * completion an admin notification is raised so the header bell shows the
 * result without anyone having to watch a terminal.
 */
import { type IngestionRun, IngestionRunStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createAdminNotificationIfMissing } from "@/server/services/admin-notification-service";

export type IngestionRunSummary = {
  id: string;
  status: IngestionRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  triggeredBy: string | null;
  totalCompanies: number;
  totalFilings: number;
  processedFilings: number;
  publishedCount: number;
  reviewCount: number;
  failedCount: number;
  notes: string | null;
};

function toSummary(record: IngestionRun): IngestionRunSummary {
  return {
    id: record.id,
    status: record.status,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    triggeredBy: record.triggeredBy,
    totalCompanies: record.totalCompanies,
    totalFilings: record.totalFilings,
    processedFilings: record.processedFilings,
    publishedCount: record.publishedCount,
    reviewCount: record.reviewCount,
    failedCount: record.failedCount,
    notes: record.notes,
  };
}

export async function createIngestionRun(input: {
  totalCompanies: number;
  triggeredBy?: string | null;
}): Promise<IngestionRunSummary> {
  const record = await prisma.ingestionRun.create({
    data: {
      status: IngestionRunStatus.RUNNING,
      totalCompanies: input.totalCompanies,
      triggeredBy: input.triggeredBy ?? null,
    },
  });
  return toSummary(record);
}

export type IngestionRunProgressDelta = {
  /** Set the known total once discovery has finished. */
  totalFilings?: number;
  /** Increment counters by these amounts. */
  processedFilingsDelta?: number;
  publishedCountDelta?: number;
  reviewCountDelta?: number;
  failedCountDelta?: number;
};

/**
 * Applies a progress update to a running ingestion run. Counter deltas are
 * incremental so concurrent-safe under Postgres atomic `increment`.
 */
export async function updateIngestionRunProgress(
  runId: string,
  delta: IngestionRunProgressDelta,
): Promise<void> {
  await prisma.ingestionRun.update({
    where: { id: runId },
    data: {
      ...(delta.totalFilings !== undefined ? { totalFilings: delta.totalFilings } : {}),
      ...(delta.processedFilingsDelta
        ? { processedFilings: { increment: delta.processedFilingsDelta } }
        : {}),
      ...(delta.publishedCountDelta
        ? { publishedCount: { increment: delta.publishedCountDelta } }
        : {}),
      ...(delta.reviewCountDelta
        ? { reviewCount: { increment: delta.reviewCountDelta } }
        : {}),
      ...(delta.failedCountDelta
        ? { failedCount: { increment: delta.failedCountDelta } }
        : {}),
    },
  });
}

/**
 * Marks an ingestion run finished and raises an admin notification with the
 * outcome. Notification failure never fails the run completion.
 */
export async function completeIngestionRun(input: {
  runId: string;
  status: "COMPLETED" | "FAILED";
  notes?: string | null;
}): Promise<IngestionRunSummary> {
  const record = await prisma.ingestionRun.update({
    where: { id: input.runId },
    data: {
      status:
        input.status === "FAILED"
          ? IngestionRunStatus.FAILED
          : IngestionRunStatus.COMPLETED,
      finishedAt: new Date(),
      notes: input.notes ?? null,
    },
  });

  const summary = toSummary(record);

  const title =
    summary.status === IngestionRunStatus.FAILED
      ? "Bulk-opplasting feilet"
      : "Bulk-opplasting ferdig";
  const body =
    summary.status === IngestionRunStatus.FAILED
      ? `Opplastingen stoppet: ${summary.notes ?? "ukjent feil"}.`
      : `${summary.processedFilings} filings behandlet — ` +
        `${summary.publishedCount} publisert, ${summary.reviewCount} til kontroll, ` +
        `${summary.failedCount} feilet.`;

  await createAdminNotificationIfMissing({
    type: "INGESTION_COMPLETED",
    recipientRole: "ADMIN",
    title,
    body,
    linkPath: "/admin/annual-report-reviews",
    dedupeKey: `ingestion-run:${summary.id}`,
    metadata: {
      runId: summary.id,
      processedFilings: summary.processedFilings,
      publishedCount: summary.publishedCount,
      reviewCount: summary.reviewCount,
      failedCount: summary.failedCount,
    },
  }).catch((error) => {
    console.warn("[ingestion-run-service] notification failed", error);
  });

  return summary;
}

/**
 * Returns the run that should drive the admin indicator: the active RUNNING
 * run if one exists, otherwise the most recent run (so a just-finished run
 * still shows briefly). Null when no run has ever happened.
 */
export async function getCurrentIngestionRun(): Promise<IngestionRunSummary | null> {
  const running = await prisma.ingestionRun.findFirst({
    where: { status: IngestionRunStatus.RUNNING },
    orderBy: { startedAt: "desc" },
  });
  if (running) {
    return toSummary(running);
  }
  const latest = await prisma.ingestionRun.findFirst({
    orderBy: { startedAt: "desc" },
  });
  return latest ? toSummary(latest) : null;
}

export async function listRecentIngestionRuns(limit = 10): Promise<IngestionRunSummary[]> {
  const records = await prisma.ingestionRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
  });
  return records.map(toSummary);
}
