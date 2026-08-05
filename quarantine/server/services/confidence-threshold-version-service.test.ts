import { describe, expect, it, vi, beforeEach } from "vitest";

const { prismaMock, store } = vi.hoisted(() => {
  type StoredVersion = {
    id: string;
    version: number;
    status: "PROPOSED" | "ACTIVE" | "RETIRED" | "REJECTED";
    configBlob: unknown;
    derivedFromReport: unknown;
    impactEstimate: unknown;
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
  let nextVersion = 1;
  let nextId = 1;

  const findRecord = (where: { id?: string; status?: string }) => {
    return records.find((r) => {
      if (where.id !== undefined && r.id !== where.id) return false;
      if (where.status !== undefined && r.status !== where.status) return false;
      return true;
    });
  };

  const prismaMock = {
    confidenceThresholdVersion: {
      findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
        const matches = records.filter((r) => {
          if (args.where.status && r.status !== args.where.status) return false;
          return true;
        });
        matches.sort((a, b) => b.version - a.version);
        return matches[0] ?? null;
      }),
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        return findRecord({ id: args.where.id }) ?? null;
      }),
      findMany: vi.fn(async (args: { where?: Record<string, unknown>; take?: number }) => {
        let matches = records;
        if (args.where?.status) {
          matches = records.filter((r) => r.status === args.where!.status);
        }
        return matches.slice(0, args.take ?? matches.length);
      }),
      create: vi.fn(async (args: { data: Partial<StoredVersion> }) => {
        const fresh: StoredVersion = {
          id: `tv-${nextId++}`,
          version: nextVersion++,
          status: (args.data.status as StoredVersion["status"]) ?? "PROPOSED",
          configBlob: args.data.configBlob ?? null,
          derivedFromReport: args.data.derivedFromReport ?? null,
          impactEstimate: args.data.impactEstimate ?? null,
          summary: args.data.summary ?? null,
          notes: args.data.notes ?? null,
          proposedAt: new Date(),
          appliedAt: args.data.appliedAt ?? null,
          appliedByUserId: args.data.appliedByUserId ?? null,
          retiredAt: null,
          rejectedAt: null,
          rejectedByUserId: null,
          rejectionReason: null,
        };
        records.push(fresh);
        return fresh;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const target = findRecord({ id: args.where.id });
        if (!target) throw new Error("not found");
        Object.assign(target, args.data);
        return target;
      }),
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const r of records) {
          if (args.where.status && r.status !== args.where.status) continue;
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
        nextVersion = 1;
        nextId = 1;
      },
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  applyThresholdVersion,
  ensureInitialThresholdVersionSeeded,
  getActiveGateConfig,
  getActiveThresholdVersion,
  listPendingThresholdProposals,
  proposeThresholdVersion,
  rejectThresholdVersion,
  ThresholdVersionStateError,
} from "@/server/services/confidence-threshold-version-service";
import { DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG } from "@/server/services/annual-report-unified-extraction-confidence-gate-service";

describe("confidence-threshold-version-service", () => {
  beforeEach(() => {
    store.reset();
    Object.values(prismaMock.confidenceThresholdVersion).forEach((fn) => {
      if (typeof fn === "function") (fn as { mockClear?: () => void }).mockClear?.();
    });
  });

  it("falls back to hard-coded defaults when no ACTIVE row exists", async () => {
    const config = await getActiveGateConfig();
    expect(config).toEqual(DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG);
  });

  it("ensureInitialThresholdVersionSeeded creates v1 with default config", async () => {
    const seeded = await ensureInitialThresholdVersionSeeded();
    expect(seeded.status).toBe("ACTIVE");
    expect(seeded.version).toBe(1);
    expect(seeded.configBlob).toEqual(DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG);
  });

  it("ensureInitialThresholdVersionSeeded is idempotent", async () => {
    const first = await ensureInitialThresholdVersionSeeded();
    const second = await ensureInitialThresholdVersionSeeded();
    expect(second.id).toBe(first.id);
    expect(store.records).toHaveLength(1);
  });

  it("proposeThresholdVersion stores a PROPOSED row without affecting active", async () => {
    await ensureInitialThresholdVersionSeeded();
    const proposed = await proposeThresholdVersion({
      configBlob: { ...DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG, minComparisonMatchRateForPass: 0.7 },
      summary: "Lower pass threshold",
    });

    expect(proposed.status).toBe("PROPOSED");
    const active = await getActiveThresholdVersion();
    expect(active?.version).toBe(1);
  });

  it("applyThresholdVersion atomically retires the previous active row", async () => {
    await ensureInitialThresholdVersionSeeded();
    const proposed = await proposeThresholdVersion({
      configBlob: { ...DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG, minComparisonMatchRateForPass: 0.7 },
      summary: "Lower pass threshold",
    });

    const applied = await applyThresholdVersion({
      versionId: proposed.id,
      appliedByUserId: "user-1",
    });

    expect(applied.status).toBe("ACTIVE");
    expect(applied.appliedByUserId).toBe("user-1");

    const allRecords = store.records;
    const activeCount = allRecords.filter((r) => r.status === "ACTIVE").length;
    expect(activeCount).toBe(1);
    const retired = allRecords.find((r) => r.status === "RETIRED");
    expect(retired?.version).toBe(1);
  });

  it("applyThresholdVersion refuses to activate an already-active row", async () => {
    await ensureInitialThresholdVersionSeeded();
    const active = await getActiveThresholdVersion();

    await expect(
      applyThresholdVersion({
        versionId: active!.id,
        appliedByUserId: "user-1",
      }),
    ).rejects.toBeInstanceOf(ThresholdVersionStateError);
  });

  it("rejectThresholdVersion moves a PROPOSED row to REJECTED with reason", async () => {
    const proposed = await proposeThresholdVersion({
      configBlob: DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG,
      summary: "Will be rejected",
    });

    const rejected = await rejectThresholdVersion({
      versionId: proposed.id,
      rejectedByUserId: "user-2",
      reason: "Too aggressive — sample too small",
    });

    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectedByUserId).toBe("user-2");
    expect(rejected.rejectionReason).toBe("Too aggressive — sample too small");
  });

  it("rejectThresholdVersion refuses to reject a non-PROPOSED row", async () => {
    await ensureInitialThresholdVersionSeeded();
    const active = await getActiveThresholdVersion();

    await expect(
      rejectThresholdVersion({
        versionId: active!.id,
        rejectedByUserId: "user-1",
        reason: "no",
      }),
    ).rejects.toBeInstanceOf(ThresholdVersionStateError);
  });

  it("listPendingThresholdProposals returns only PROPOSED rows", async () => {
    await ensureInitialThresholdVersionSeeded();
    await proposeThresholdVersion({
      configBlob: DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG,
      summary: "Proposal 1",
    });
    await proposeThresholdVersion({
      configBlob: DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG,
      summary: "Proposal 2",
    });

    const pending = await listPendingThresholdProposals();
    expect(pending).toHaveLength(2);
    expect(pending.every((p) => p.status === "PROPOSED")).toBe(true);
  });
});
