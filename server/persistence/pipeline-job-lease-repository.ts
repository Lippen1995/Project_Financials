/**
 * Cooperative leases for background jobs.
 *
 * A lease lets one worker claim a named job so a second worker (another
 * process, a cron overlap, a second app instance) does not run it at the same
 * time. Leases expire, so a worker that dies without releasing does not block
 * the job forever.
 *
 * This lived in annual-report-ingestion-repository.ts, which is part of the
 * PDF/OCR estate being retired. The mechanism itself is source-agnostic and is
 * used by the structured Brreg ingestion queue, so it lives here instead. The
 * old module re-exports these to keep existing callers working.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function acquirePipelineJobLease(input: {
  jobKey: string;
  leaseOwner: string;
  leaseSeconds: number;
  metadata?: Prisma.InputJsonValue;
}) {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + input.leaseSeconds * 1000);

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.pipelineJobLease.findUnique({
        where: { jobKey: input.jobKey },
      });

      if (existing && existing.leaseExpiresAt > now && existing.leaseOwner !== input.leaseOwner) {
        return {
          acquired: false as const,
          lease: existing,
        };
      }

      const lease = existing
        ? await tx.pipelineJobLease.update({
            where: { id: existing.id },
            data: {
              leaseOwner: input.leaseOwner,
              leaseAcquiredAt: now,
              leaseExpiresAt,
              lastHeartbeatAt: now,
              metadata: input.metadata,
            },
          })
        : await tx.pipelineJobLease.create({
            data: {
              jobKey: input.jobKey,
              leaseOwner: input.leaseOwner,
              leaseAcquiredAt: now,
              leaseExpiresAt,
              lastHeartbeatAt: now,
              metadata: input.metadata,
            },
          });

      return {
        acquired: true as const,
        lease,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

export async function heartbeatPipelineJobLease(input: {
  jobKey: string;
  leaseOwner: string;
  leaseSeconds: number;
}) {
  const now = new Date();
  return prisma.pipelineJobLease.updateMany({
    where: {
      jobKey: input.jobKey,
      leaseOwner: input.leaseOwner,
    },
    data: {
      leaseExpiresAt: new Date(now.getTime() + input.leaseSeconds * 1000),
      lastHeartbeatAt: now,
    },
  });
}

export async function releasePipelineJobLease(input: {
  jobKey: string;
  leaseOwner: string;
}) {
  return prisma.pipelineJobLease.deleteMany({
    where: {
      jobKey: input.jobKey,
      leaseOwner: input.leaseOwner,
    },
  });
}
