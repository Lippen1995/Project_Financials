import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  ssbClassificationCode: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  ssbClassificationSyncState: {
    upsert: vi.fn(),
  },
}));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { syncSsbClassifications } from "@/server/services/ssb-classification-sync-service";

describe("syncSsbClassifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.ssbClassificationCode.deleteMany.mockResolvedValue({ count: 0 });
    tx.ssbClassificationCode.createMany.mockResolvedValue({ count: 1 });
    tx.ssbClassificationSyncState.upsert.mockResolvedValue({});
  });

  it("atomically replaces a classification with a versioned official dataset", async () => {
    const fetchClassificationCodes = vi.fn().mockResolvedValue([
      {
        code: "62.010",
        name: "Programmeringstjenester",
        shortName: "Programmering",
        parentCode: "62.01",
        level: "5",
        notes: null,
      },
    ]);

    const result = await syncSsbClassifications({
      classificationIds: ["6"],
      provider: { fetchClassificationCodes },
      now: () => new Date("2026-08-15T10:00:00.000Z"),
    });

    expect(result).toEqual({
      classifications: 1,
      codes: 1,
      datasetVersions: ["ssb-klass:6:2026-08-15"],
    });
    expect(tx.ssbClassificationCode.deleteMany).toHaveBeenCalledWith({
      where: { classificationId: "6" },
    });
    expect(tx.ssbClassificationCode.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        classificationId: "6",
        datasetVersion: "ssb-klass:6:2026-08-15",
        code: "62.010",
        sourceSystem: "SSB_KLASS",
        sourceId: "6:62.010",
      })],
    });
    expect(tx.ssbClassificationSyncState.upsert).toHaveBeenCalledWith({
      where: { classificationId: "6" },
      update: expect.objectContaining({
        datasetVersion: "ssb-klass:6:2026-08-15",
        sourceSystem: "SSB_KLASS",
        sourceEntityType: "classificationSnapshot",
        sourceId: "ssb-klass:6:2026-08-15",
      }),
      create: expect.any(Object),
    });
  });

  it("keeps the last good mirror when SSB returns no codes", async () => {
    const fetchClassificationCodes = vi.fn().mockResolvedValue([]);

    await expect(syncSsbClassifications({
      classificationIds: ["6"],
      provider: { fetchClassificationCodes },
      now: () => new Date("2026-08-15T10:00:00.000Z"),
    })).rejects.toThrow("SSB_KLASS_EMPTY_RESPONSE:6");

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(tx.ssbClassificationCode.deleteMany).not.toHaveBeenCalled();
  });
});
