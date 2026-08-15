import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  ssbClassificationCode: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { SsbClassificationRepository } from "@/server/registry/ssb-classification-repository";

describe("SsbClassificationRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads an industry code from the local SSB dataset without network access", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("network access is forbidden on request paths"),
    );
    prismaMock.ssbClassificationCode.findUnique.mockResolvedValue({
      classificationId: "6",
      code: "62.010",
      name: "Programmeringstjenester",
      shortName: "Programmering",
      parentCode: "62.01",
      level: "5",
      notes: null,
      sourceSystem: "SSB_KLASS",
      sourceEntityType: "classificationCode",
      sourceId: "6:62.010",
      fetchedAt: new Date("2026-08-15T08:00:00.000Z"),
      normalizedAt: new Date("2026-08-15T08:00:01.000Z"),
      rawPayload: null,
    });

    const result = await new SsbClassificationRepository().getIndustryCode("62.010");

    expect(result).toEqual(expect.objectContaining({
      code: "62.010",
      title: "Programmeringstjenester",
      description: "Programmering",
      parentCode: "62.01",
      sourceSystem: "SSB_KLASS",
      sourceId: "6:62.010",
    }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("searches the locally stored industry classification", async () => {
    prismaMock.ssbClassificationCode.findMany.mockResolvedValue([
      {
        classificationId: "6",
        code: "35.112",
        name: "Produksjon av elektrisitet fra vindkraft",
        shortName: "Vindkraftproduksjon",
        parentCode: "35.11",
        level: "5",
        notes: "Omfatter produksjon fra vindkraftverk.",
        sourceSystem: "SSB_KLASS",
        sourceEntityType: "classificationCode",
        sourceId: "6:35.112",
        fetchedAt: new Date("2026-08-15T08:00:00.000Z"),
        normalizedAt: new Date("2026-08-15T08:00:01.000Z"),
        rawPayload: null,
      },
      {
        classificationId: "6",
        code: "62.010",
        name: "Programmeringstjenester",
        shortName: null,
        parentCode: "62.01",
        level: "5",
        notes: null,
        sourceSystem: "SSB_KLASS",
        sourceEntityType: "classificationCode",
        sourceId: "6:62.010",
        fetchedAt: new Date("2026-08-15T08:00:00.000Z"),
        normalizedAt: new Date("2026-08-15T08:00:01.000Z"),
        rawPayload: null,
      },
    ]);

    const results = await new SsbClassificationRepository().searchIndustryCodes(
      ["vindkraft"],
      3,
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(expect.objectContaining({
      code: "35.112",
      title: "Produksjon av elektrisitet fra vindkraft",
      score: expect.any(Number),
    }));
  });

  it("resolves counties and their municipalities from local classifications", async () => {
    prismaMock.ssbClassificationCode.findMany.mockResolvedValue([
      {
        classificationId: "104",
        code: "46",
        name: "Vestland",
        shortName: null,
        parentCode: null,
        level: "1",
        notes: null,
        sourceSystem: "SSB_KLASS",
        sourceEntityType: "classificationCode",
        sourceId: "104:46",
        fetchedAt: new Date("2026-08-15T08:00:00.000Z"),
        normalizedAt: new Date("2026-08-15T08:00:01.000Z"),
        rawPayload: null,
      },
      {
        classificationId: "131",
        code: "4601",
        name: "Bergen",
        shortName: null,
        parentCode: "46",
        level: "1",
        notes: null,
        sourceSystem: "SSB_KLASS",
        sourceEntityType: "classificationCode",
        sourceId: "131:4601",
        fetchedAt: new Date("2026-08-15T08:00:00.000Z"),
        normalizedAt: new Date("2026-08-15T08:00:01.000Z"),
        rawPayload: null,
      },
    ]);

    const result = await new SsbClassificationRepository().resolveGeography(
      "Vestland",
      "COUNTY",
    );

    expect(result).toEqual({
      type: "COUNTY",
      label: "Vestland",
      municipalityCodes: ["4601"],
    });
  });
});
