/**
 * Ingestion queue for structured Brreg financials.
 *
 * The product rule is that a user request never calls an external API. The
 * request path reads the database; when a company has no structured financials
 * yet, it *enqueues* the company and shows an honest "not loaded yet" state.
 * A background worker drains the queue and calls Brreg.
 *
 * The queue is not a separate table. StructuredFinancialFetchState already
 * carries `status` and `nextCheckAt` per company, which is exactly a due-time
 * work queue, so enqueueing is a PENDING row with `nextCheckAt = now` and
 * draining is "take the rows that are due". That keeps one source of truth for
 * what we know about each company's fetch state.
 *
 * Enqueueing is deliberately create-only: repeat page views of an uncovered
 * company must not reset backoff or jump the line ahead of companies that have
 * been waiting.
 */
import { prisma } from "@/lib/prisma";
import { logRecoverableError } from "@/lib/recoverable-error";
import {
  acquirePipelineJobLease,
  releasePipelineJobLease,
} from "@/server/persistence/pipeline-job-lease-repository";
import { ingestStructuredFinancialsForCompany } from "@/server/services/structured-financials-service";

export const STRUCTURED_FINANCIALS_QUEUE_JOB_KEY = "structured-financials-queue";

/** Status written when a company is queued but has never been fetched. */
export const STRUCTURED_FETCH_STATUS_PENDING = "PENDING";

const QUEUE_SOURCE_SYSTEM = "BRREG";
const QUEUE_SOURCE_ENTITY_TYPE = "structuredAnnualAccountsQueued";

export type EnqueueOutcome = "queued" | "already_queued" | "already_tracked" | "unknown_company";

/**
 * Mark a company as needing a structured-financials fetch.
 *
 * Never throws: this runs on the read path, and a queue write failing must not
 * take down a company page. Callers get the outcome for logging/telemetry only.
 */
export async function enqueueStructuredFinancialsFetch(
  orgNumber: string,
): Promise<EnqueueOutcome> {
  try {
    const company = await prisma.company.findUnique({
      where: { orgNumber },
      select: { id: true },
    });
    if (!company) return "unknown_company";

    const existing = await prisma.structuredFinancialFetchState.findUnique({
      where: { companyId: company.id },
      select: { status: true },
    });

    if (existing) {
      return existing.status === STRUCTURED_FETCH_STATUS_PENDING
        ? "already_queued"
        : "already_tracked";
    }

    const now = new Date();
    await prisma.structuredFinancialFetchState.create({
      data: {
        companyId: company.id,
        status: STRUCTURED_FETCH_STATUS_PENDING,
        unavailableReason: null,
        lastCheckedAt: now,
        // Due immediately: the next drain should pick it up.
        nextCheckAt: now,
        failureCount: 0,
        lastErrorCode: null,
        latestFiscalYear: null,
        sourceSystem: QUEUE_SOURCE_SYSTEM,
        sourceEntityType: QUEUE_SOURCE_ENTITY_TYPE,
        sourceId: orgNumber,
        fetchedAt: now,
        normalizedAt: now,
      },
    });

    return "queued";
  } catch (error) {
    // A racing request may have created the row between our read and write.
    // That is a benign outcome, not a failure worth surfacing.
    logRecoverableError("structured-financials-queue.enqueue", error, { orgNumber });
    return "already_queued";
  }
}

export type QueueDepth = {
  pending: number;
  dueForRefresh: number;
  errors: number;
  total: number;
};

export async function getStructuredFinancialsQueueDepth(
  now: Date = new Date(),
): Promise<QueueDepth> {
  const [pending, dueForRefresh, errors, total] = await Promise.all([
    prisma.structuredFinancialFetchState.count({
      where: { status: STRUCTURED_FETCH_STATUS_PENDING },
    }),
    prisma.structuredFinancialFetchState.count({
      where: { nextCheckAt: { lte: now } },
    }),
    prisma.structuredFinancialFetchState.count({ where: { status: "ERROR" } }),
    prisma.structuredFinancialFetchState.count(),
  ]);

  return { pending, dueForRefresh, errors, total };
}

