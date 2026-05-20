import { describe, expect, it, vi, beforeEach } from "vitest";

const { prismaMock, store } = vi.hoisted(() => {
  type StoredVersion = {
    id: string;
    taskType: string;
    taskVersion: number;
    status: "PROPOSED" | "ACTIVE" | "RETIRED" | "REJECTED";
    algorithm: string;
    binaryPath: string;
    evaluationMetrics: unknown;
    trainingDataSnapshot: unknown;
    summary: string | null;
    notes: string | null;
    proposedAt: Date;
    appliedAt: Date | null;
    appliedByUserId: string | null;
    retiredAt: Date | null;
    rejectedAt: Date | null;
    rejectedByUserId: string | null;
    rejectionReason: string | null;
  };
  const records: StoredVersion[] = [];
  let nextId = 1;

  const matchesWhere = (r: StoredVersion, where: Record<string, unknown>): boolean => {
    if (where.id !== undefined && r.id !== where.id) return false;
    if (where.taskType !== undefined && r.taskType !== where.taskType) return false;
    if (where.status !== undefined && r.status !== where.status) return false;
    return true;
  };

  const prismaMock = {
    mlModelVersion: {
      findFirst: vi.fn(async (args: { where: Record<string, unknown>; orderBy?: Record<string, "asc" | "desc"> }) => {
        let matches = records.filter((r) => matchesWhere(r, args.where));
        if (args.orderBy?.taskVersion === "desc") {
          matches = matches.slice().sort((a, b) => b.taskVersion - a.taskVersion);
        }
        return matches[0] ?? null;
      }),
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        return records.find((r) => r.id === args.where.id) ?? null;
      }),
      findMany: vi.fn(async (args: { where?: Record<string, unknown>; take?: number; orderBy?: Record<string, "asc" | "desc"> }) => {
        let matches = args.where ? records.filter((r) => matchesWhere(r, args.where!)) : records;
        if (args.orderBy?.taskVersion === "desc") matches = matches.slice().sort((a, b) => b.taskVersion - a.taskVersion);
        if (args.orderBy?.proposedAt === "desc") matches = matches.slice().sort((a, b) => b.proposedAt.getTime() - a.proposedAt.getTime());
        return matches.slice(0, args.take ?? matches.length);
      }),
      create: vi.fn(async (args: { data: Partial<StoredVersion> }) => {
        const fresh: StoredVersion = {
          id: `mv-${nextId++}`,
          taskType: args.data.taskType as string,
          taskVersion: args.data.taskVersion as number,
          status: (args.data.status as StoredVersion["status"]) ?? "PROPOSED",
          algorithm: (args.data.algorithm as string) ?? "tfidf+logreg",
          binaryPath: (args.data.binaryPath as string) ?? "/models/x.joblib",
          evaluationMetrics: args.data.evaluationMetrics ?? null,
          trainingDataSnapshot: args.data.trainingDataSnapshot ?? null,
          summary: (args.data.summary as string | null) ?? null,
          notes: (args.data.notes as string | null) ?? null,
          proposedAt: new Date(),
          appliedAt: (args.data.appliedAt as Date | null) ?? null,
          appliedByUserId: (args.data.appliedByUserId as string | null) ?? null,
          retiredAt: null,
          rejectedAt: null,
          rejectedByUserId: null,
          rejectionReason: null,
        };
        records.push(fresh);
        return fresh;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const target = records.find((r) => r.id === args.where.id);
        if (!target) throw new Error("not found");
        Object.assign(target, args.data);
        return target;
      }),
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const r of records) {
          if (!matchesWhere(r, args.where)) continue;
          Object.assign(r, args.data);
          count++;
        }
        return { count };
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
  };

  return {
    prismaMock,
    store: {
      records,
      reset() {
        records.length = 0;
        nextId = 1;
      },
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  ModelVersionStateError,
  applyModelVersion,
  getActiveModelForTask,
  listAllActiveModels,
  listPendingModelProposals,
  proposeModelVersion,
  rejectModelVersion,
} from "@/server/services/ml-model-version-service";

describe("ml-model-version-service", () => {
  beforeEach(() => {
    store.reset();
  });

  it("proposeModelVersion assigns the next taskVersion per task type", async () => {
    const first = await proposeModelVersion({
      taskType: "UNIT_SCALE_CLASSIFIER",
      algorithm: "tfidf+logreg",
      binaryPath: "/models/unit_v1.joblib",
    });
    const second = await proposeModelVersion({
      taskType: "UNIT_SCALE_CLASSIFIER",
      algorithm: "tfidf+logreg",
      binaryPath: "/models/unit_v2.joblib",
    });
    const other = await proposeModelVersion({
      taskType: "PAGE_TYPE_CLASSIFIER",
      algorithm: "tfidf+logreg",
      binaryPath: "/models/page_v1.joblib",
    });

    expect(first.taskVersion).toBe(1);
    expect(second.taskVersion).toBe(2);
    expect(other.taskVersion).toBe(1);
  });

  it("applyModelVersion retires the previous active model of the same task", async () => {
    const v1 = await proposeModelVersion({
      taskType: "UNIT_SCALE_CLASSIFIER",
      algorithm: "tfidf+logreg",
      binaryPath: "/models/v1.joblib",
    });
    await applyModelVersion({ versionId: v1.id, appliedByUserId: "user-1" });

    const v2 = await proposeModelVersion({
      taskType: "UNIT_SCALE_CLASSIFIER",
      algorithm: "tfidf+logreg",
      binaryPath: "/models/v2.joblib",
    });
    const activated = await applyModelVersion({ versionId: v2.id, appliedByUserId: "user-2" });

    expect(activated.status).toBe("ACTIVE");
    expect(activated.taskVersion).toBe(2);
    const previous = store.records.find((r) => r.id === v1.id);
    expect(previous?.status).toBe("RETIRED");

    const active = await getActiveModelForTask("UNIT_SCALE_CLASSIFIER");
    expect(active?.taskVersion).toBe(2);
  });

  it("applyModelVersion does not affect other task types", async () => {
    const unit = await proposeModelVersion({
      taskType: "UNIT_SCALE_CLASSIFIER",
      algorithm: "tfidf+logreg",
      binaryPath: "/models/unit.joblib",
    });
    await applyModelVersion({ versionId: unit.id, appliedByUserId: "user-1" });

    const page = await proposeModelVersion({
      taskType: "PAGE_TYPE_CLASSIFIER",
      algorithm: "tfidf+logreg",
      binaryPath: "/models/page.joblib",
    });
    await applyModelVersion({ versionId: page.id, appliedByUserId: "user-1" });

    const unitActive = await getActiveModelForTask("UNIT_SCALE_CLASSIFIER");
    expect(unitActive?.taskVersion).toBe(1);
    expect(unitActive?.status).toBe("ACTIVE");
  });

  it("applyModelVersion refuses to apply a non-PROPOSED row", async () => {
    const v = await proposeModelVersion({
      taskType: "UNIT_SCALE_CLASSIFIER",
      algorithm: "tfidf+logreg",
      binaryPath: "/models/v.joblib",
    });
    await applyModelVersion({ versionId: v.id, appliedByUserId: "user-1" });

    await expect(
      applyModelVersion({ versionId: v.id, appliedByUserId: "user-1" }),
    ).rejects.toBeInstanceOf(ModelVersionStateError);
  });

  it("rejectModelVersion records reason and prevents future activation", async () => {
    const v = await proposeModelVersion({
      taskType: "UNIT_SCALE_CLASSIFIER",
      algorithm: "tfidf+logreg",
      binaryPath: "/models/v.joblib",
    });
    const rejected = await rejectModelVersion({
      versionId: v.id,
      rejectedByUserId: "user-1",
      reason: "F1 < baseline",
    });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectionReason).toBe("F1 < baseline");

    await expect(
      applyModelVersion({ versionId: v.id, appliedByUserId: "user-1" }),
    ).rejects.toBeInstanceOf(ModelVersionStateError);
  });

  it("listAllActiveModels returns one row per active task type", async () => {
    const a = await proposeModelVersion({
      taskType: "UNIT_SCALE_CLASSIFIER",
      algorithm: "tfidf+logreg",
      binaryPath: "/models/a.joblib",
    });
    await applyModelVersion({ versionId: a.id, appliedByUserId: "user-1" });
    const b = await proposeModelVersion({
      taskType: "PAGE_TYPE_CLASSIFIER",
      algorithm: "tfidf+logreg",
      binaryPath: "/models/b.joblib",
    });
    await applyModelVersion({ versionId: b.id, appliedByUserId: "user-1" });

    const all = await listAllActiveModels();
    expect(all).toHaveLength(2);
  });

  it("listPendingModelProposals only returns PROPOSED rows", async () => {
    await proposeModelVersion({
      taskType: "UNIT_SCALE_CLASSIFIER",
      algorithm: "tfidf+logreg",
      binaryPath: "/models/a.joblib",
    });
    const second = await proposeModelVersion({
      taskType: "UNIT_SCALE_CLASSIFIER",
      algorithm: "tfidf+logreg",
      binaryPath: "/models/b.joblib",
    });
    await rejectModelVersion({
      versionId: second.id,
      rejectedByUserId: "user-1",
      reason: "test",
    });

    const pending = await listPendingModelProposals();
    expect(pending).toHaveLength(1);
  });
});
