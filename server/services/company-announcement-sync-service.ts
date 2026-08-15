import { prisma } from "@/lib/prisma";
import { logRecoverableError } from "@/lib/recoverable-error";
import { syncSource } from "@/server/news/company-event-ingestion-service";
import {
  acquirePipelineJobLease,
  releasePipelineJobLease,
} from "@/server/persistence/pipeline-job-lease-repository";

export const COMPANY_ANNOUNCEMENT_QUEUE_JOB_KEY = "company-announcement-queue";

const SOURCE_ID = "brreg-announcements";
const SUCCESS_REFRESH_MS = 60 * 60 * 1000;
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;

export type CompanyAnnouncementDrainOptions = {
  limit?: number;
  leaseOwner?: string;
  leaseSeconds?: number;
  withoutLease?: boolean;
  now?: () => Date;
};

export type CompanyAnnouncementDrainResult = {
  skipped: boolean;
  skippedReason?: string;
  claimed: number;
  succeeded: number;
  failed: number;
  companies: Array<{ orgNumber: string; status: "AVAILABLE" | "ERROR"; announcements: number }>;
};

function retryAt(now: Date, failureCount: number) {
  const delayMs = Math.min(MAX_BACKOFF_MS, 60_000 * 2 ** failureCount);
  return new Date(now.getTime() + delayMs);
}

export async function drainCompanyAnnouncementQueue(
  options: CompanyAnnouncementDrainOptions = {},
): Promise<CompanyAnnouncementDrainResult> {
  const now = options.now ?? (() => new Date());
  const limit = options.limit ?? 25;
  const leaseOwner = options.leaseOwner ?? `announcement-drain-${process.pid}`;
  const empty: CompanyAnnouncementDrainResult = {
    skipped: true,
    claimed: 0,
    succeeded: 0,
    failed: 0,
    companies: [],
  };

  if (!options.withoutLease) {
    const lease = await acquirePipelineJobLease({
      jobKey: COMPANY_ANNOUNCEMENT_QUEUE_JOB_KEY,
      leaseOwner,
      leaseSeconds: options.leaseSeconds ?? 15 * 60,
    });
    if (!lease.acquired) {
      return {
        ...empty,
        skippedReason: `Jobben kjører allerede (eier: ${lease.lease.leaseOwner}).`,
      };
    }
  }

  try {
    const dueAt = now();
    const due = await prisma.companyAnnouncementFetchState.findMany({
      where: { nextCheckAt: { lte: dueAt } },
      orderBy: [
        { status: "desc" },
        { nextCheckAt: "asc" },
      ],
      take: limit,
      select: {
        companyId: true,
        failureCount: true,
        company: { select: { orgNumber: true, name: true } },
      },
    });
    const result: CompanyAnnouncementDrainResult = {
      skipped: false,
      claimed: due.length,
      succeeded: 0,
      failed: 0,
      companies: [],
    };

    for (const row of due) {
      const checkedAt = now();
      const { orgNumber, name } = row.company;
      try {
        const sync = await syncSource(SOURCE_ID, {
          companyScopes: [{ companyId: row.companyId, orgNumber, name }],
        });
        const announcements = sync.documentsFetched;
        const available = announcements > 0 || sync.errors.length === 0;

        if (available) {
          await prisma.companyAnnouncementFetchState.update({
            where: { companyId: row.companyId },
            data: {
              status: "AVAILABLE",
              unavailableReason: null,
              lastCheckedAt: checkedAt,
              nextCheckAt: new Date(checkedAt.getTime() + SUCCESS_REFRESH_MS),
              failureCount: 0,
              lastErrorCode: null,
              announcementCount: announcements,
              sourceSystem: "BRREG",
              sourceEntityType: "announcementList",
              sourceId: orgNumber,
              fetchedAt: checkedAt,
              normalizedAt: checkedAt,
            },
          });
          result.succeeded += 1;
          result.companies.push({ orgNumber, status: "AVAILABLE", announcements });
          continue;
        }

        const failureCount = row.failureCount + 1;
        await prisma.companyAnnouncementFetchState.update({
          where: { companyId: row.companyId },
          data: {
            status: "ERROR",
            unavailableReason: sync.errors.join("; ").slice(0, 1000),
            lastCheckedAt: checkedAt,
            nextCheckAt: retryAt(checkedAt, failureCount),
            failureCount,
            lastErrorCode: "BRREG_ANNOUNCEMENTS_SYNC_FAILED",
            announcementCount: 0,
            sourceSystem: "BRREG",
            sourceEntityType: "announcementList",
            sourceId: orgNumber,
            fetchedAt: checkedAt,
            normalizedAt: checkedAt,
          },
        });
        result.failed += 1;
        result.companies.push({ orgNumber, status: "ERROR", announcements: 0 });
      } catch (error) {
        const failureCount = row.failureCount + 1;
        logRecoverableError("company-announcement-queue.drain", error, { orgNumber });
        await prisma.companyAnnouncementFetchState.update({
          where: { companyId: row.companyId },
          data: {
            status: "ERROR",
            unavailableReason: error instanceof Error ? error.message.slice(0, 1000) : "Ukjent synkfeil.",
            lastCheckedAt: checkedAt,
            nextCheckAt: retryAt(checkedAt, failureCount),
            failureCount,
            lastErrorCode: "BRREG_ANNOUNCEMENTS_SYNC_FAILED",
            fetchedAt: checkedAt,
            normalizedAt: checkedAt,
          },
        });
        result.failed += 1;
        result.companies.push({ orgNumber, status: "ERROR", announcements: 0 });
      }
    }

    return result;
  } finally {
    if (!options.withoutLease) {
      await releasePipelineJobLease({
        jobKey: COMPANY_ANNOUNCEMENT_QUEUE_JOB_KEY,
        leaseOwner,
      });
    }
  }
}
