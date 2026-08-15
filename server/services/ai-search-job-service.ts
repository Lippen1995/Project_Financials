import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { POST as executeAiSearchRoute } from "@/app/api/ai-search/route";
import env from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { logRecoverableError } from "@/lib/recoverable-error";
import {
  acquirePipelineJobLease,
  releasePipelineJobLease,
} from "@/server/persistence/pipeline-job-lease-repository";

export const AI_SEARCH_JOB_KEY = "ai-search-jobs";
const MAX_ATTEMPTS = 3;
const STALE_RUNNING_MS = 20 * 60 * 1_000;
const MAX_RETRY_DELAY_MS = 15 * 60 * 1_000;

export type AiSearchDrainOptions = {
  limit?: number;
  leaseOwner?: string;
  leaseSeconds?: number;
  withoutLease?: boolean;
  now?: () => Date;
};

function retryAt(now: Date, attempt: number) {
  const delayMs = Math.min(MAX_RETRY_DELAY_MS, 30_000 * 2 ** Math.max(0, attempt - 1));
  return new Date(now.getTime() + delayMs);
}

function isRetriableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function drainAiSearchJobs(options: AiSearchDrainOptions = {}) {
  const leaseOwner = options.leaseOwner ?? `ai-search-${process.pid}`;
  const now = options.now ?? (() => new Date());
  const empty = { skipped: true, recovered: 0, claimed: 0, completed: 0, retried: 0, failed: 0 };

  if (!options.withoutLease) {
    const lease = await acquirePipelineJobLease({
      jobKey: AI_SEARCH_JOB_KEY,
      leaseOwner,
      leaseSeconds: options.leaseSeconds ?? 15 * 60,
    });
    if (!lease.acquired) {
      return { ...empty, skippedReason: `Jobben kjører allerede (eier: ${lease.lease.leaseOwner}).` };
    }
  }

  try {
    const dueAt = now();
    const staleBefore = new Date(dueAt.getTime() - STALE_RUNNING_MS);
    const exhausted = await prisma.aiSearchJob.updateMany({
      where: {
        status: "RUNNING",
        startedAt: { lte: staleBefore },
        attemptCount: { gte: MAX_ATTEMPTS },
      },
      data: {
        status: "FAILED",
        errorMessage: "AI-jobben stoppet under kjøring og nådde maks antall forsøk.",
        completedAt: dueAt,
      },
    });
    const recovered = await prisma.aiSearchJob.updateMany({
      where: {
        status: "RUNNING",
        startedAt: { lte: staleBefore },
        attemptCount: { lt: MAX_ATTEMPTS },
      },
      data: {
        status: "PENDING",
        errorMessage: "Forrige worker stoppet; jobben er satt tilbake i kø.",
        nextAttemptAt: dueAt,
        startedAt: null,
        completedAt: null,
      },
    });

    const jobs = await prisma.aiSearchJob.findMany({
      where: { status: "PENDING", nextAttemptAt: { lte: dueAt } },
      orderBy: { createdAt: "asc" },
      take: options.limit ?? 10,
      select: {
        id: true,
        userId: true,
        query: true,
        analysisId: true,
        attemptCount: true,
      },
    });
    const result = {
      skipped: false,
      recovered: recovered.count,
      claimed: jobs.length,
      completed: 0,
      retried: 0,
      failed: exhausted.count,
    };

    for (const job of jobs) {
      const startedAt = now();
      const attempt = job.attemptCount + 1;
      await prisma.aiSearchJob.update({
        where: { id: job.id },
        data: {
          status: "RUNNING",
          startedAt,
          attemptCount: attempt,
          errorMessage: null,
        },
      });

      try {
        const request = new NextRequest("http://localhost/api/ai-search/worker", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${env.cronSecret}`,
          },
          body: JSON.stringify({
            userId: job.userId,
            query: job.query,
            ...(job.analysisId ? { analysisId: job.analysisId } : {}),
          }),
        });
        const response = await executeAiSearchRoute(request);
        const payload = await response.json() as Record<string, unknown>;
        const completedAt = now();

        if (response.status >= 200 && response.status < 300) {
          await prisma.aiSearchJob.update({
            where: { id: job.id },
            data: {
              status: "COMPLETED",
              result: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
              errorMessage: null,
              completedAt,
            },
          });
          result.completed += 1;
        } else {
          const message = typeof payload.error === "string" ? payload.error : "AI-søket kunne ikke fullføres.";
          const retry = isRetriableStatus(response.status) && attempt < MAX_ATTEMPTS;
          await prisma.aiSearchJob.update({
            where: { id: job.id },
            data: retry
              ? {
                  status: "PENDING",
                  result: Prisma.JsonNull,
                  errorMessage: message.slice(0, 1000),
                  nextAttemptAt: retryAt(completedAt, attempt),
                  startedAt: null,
                  completedAt: null,
                }
              : {
                  status: "FAILED",
                  result: Prisma.JsonNull,
                  errorMessage: message.slice(0, 1000),
                  completedAt,
                },
          });
          if (retry) result.retried += 1;
          else result.failed += 1;
        }
      } catch (error) {
        logRecoverableError("ai-search-job.execute", error, { jobId: job.id });
        const failedAt = now();
        const retry = attempt < MAX_ATTEMPTS;
        await prisma.aiSearchJob.update({
          where: { id: job.id },
          data: retry
            ? {
                status: "PENDING",
                result: Prisma.JsonNull,
                errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Ukjent AI-jobbfeil.",
                nextAttemptAt: retryAt(failedAt, attempt),
                startedAt: null,
                completedAt: null,
              }
            : {
                status: "FAILED",
                result: Prisma.JsonNull,
                errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Ukjent AI-jobbfeil.",
                completedAt: failedAt,
              },
        });
        if (retry) result.retried += 1;
        else result.failed += 1;
      }
    }

    return result;
  } finally {
    if (!options.withoutLease) {
      await releasePipelineJobLease({ jobKey: AI_SEARCH_JOB_KEY, leaseOwner });
    }
  }
}
