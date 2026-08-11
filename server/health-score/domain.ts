import { z } from "zod";

import {
  HEALTH_PILLAR_KEYS,
  defaultHealthScoreConfig,
  healthMetricsByKey,
  type HealthScoreConfig,
} from "@/lib/health-score";

/**
 * Validation for admin-authored health-score models.
 *
 * The scoring engine in `lib/health-score` is pure and trusts its config, so
 * this is the only place a stored model is proven safe: weights are finite and
 * non-negative, curves are non-degenerate, and the rating bands actually cover
 * every score a company can get. A model that cannot be parsed is never applied
 * — the resolver falls back to the built-in default rather than scoring
 * companies with a half-valid config.
 */

const weight = z.number().finite().min(0).max(1000);
const score = z.number().finite().min(0).max(100);

const curvePointSchema = z
  .object({
    value: z.number().finite().min(-1_000_000_000).max(1_000_000_000),
    score,
  })
  .strict();

const curveSchema = z
  .array(curvePointSchema)
  .min(2, "En kurve trenger minst to punkter.")
  .max(12, "En kurve kan ha maks 12 punkter.")
  .superRefine((points, context) => {
    const values = points.map((point) => point.value);
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "To kurvepunkter kan ikke ha samme verdi.",
      });
    }
  });

const metricConfigSchema = z
  .object({
    key: z.string().trim().min(1).max(64),
    enabled: z.boolean(),
    weight,
    curve: curveSchema,
  })
  .strict()
  .superRefine((metric, context) => {
    if (!healthMetricsByKey.has(metric.key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["key"],
        message: `Ukjent nøkkeltall: ${metric.key}.`,
      });
    }
    if (metric.enabled && metric.weight <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weight"],
        message: "Et påslått nøkkeltall må ha vekt over null.",
      });
    }
  });

const pillarConfigSchema = z
  .object({
    key: z.enum(HEALTH_PILLAR_KEYS),
    enabled: z.boolean(),
    weight,
    metrics: z.array(metricConfigSchema).max(50),
  })
  .strict()
  .superRefine((pillar, context) => {
    const keys = pillar.metrics.map((metric) => metric.key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["metrics"],
        message: "Samme nøkkeltall er oppført flere ganger i dimensjonen.",
      });
    }
    for (const [index, metric] of pillar.metrics.entries()) {
      const definition = healthMetricsByKey.get(metric.key);
      if (definition && definition.pillar !== pillar.key) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["metrics", index, "key"],
          message: `${definition.label} hører til dimensjonen ${definition.pillar}, ikke ${pillar.key}.`,
        });
      }
    }
    if (pillar.enabled && pillar.weight <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weight"],
        message: "En påslått dimensjon må ha vekt over null.",
      });
    }
    if (pillar.enabled && pillar.metrics.every((metric) => !metric.enabled)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["metrics"],
        message: "En påslått dimensjon må ha minst ett påslått nøkkeltall.",
      });
    }
  });

const toneSchema = z.enum(["success", "warning", "error", "neutral"]);

const ratingBandSchema = z
  .object({
    grade: z.string().trim().min(1).max(4),
    minScore: score,
    label: z.string().trim().min(1).max(40),
    tone: toneSchema,
  })
  .strict();

const riskBandSchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    minScore: score,
    tone: toneSchema,
  })
  .strict();

const statusOverrideSchema = z
  .object({
    status: z.enum(["ACTIVE", "DISSOLVED", "BANKRUPT"]),
    capScore: score,
    forceGrade: z.string().trim().min(1).max(4).nullable(),
    forceRiskLabel: z.string().trim().min(1).max(40).nullable(),
  })
  .strict();

const coveragePenaltySchema = z
  .object({
    enabled: z.boolean(),
    strength: score,
    // A ceiling below 10 % would let a near-empty model count as fully covered.
    fullCoverageAt: z.number().finite().min(10).max(100),
  })
  .strict();

