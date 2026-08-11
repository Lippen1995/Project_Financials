import { describe, expect, it } from "vitest";

import { defaultHealthScoreConfig, type HealthScoreConfig } from "@/lib/health-score";
import {
  healthScoreConfigSchema,
  healthScoreModelInputSchema,
  parseStoredHealthScoreConfig,
  reconcileConfigWithCatalog,
} from "@/server/health-score/domain";

function config(patch: (draft: HealthScoreConfig) => HealthScoreConfig): HealthScoreConfig {
  return patch(defaultHealthScoreConfig());
}

describe("healthScoreConfigSchema", () => {
  it("accepts the built-in default", () => {
    expect(healthScoreConfigSchema.safeParse(defaultHealthScoreConfig()).success).toBe(true);
  });

  it("rejects a rating scale that leaves the bottom of the range uncovered", () => {
    const parsed = healthScoreConfigSchema.safeParse(
      config((draft) => ({
        ...draft,
        ratingBands: draft.ratingBands.map((band) =>
          band.minScore === 0 ? { ...band, minScore: 20 } : band,
        ),
      })),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects a risk scale that leaves the bottom of the range uncovered", () => {
    const parsed = healthScoreConfigSchema.safeParse(
      config((draft) => ({
        ...draft,
        riskBands: draft.riskBands.map((band) =>
          band.minScore === 0 ? { ...band, minScore: 10 } : band,
        ),
      })),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects an override that forces a grade the scale does not contain", () => {
    const parsed = healthScoreConfigSchema.safeParse(
      config((draft) => ({
        ...draft,
        statusOverrides: [
          { status: "BANKRUPT", capScore: 10, forceGrade: "Z", forceRiskLabel: null },
        ],
      })),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown metric key", () => {
    const parsed = healthScoreConfigSchema.safeParse(
      config((draft) => ({
        ...draft,
        pillars: draft.pillars.map((pillar, index) =>
          index === 0
            ? {
                ...pillar,
                metrics: [
                  ...pillar.metrics,
                  { key: "made_up_metric", enabled: true, weight: 10, curve: [{ value: 0, score: 0 }, { value: 1, score: 100 }] },
                ],
              }
            : pillar,
        ),
      })),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects a metric filed under the wrong pillar", () => {
    const parsed = healthScoreConfigSchema.safeParse(
      config((draft) => ({
        ...draft,
        pillars: draft.pillars.map((pillar) =>
          pillar.key === "VEKST"
            ? {
                ...pillar,
                metrics: [
                  ...pillar.metrics,
                  {
                    key: "equity_ratio",
                    enabled: true,
                    weight: 10,
                    curve: [
                      { value: 0, score: 0 },
                      { value: 100, score: 100 },
                    ],
                  },
                ],
              }
            : pillar,
        ),
      })),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects a curve with fewer than two points", () => {
    const parsed = healthScoreConfigSchema.safeParse(
      config((draft) => ({
        ...draft,
        pillars: draft.pillars.map((pillar, index) =>
          index === 0
            ? {
                ...pillar,
                metrics: pillar.metrics.map((metric, position) =>
                  position === 0 ? { ...metric, curve: [{ value: 0, score: 50 }] } : metric,
                ),
              }
            : pillar,
        ),
      })),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects an enabled pillar with no enabled metric", () => {
    const parsed = healthScoreConfigSchema.safeParse(
      config((draft) => ({
        ...draft,
        pillars: draft.pillars.map((pillar, index) =>
          index === 0
            ? { ...pillar, metrics: pillar.metrics.map((metric) => ({ ...metric, enabled: false })) }
            : pillar,
        ),
      })),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects an enabled pillar carrying no weight", () => {
    const parsed = healthScoreConfigSchema.safeParse(
      config((draft) => ({
        ...draft,
        pillars: draft.pillars.map((pillar, index) =>
          index === 0 ? { ...pillar, weight: 0 } : pillar,
        ),
      })),
    );

    expect(parsed.success).toBe(false);
  });

  it("accepts a config saved before the coverage penalty existed, filling the default", () => {
    const legacy = defaultHealthScoreConfig() as Partial<HealthScoreConfig>;
    delete legacy.coveragePenalty;

    const parsed = healthScoreConfigSchema.safeParse(legacy);

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.coveragePenalty.enabled).toBe(true);
  });

  it("rejects a full-coverage mark low enough to make a near-empty model look complete", () => {
    const parsed = healthScoreConfigSchema.safeParse(
      config((draft) => ({
        ...draft,
        coveragePenalty: { ...draft.coveragePenalty, fullCoverageAt: 2 },
      })),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects a penalty strength outside 0–100", () => {
    const parsed = healthScoreConfigSchema.safeParse(
      config((draft) => ({
        ...draft,
        coveragePenalty: { ...draft.coveragePenalty, strength: 250 },
      })),
    );

    expect(parsed.success).toBe(false);
  });

  it("allows a disabled pillar to keep a zero weight", () => {
    const parsed = healthScoreConfigSchema.safeParse(
      config((draft) => ({
        ...draft,
        pillars: draft.pillars.map((pillar, index) =>
          index === 0 ? { ...pillar, enabled: false, weight: 0 } : pillar,
        ),
      })),
    );

    expect(parsed.success).toBe(true);
  });
});

describe("healthScoreModelInputSchema", () => {
  const base = {
    key: "eiendom",
    name: "Eiendom",
    description: null,
    active: true,
    isFallback: false,
    config: defaultHealthScoreConfig(),
    industryRules: [{ nacePrefix: "68.20", note: null }],
  };

  it("accepts a valid industry-bound model", () => {
    expect(healthScoreModelInputSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a NACE prefix that is not a code", () => {
    const parsed = healthScoreModelInputSchema.safeParse({
      ...base,
      industryRules: [{ nacePrefix: "eiendom", note: null }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects the same NACE prefix twice", () => {
    const parsed = healthScoreModelInputSchema.safeParse({
      ...base,
      industryRules: [
        { nacePrefix: "68.20", note: null },
        { nacePrefix: "68.20", note: "duplikat" },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a fallback model that carries its own industry rules", () => {
    const parsed = healthScoreModelInputSchema.safeParse({ ...base, isFallback: true });
    expect(parsed.success).toBe(false);
  });

  it("rejects an inactive fallback model", () => {
    const parsed = healthScoreModelInputSchema.safeParse({
      ...base,
      isFallback: true,
      active: false,
      industryRules: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a key with characters that would break the URL", () => {
    const parsed = healthScoreModelInputSchema.safeParse({ ...base, key: "Eiendom Norge" });
    expect(parsed.success).toBe(false);
  });
});

describe("parseStoredHealthScoreConfig", () => {
  it("falls back to the default when the stored blob is unusable", () => {
    const { config: parsed, valid } = parseStoredHealthScoreConfig({ pillars: "nope" });

    expect(valid).toBe(false);
    expect(parsed.pillars).toHaveLength(6);
  });

  it("keeps a valid stored config as-is", () => {
    const stored = defaultHealthScoreConfig();
    const { config: parsed, valid } = parseStoredHealthScoreConfig(stored);

    expect(valid).toBe(true);
    expect(parsed.minimumCoverage).toBe(stored.minimumCoverage);
  });
});

describe("reconcileConfigWithCatalog", () => {
  it("re-adds a metric the stored config predates, switched off", () => {
    const stored = defaultHealthScoreConfig();
    stored.pillars = stored.pillars.map((pillar) =>
      pillar.key === "SOLIDITET"
        ? { ...pillar, metrics: pillar.metrics.filter((metric) => metric.key !== "quick_ratio" && metric.key !== "interest_coverage") }
        : pillar,
    );

    const reconciled = reconcileConfigWithCatalog(stored);
    const soliditet = reconciled.pillars.find((pillar) => pillar.key === "SOLIDITET");
    const restored = soliditet?.metrics.find((metric) => metric.key === "interest_coverage");

    expect(restored).toBeDefined();
    expect(restored?.enabled).toBe(false);
  });

  it("preserves the admin's weights for metrics that were already configured", () => {
    const stored = defaultHealthScoreConfig();
    stored.pillars = stored.pillars.map((pillar) =>
      pillar.key === "SOLIDITET"
        ? {
            ...pillar,
            weight: 77,
            metrics: pillar.metrics.map((metric) =>
              metric.key === "equity_ratio" ? { ...metric, weight: 99 } : metric,
            ),
          }
        : pillar,
    );

    const reconciled = reconcileConfigWithCatalog(stored);
    const soliditet = reconciled.pillars.find((pillar) => pillar.key === "SOLIDITET");

    expect(soliditet?.weight).toBe(77);
    expect(soliditet?.metrics.find((metric) => metric.key === "equity_ratio")?.weight).toBe(99);
  });
});
