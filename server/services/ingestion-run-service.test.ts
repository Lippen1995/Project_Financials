import { describe, expect, it, vi, beforeEach } from "vitest";

const { prismaMock, notifyMock, store } = vi.hoisted(() => {
  type StoredRun = {
    id: string;
    status: "RUNNING" | "COMPLETED" | "FAILED";
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
  const runs: StoredRun[] = [];
  let nextId = 1;

  const applyData = (run: StoredRun, data: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "increment" in value) {
        (run as Record<string, unknown>)[key] =
          ((run as unknown as Record<string, number>)[key] ?? 0) +
          (value as { increment: number }).increment;
      } else {
        (run as Record<string, unknown>)[key] = value;
      }
    }
  };

  const prismaMock = {
    ingestionRun: {
      create: vi.fn(async (args: { data: Partial<StoredRun> }) => {
        const fresh: StoredRun = {
          id: `run-${nextId++}`,
          status: (args.data.status as StoredRun["status"]) ?? "RUNNING",
          startedAt: new Date(),
          finishedAt: null,
          triggeredBy: args.data.triggeredBy ?? null,
          totalCompanies: args.data.totalCompanies ?? 0,
          totalFilings: 0,
          processedFilings: 0,
          publishedCount: 0,
          reviewCount: 0,
          failedCount: 0,
          notes: null,
        };
        runs.push(fresh);
        return fresh;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const run = runs.find((r) => r.id === args.where.id);
        if (!run) throw new Error("not found");
        applyData(run, args.data);
        return run;
      }),
      findFirst: vi.fn(async (args: { where?: { status?: string } }) => {
        let matches = args.where?.status
          ? runs.filter((r) => r.status === args.where!.status)
          : runs;
        matches = matches.slice().sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
        return matches[0] ?? null;
      }),
      findMany: vi.fn(async (args: { take?: number }) => {
        return runs
          .slice()
          .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
          .slice(0, args.take ?? runs.length);
      }),
    },
  };

  const notifyMock = vi.fn(async (_input: { type: string; dedupeKey: string }) => ({}));

  return {
    prismaMock,
    notifyMock,
    store: {
      runs,
      reset() {
        runs.length = 0;
        nextId = 1;
      },
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/server/services/admin-notification-service", () => ({
  createAdminNotificationIfMissing: notifyMock,
}));

import {
  completeIngestionRun,
  createIngestionRun,
  getCurrentIngestionRun,
  updateIngestionRunProgress,
} from "@/server/services/ingestion-run-service";

describe("ingestion-run-service", () => {
  beforeEach(() => {
    store.reset();
    notifyMock.mockClear();
  });

  it("creates a RUNNING run", async () => {
    const run = await createIngestionRun({ totalCompanies: 5, triggeredBy: "test" });
    expect(run.status).toBe("RUNNING");
    expect(run.totalCompanies).toBe(5);
    expect(run.processedFilings).toBe(0);
  });

  it("applies incremental progress deltas", async () => {
    const run = await createIngestionRun({ totalCompanies: 2 });
    await updateIngestionRunProgress(run.id, { totalFilings: 10 });
    await updateIngestionRunProgress(run.id, {
      processedFilingsDelta: 3,
      publishedCountDelta: 2,
      reviewCountDelta: 1,
    });
    await updateIngestionRunProgress(run.id, {
      processedFilingsDelta: 2,
      reviewCountDelta: 2,
    });

    const current = await getCurrentIngestionRun();
    expect(current?.totalFilings).toBe(10);
    expect(current?.processedFilings).toBe(5);
    expect(current?.publishedCount).toBe(2);
    expect(current?.reviewCount).toBe(3);
  });

  it("completes a run and raises an admin notification", async () => {
    const run = await createIngestionRun({ totalCompanies: 1 });
    await updateIngestionRunProgress(run.id, {
      processedFilingsDelta: 4,
      publishedCountDelta: 3,
      reviewCountDelta: 1,
    });

    const completed = await completeIngestionRun({
      runId: run.id,
      status: "COMPLETED",
      notes: "done",
    });

    expect(completed.status).toBe("COMPLETED");
    expect(completed.finishedAt).not.toBeNull();
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const arg = notifyMock.mock.calls[0]![0];
    expect(arg.type).toBe("INGESTION_COMPLETED");
    expect(arg.dedupeKey).toBe(`ingestion-run:${run.id}`);
  });

  it("getCurrentIngestionRun prefers the RUNNING run over a finished one", async () => {
    const first = await createIngestionRun({ totalCompanies: 1 });
    await completeIngestionRun({ runId: first.id, status: "COMPLETED" });
    const second = await createIngestionRun({ totalCompanies: 1 });

    const current = await getCurrentIngestionRun();
    expect(current?.id).toBe(second.id);
    expect(current?.status).toBe("RUNNING");
  });

  it("getCurrentIngestionRun falls back to the latest finished run", async () => {
    const run = await createIngestionRun({ totalCompanies: 1 });
    await completeIngestionRun({ runId: run.id, status: "COMPLETED" });

    const current = await getCurrentIngestionRun();
    expect(current?.id).toBe(run.id);
    expect(current?.status).toBe("COMPLETED");
  });

  it("completion does not throw when the notification fails", async () => {
    notifyMock.mockRejectedValueOnce(new Error("bell down"));
    const run = await createIngestionRun({ totalCompanies: 1 });
    const completed = await completeIngestionRun({ runId: run.id, status: "COMPLETED" });
    expect(completed.status).toBe("COMPLETED");
  });
});