export const healthScoreConfigSchema = z
  .object({
    pillars: z.array(pillarConfigSchema).min(1).max(HEALTH_PILLAR_KEYS.length),
    ratingBands: z.array(ratingBandSchema).min(2).max(8),
    riskBands: z.array(riskBandSchema).min(2).max(8),
    statusOverrides: z.array(statusOverrideSchema).max(3),
    missingDataPolicy: z.enum(["renormalize", "zero", "neutral"]),
    // Optional so models saved before the penalty existed still parse; they
    // inherit the default rather than being rejected as invalid config.
    coveragePenalty: coveragePenaltySchema.default(
      () => defaultHealthScoreConfig().coveragePenalty,
    ),
    minimumCoverage: score,
  })
  .strict()
  .superRefine((config, context) => {
    const pillarKeys = config.pillars.map((pillar) => pillar.key);
    if (new Set(pillarKeys).size !== pillarKeys.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pillars"],
        message: "Samme dimensjon er oppført flere ganger.",
      });
    }
    if (config.pillars.every((pillar) => !pillar.enabled)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pillars"],
        message: "Minst én dimensjon må være påslått.",
      });
    }

    // A score of 0 has to land in a band; otherwise the UI shows "–" for the
    // worst companies, which is exactly when the rating matters most.
    if (!config.ratingBands.some((band) => band.minScore === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ratingBands"],
        message: "Den laveste karakteren må starte på 0 så hele skalaen er dekket.",
      });
    }
    if (!config.riskBands.some((band) => band.minScore === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["riskBands"],
        message: "Det laveste risikonivået må starte på 0 så hele skalaen er dekket.",
      });
    }

    const grades = config.ratingBands.map((band) => band.grade.toUpperCase());
    if (new Set(grades).size !== grades.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ratingBands"],
        message: "To karakterer kan ikke ha samme navn.",
      });
    }
    const cuts = config.ratingBands.map((band) => band.minScore);
    if (new Set(cuts).size !== cuts.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ratingBands"],
        message: "To karakterer kan ikke ha samme nedre grense.",
      });
    }

    const riskLabels = config.riskBands.map((band) => band.label.toLowerCase());
    if (new Set(riskLabels).size !== riskLabels.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["riskBands"],
        message: "To risikonivåer kan ikke ha samme navn.",
      });
    }

    const statuses = config.statusOverrides.map((override) => override.status);
    if (new Set(statuses).size !== statuses.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["statusOverrides"],
        message: "Samme registerstatus er overstyrt flere ganger.",
      });
    }
    for (const [index, override] of config.statusOverrides.entries()) {
      if (override.forceGrade && !grades.includes(override.forceGrade.toUpperCase())) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["statusOverrides", index, "forceGrade"],
          message: `Karakteren ${override.forceGrade} finnes ikke i karakterskalaen.`,
        });
      }
      if (
        override.forceRiskLabel &&
        !riskLabels.includes(override.forceRiskLabel.toLowerCase())
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["statusOverrides", index, "forceRiskLabel"],
          message: `Risikonivået ${override.forceRiskLabel} finnes ikke i risikoskalaen.`,
        });
      }
    }
  });

/** A NACE prefix as the admin types it: digits with optional dot groups. */
export const nacePrefixSchema = z
  .string()
  .trim()
  .min(1)
  .max(8)
  .regex(/^\d{1,2}(\.\d{1,3})?$/, "Bruk en NACE-kode som «68» eller «68.20».");

export const healthScoreModelInputSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9_-]*$/, "Nøkkelen kan bare inneholde små bokstaver, tall, - og _."),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).nullable(),
    active: z.boolean(),
    isFallback: z.boolean(),
    config: healthScoreConfigSchema,
    industryRules: z
      .array(
        z
          .object({
            nacePrefix: nacePrefixSchema,
            note: z.string().trim().max(200).nullable(),
          })
          .strict(),
      )
      .max(200)
      .superRefine((rules, context) => {
        const prefixes = rules.map((rule) => rule.nacePrefix);
        if (new Set(prefixes).size !== prefixes.length) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Samme NACE-kode er oppført flere ganger.",
          });
        }
      }),
  })
  .strict()
  .superRefine((model, context) => {
    if (model.isFallback && !model.active) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["active"],
        message: "Standardmodellen kan ikke være avslått — den brukes når ingen bransjeregel treffer.",
      });
    }
    if (model.isFallback && model.industryRules.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["industryRules"],
        message: "Standardmodellen gjelder alle bransjer uten regel, og skal ikke ha egne NACE-koder.",
      });
    }
  });

export type HealthScoreModelInput = z.infer<typeof healthScoreModelInputSchema>;

/**
 * Parses a stored `config` JSON blob. Returns the built-in default when the row
 * predates a catalog change or was written by an older shape — a company page
 * must never fail to render because a config drifted.
 */
export function parseStoredHealthScoreConfig(value: unknown): {
  config: HealthScoreConfig;
  valid: boolean;
} {
  const parsed = healthScoreConfigSchema.safeParse(value);
  if (parsed.success) return { config: parsed.data, valid: true };
  return { config: defaultHealthScoreConfig(), valid: false };
}

/**
 * Fills in metrics added to the catalog after a model was saved, so a new metric
 * shows up in the admin (switched off, at its default weight) instead of
 * silently disappearing from the editor.
 */
export function reconcileConfigWithCatalog(config: HealthScoreConfig): HealthScoreConfig {
  const fallback = defaultHealthScoreConfig();

  const pillars = fallback.pillars.map((defaultPillar) => {
    const stored = config.pillars.find((pillar) => pillar.key === defaultPillar.key);
    if (!stored) return defaultPillar;

    const metrics = defaultPillar.metrics.map((defaultMetric) => {
      const storedMetric = stored.metrics.find((metric) => metric.key === defaultMetric.key);
      if (!storedMetric) return { ...defaultMetric, enabled: false };
      return storedMetric;
    });

    return { ...stored, metrics };
  });

  return { ...config, pillars };
}