export type DrainResult = {
  skipped: boolean;
  skippedReason?: string;
  claimed: number;
  succeeded: number;
  failed: number;
  available: number;
  unavailable: number;
  durationMs: number;
  companies: Array<{
    orgNumber: string;
    status: string;
    fiscalYears: number[];
    errorCode: string | null;
  }>;
};

export type DrainOptions = {
  limit?: number;
  leaseOwner?: string;
  leaseSeconds?: number;
  /** Skip the lease. Only for single-shot CLI runs where overlap is impossible. */
  withoutLease?: boolean;
  now?: () => Date;
};

/**
 * Fetch Brreg for companies whose fetch state is due.
 *
 * PENDING rows are drained before routine refreshes. Ordering by `nextCheckAt`
 * alone is not enough: a PENDING row is created with `nextCheckAt = now`, so
 * any backlog of overdue refreshes — whose `nextCheckAt` is further in the past
 * — sorts ahead of it. That would leave a user who just opened an uncovered
 * company waiting behind the entire backlog. Someone is looking at the PENDING
 * ones, so they go first.
 */
export async function drainStructuredFinancialsQueue(
  options: DrainOptions = {},
): Promise<DrainResult> {
  const now = options.now ?? (() => new Date());
  const limit = options.limit ?? 25;
  const leaseOwner = options.leaseOwner ?? `drain-${process.pid}`;
  const leaseSeconds = options.leaseSeconds ?? 15 * 60;
  const startedAt = Date.now();

  const empty: DrainResult = {
    skipped: true,
    claimed: 0,
    succeeded: 0,
    failed: 0,
    available: 0,
    unavailable: 0,
    durationMs: 0,
    companies: [],
  };

  if (!options.withoutLease) {
    const lease = await acquirePipelineJobLease({
      jobKey: STRUCTURED_FINANCIALS_QUEUE_JOB_KEY,
      leaseOwner,
      leaseSeconds,
    });
    if (!lease.acquired) {
      return {
        ...empty,
        skippedReason: `Jobben kjører allerede (eier: ${lease.lease.leaseOwner}).`,
        durationMs: Date.now() - startedAt,
      };
    }
  }

  try {
    const dueAt = now();
    const pending = await prisma.structuredFinancialFetchState.findMany({
      where: { status: STRUCTURED_FETCH_STATUS_PENDING, nextCheckAt: { lte: dueAt } },
      orderBy: { nextCheckAt: "asc" },
      take: limit,
      select: { company: { select: { orgNumber: true } } },
    });

    const refreshes =
      pending.length >= limit
        ? []
        : await prisma.structuredFinancialFetchState.findMany({
            where: {
              status: { not: STRUCTURED_FETCH_STATUS_PENDING },
              nextCheckAt: { lte: dueAt },
            },
            orderBy: { nextCheckAt: "asc" },
            take: limit - pending.length,
            select: { company: { select: { orgNumber: true } } },
          });

    const due = [...pending, ...refreshes];

    const result: DrainResult = {
      skipped: false,
      claimed: due.length,
      succeeded: 0,
      failed: 0,
      available: 0,
      unavailable: 0,
      durationMs: 0,
      companies: [],
    };

    for (const row of due) {
      const orgNumber = row.company.orgNumber;
      try {
        const ingestion = await ingestStructuredFinancialsForCompany(orgNumber);
        result.succeeded += 1;
        if (ingestion.available) result.available += 1;
        if (ingestion.status === "UNAVAILABLE") result.unavailable += 1;
        result.companies.push({
          orgNumber,
          status: ingestion.status,
          fiscalYears: ingestion.fiscalYears,
          errorCode: ingestion.errorCode,
        });
      } catch (error) {
        // The ingestion service already records ERROR state and backoff for
        // source failures; reaching here means something unexpected went wrong
        // for this company. Keep draining the rest of the queue.
        result.failed += 1;
        logRecoverableError("structured-financials-queue.drain", error, { orgNumber });
        result.companies.push({
          orgNumber,
          status: "ERROR",
          fiscalYears: [],
          errorCode: "DRAIN_FAILED",
        });
      }
    }

    result.durationMs = Date.now() - startedAt;
    return result;
  } finally {
    if (!options.withoutLease) {
      await releasePipelineJobLease({
        jobKey: STRUCTURED_FINANCIALS_QUEUE_JOB_KEY,
        leaseOwner,
      });
    }
  }
}
