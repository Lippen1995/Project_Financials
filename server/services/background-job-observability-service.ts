import { prisma } from "@/lib/prisma";
import { logRecoverableError } from "@/lib/recoverable-error";

export type BackgroundJobRunSummary = {
  claimedCount: number;
  succeededCount: number;
  failedCount: number;
  skipped?: boolean;
};

export async function runObservedBackgroundJob<T>(input: {
  jobKey: string;
  execute: () => Promise<T>;
  summarize: (result: T) => BackgroundJobRunSummary;
  now?: () => Date;
}): Promise<T> {
  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const run = await prisma.backgroundJobRun.create({
    data: {
      jobKey: input.jobKey,
      status: "RUNNING",
      startedAt,
    },
    select: { id: true },
  });

  let result: T;
  try {
    result = await input.execute();
  } catch (error) {
    const completedAt = now();
    try {
      await prisma.backgroundJobRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage:
            error instanceof Error ? error.message.slice(0, 1000) : "Ukjent bakgrunnsjobbfeil.",
          completedAt,
          durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
        },
      });
    } catch (recordingError) {
      logRecoverableError("background-job-observability.fail", recordingError, {
        jobKey: input.jobKey,
        runId: run.id,
      });
    }
    throw error;
  }

  const completedAt = now();
  const summary = input.summarize(result);
  try {
    await prisma.backgroundJobRun.update({
      where: { id: run.id },
      data: {
        status: summary.skipped
          ? "SKIPPED"
          : summary.failedCount > 0
            ? "PARTIAL"
            : "COMPLETED",
        claimedCount: summary.claimedCount,
        succeededCount: summary.succeededCount,
        failedCount: summary.failedCount,
        completedAt,
        durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      },
    });
  } catch (recordingError) {
    logRecoverableError("background-job-observability.complete", recordingError, {
      jobKey: input.jobKey,
      runId: run.id,
    });
  }
  return result;
}
