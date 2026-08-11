import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultHealthScoreConfig } from "@/lib/health-score";

const prismaMocks = vi.hoisted(() => ({
  ruleFindMany: vi.fn(),
  modelFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    healthScoreModelIndustryRule: { findMany: prismaMocks.ruleFindMany },
    healthScoreModel: { findFirst: prismaMocks.modelFindFirst },
  },
}));

const { resolveHealthScoreModel } = await import("@/server/services/admin-health-score-service");

function rule(nacePrefix: string, key: string) {
  return {
    id: `rule-${nacePrefix}`,
    nacePrefix,
    modelId: `model-${key}`,
    note: null,
    createdAt: new Date(),
    model: {
      id: `model-${key}`,
      key,
      name: key.toUpperCase(),
      description: null,
      isFallback: false,
      active: true,
      config: defaultHealthScoreConfig(),
      version: 1,
      updatedByUserId: "u1",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

describe("resolveHealthScoreModel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMocks.ruleFindMany.mockResolvedValue([]);
    prismaMocks.modelFindFirst.mockResolvedValue(null);
  });

  it("queries every prefix of the company's NACE code, longest first", async () => {
    await resolveHealthScoreModel("68.209");

    const where = prismaMocks.ruleFindMany.mock.calls[0][0].where;
    expect(where.nacePrefix.in).toEqual(["68.209", "68.20", "68.2", "68", "6"]);
  });

  it("never proposes a prefix that ends on the separator", async () => {
    await resolveHealthScoreModel("68.2");

    const where = prismaMocks.ruleFindMany.mock.calls[0][0].where;
    expect(where.nacePrefix.in).not.toContain("68.");
  });

  it("picks the longest matching rule when several match", async () => {
    prismaMocks.ruleFindMany.mockResolvedValue([rule("68", "bred"), rule("68.20", "smal")]);

    const resolved = await resolveHealthScoreModel("68.209");

    expect(resolved.modelKey).toBe("smal");
    expect(resolved.matchedNacePrefix).toBe("68.20");
  });

  it("only considers rules on active models", async () => {
    await resolveHealthScoreModel("41.200");

    const where = prismaMocks.ruleFindMany.mock.calls[0][0].where;
    expect(where.model).toEqual({ active: true });
  });

  it("uses the fallback model when no rule matches", async () => {
    prismaMocks.modelFindFirst.mockResolvedValue({
      id: "model-standard",
      key: "standard",
      name: "Standardmodell",
      description: null,
      isFallback: true,
      active: true,
      config: defaultHealthScoreConfig(),
      version: 3,
      updatedByUserId: "u1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const resolved = await resolveHealthScoreModel("41.200");

    expect(resolved.modelKey).toBe("standard");
    expect(resolved.matchedNacePrefix).toBeNull();
  });

  it("skips the rule lookup entirely when the company has no NACE code", async () => {
    await resolveHealthScoreModel(null);

    expect(prismaMocks.ruleFindMany).not.toHaveBeenCalled();
  });

  it("falls back to the built-in model when the database holds none", async () => {
    const resolved = await resolveHealthScoreModel(null);

    expect(resolved.modelKey).toBe("innebygd-standard");
    expect(resolved.config.pillars).toHaveLength(6);
  });

  it("survives a stored config that no longer validates", async () => {
    prismaMocks.modelFindFirst.mockResolvedValue({
      id: "model-broken",
      key: "ødelagt",
      name: "Ødelagt modell",
      description: null,
      isFallback: true,
      active: true,
      config: { pillars: "not a list" },
      version: 1,
      updatedByUserId: "u1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const resolved = await resolveHealthScoreModel(null);

    // The company page must still render — it scores against the default rather
    // than throwing on a config that drifted.
    expect(resolved.modelKey).toBe("ødelagt");
    expect(resolved.config.pillars).toHaveLength(6);
  });
});
