import { describe, expect, it } from "vitest";

import {
  buildHealthFacts,
  computeHealthScore,
  defaultHealthScoreConfig,
  healthMetricCatalog,
  healthMetricsForPillar,
  scoreCompanyHealth,
  scoreOnCurve,
  type HealthFacts,
  type HealthScoreConfig,
} from "@/lib/health-score";
import type { NormalizedFinancialStatement } from "@/lib/types";

function statement(
  partial: Partial<NormalizedFinancialStatement> & { fiscalYear: number },
): NormalizedFinancialStatement {
  return {
    currency: "NOK",
    sourceSystem: "BRREG",
    sourceEntityType: "REGNSKAP",
    sourceId: `test-${partial.fiscalYear}`,
    fetchedAt: new Date("2026-01-01"),
    normalizedAt: new Date("2026-01-01"),
    ...partial,
  } as NormalizedFinancialStatement;
}

const company = { status: "ACTIVE" as const, employeeCount: 10, foundedAt: new Date("2010-01-01"), lastSubmittedAnnualReportYear: 2024 };

/** A config with a single metric, so a test can assert on one curve at a time. */
function singleMetricConfig(
  metricKey: string,
  overrides: Partial<HealthScoreConfig> = {},
): HealthScoreConfig {
  const base = defaultHealthScoreConfig();
  const definition = healthMetricCatalog.find((metric) => metric.key === metricKey);
  if (!definition) throw new Error(`unknown metric ${metricKey}`);

  return {
    ...base,
    pillars: base.pillars.map((pillar) => ({
      ...pillar,
      enabled: pillar.key === definition.pillar,
      metrics: pillar.metrics.map((metric) => ({ ...metric, enabled: metric.key === metricKey })),
    })),
    ...overrides,
  };
}

describe("scoreOnCurve", () => {
  const curve = [
    { value: 0, score: 0 },
    { value: 10, score: 50 },
    { value: 20, score: 100 },
  ];

  it("interpolates linearly between breakpoints", () => {
    expect(scoreOnCurve(curve, 5)).toBe(25);
    expect(scoreOnCurve(curve, 15)).toBe(75);
  });

  it("clamps to the nearest endpoint outside the curve", () => {
    expect(scoreOnCurve(curve, -100)).toBe(0);
    expect(scoreOnCurve(curve, 1000)).toBe(100);
  });

  it("reads a descending curve as lower-is-better", () => {
    const descending = [
      { value: 0, score: 100 },
      { value: 10, score: 0 },
    ];
    expect(scoreOnCurve(descending, 2.5)).toBe(75);
    expect(scoreOnCurve(descending, 10)).toBe(0);
  });

  it("sorts unordered breakpoints before interpolating", () => {
    const unordered = [
      { value: 20, score: 100 },
      { value: 0, score: 0 },
      { value: 10, score: 50 },
    ];
    expect(scoreOnCurve(unordered, 5)).toBe(25);
  });
});

describe("buildHealthFacts", () => {
  it("takes headline figures from the latest fiscal year and keeps the previous one", () => {
    const facts = buildHealthFacts({
      company,
      statements: [
        statement({ fiscalYear: 2023, revenue: 100, operatingProfit: 10 }),
        statement({ fiscalYear: 2024, revenue: 120, operatingProfit: 18 }),
      ],
      now: new Date("2026-06-01"),
    });

    expect(facts.latest?.fiscalYear).toBe(2024);
    expect(facts.previous?.fiscalYear).toBe(2023);
    expect(facts.latest?.revenue).toBe(120);
    expect(facts.reportedYearCount).toBe(2);
  });

  it("prefers consolidated accounts when both scopes exist for a year", () => {
    const facts = buildHealthFacts({
      company,
      statements: [
        statement({ fiscalYear: 2024, revenue: 100, statementScope: "COMPANY" }),
        statement({ fiscalYear: 2024, revenue: 450, statementScope: "CONSOLIDATED" }),
      ],
    });

    expect(facts.latest?.revenue).toBe(450);
  });

  it("derives debt from assets minus equity", () => {
    const facts = buildHealthFacts({
      company,
      statements: [statement({ fiscalYear: 2024, assets: 1000, equity: 300 })],
    });

    expect(facts.latest?.debt).toBe(700);
  });

  it("reads canonical values off the statement when no line items are supplied", () => {
    const facts = buildHealthFacts({
      company,
      statements: [
        statement({
          fiscalYear: 2024,
          financialValues: { current_assets: 500, current_liabilities: 250 },
        }),
      ],
    });

    expect(facts.latest?.currentAssets).toBe(500);
    expect(facts.latest?.currentLiabilities).toBe(250);
  });

  it("lets a mapped line item win over the statement's canonical value", () => {
    const facts = buildHealthFacts({
      company,
      statements: [
        statement({ fiscalYear: 2024, financialValues: { current_assets: 500 } }),
      ],
      lineItems: [
        {
          id: "l1",
          filingId: null,
          fiscalYear: 2024,
          statementType: "BALANCE_SHEET",
          statementScope: "COMPANY",
          metricKey: "current_assets",
          label: "Sum omløpsmidler",
          originalValue: null,
          value: 640,
          currency: "NOK",
          unitScale: 1,
          sourcePage: null,
          sortOrder: 1,
          publicationSource: "MANUAL_REVIEW",
          sourceSystem: "BRREG",
          sourceEntityType: null,
          sourceId: null,
        },
      ],
    });

    expect(facts.latest?.currentAssets).toBe(640);
  });

  it("counts a report for last fiscal year as on time", () => {
    const facts = buildHealthFacts({
      company: { ...company, lastSubmittedAnnualReportYear: 2025 },
      statements: [statement({ fiscalYear: 2025 })],
      now: new Date("2026-06-01"),
    });

    expect(facts.yearsSinceLastReport).toBe(0);
  });

  it("measures the lag when reporting has fallen behind", () => {
    const facts = buildHealthFacts({
      company: { ...company, lastSubmittedAnnualReportYear: 2022 },
      statements: [statement({ fiscalYear: 2022 })],
      now: new Date("2026-06-01"),
    });

    expect(facts.yearsSinceLastReport).toBe(3);
  });

  it("reports the share of years with a positive operating profit", () => {
    const facts = buildHealthFacts({
      company,
      statements: [
        statement({ fiscalYear: 2022, operatingProfit: -5 }),
        statement({ fiscalYear: 2023, operatingProfit: 5 }),
        statement({ fiscalYear: 2024, operatingProfit: 8 }),
      ],
    });

    expect(facts.positiveEbitShare).toBeCloseTo(66.67, 1);
  });
});

describe("metric computation", () => {
  const facts = (partial: Partial<HealthFacts["latest"]> & { fiscalYear: number }): HealthFacts =>
    buildHealthFacts({
      company,
      statements: [
        statement({
          fiscalYear: partial.fiscalYear,
          revenue: partial.revenue ?? undefined,
          operatingProfit: partial.operatingProfit ?? undefined,
          netIncome: partial.netIncome ?? undefined,
          equity: partial.equity ?? undefined,
          assets: partial.assets ?? undefined,
        }),
      ],
    });

  it("does not report return on equity when equity is negative", () => {
    const result = computeHealthScore(
      facts({ fiscalYear: 2024, netIncome: -50, equity: -200 }),
      singleMetricConfig("return_on_equity"),
    );

    // A negative denominator flips the sign and would read as a healthy return.
    expect(result.pillars[0].metrics[0].available).toBe(false);
  });

  it("does not report debt-to-equity when equity is negative", () => {
    const result = computeHealthScore(
      facts({ fiscalYear: 2024, assets: 500, equity: -100 }),
      singleMetricConfig("debt_to_equity"),
    );

    expect(result.pillars[0].metrics[0].available).toBe(false);
  });

  it("computes the equity ratio as a percentage", () => {
    const result = computeHealthScore(
      facts({ fiscalYear: 2024, assets: 1000, equity: 350 }),
      singleMetricConfig("equity_ratio"),
    );

    expect(result.pillars[0].metrics[0].value).toBeCloseTo(35, 5);
    // 35 % sits exactly on a breakpoint worth 75 points in the default curve.
    expect(result.pillars[0].metrics[0].score).toBeCloseTo(75, 5);
  });

  it("does not report revenue growth off a non-positive base", () => {
    const result = computeHealthScore(
      buildHealthFacts({
        company,
        statements: [
          statement({ fiscalYear: 2023, revenue: 0 }),
          statement({ fiscalYear: 2024, revenue: 100 }),
        ],
      }),
      singleMetricConfig("revenue_growth"),
    );

    expect(result.pillars[0].metrics[0].available).toBe(false);
  });
});

describe("computeHealthScore", () => {
  const solid = buildHealthFacts({
    company,
    statements: [
      statement({ fiscalYear: 2023, revenue: 800, operatingProfit: 90, netIncome: 70, equity: 500, assets: 900 }),
      statement({
        fiscalYear: 2024,
        revenue: 1000,
        operatingProfit: 150,
        netIncome: 110,
        equity: 620,
        assets: 1000,
        financialValues: {
          current_assets: 500,
          current_liabilities: 220,
          inventory: 80,
          cash: 180,
          financial_expense: 20,
          payroll_expense: 350,
        },
      }),
    ],
    now: new Date("2026-06-01"),
  });

  it("scores a healthy company well above a failing one", () => {
    const weak = buildHealthFacts({
      company,
      statements: [
        statement({ fiscalYear: 2023, revenue: 900, operatingProfit: -40, netIncome: -60, equity: 100, assets: 800 }),
        statement({ fiscalYear: 2024, revenue: 600, operatingProfit: -150, netIncome: -180, equity: -80, assets: 700 }),
      ],
      now: new Date("2026-06-01"),
    });

    const config = defaultHealthScoreConfig();
    expect(computeHealthScore(solid, config).score).toBeGreaterThan(
      computeHealthScore(weak, config).score + 25,
    );
  });

  it("keeps the score inside 0–100", () => {
    const result = computeHealthScore(solid, defaultHealthScoreConfig());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("moves the score when a pillar's weight changes", () => {
    const base = defaultHealthScoreConfig();
    const liquidityHeavy: HealthScoreConfig = {
      ...base,
      pillars: base.pillars.map((pillar) =>
        pillar.key === "LIKVIDITET" ? { ...pillar, weight: 500 } : { ...pillar, weight: 1 },
      ),
    };

    expect(computeHealthScore(solid, liquidityHeavy).score).not.toBe(
      computeHealthScore(solid, base).score,
    );
  });

  it("treats weights as relative, so scaling every weight changes nothing", () => {
    const base = defaultHealthScoreConfig();
    const doubled: HealthScoreConfig = {
      ...base,
      pillars: base.pillars.map((pillar) => ({ ...pillar, weight: pillar.weight * 2 })),
    };

    expect(computeHealthScore(solid, doubled).score).toBe(computeHealthScore(solid, base).score);
  });

  it("redistributes weight away from metrics with no data by default", () => {
    const headlineOnly = buildHealthFacts({
      company,
      statements: [statement({ fiscalYear: 2024, revenue: 1000, operatingProfit: 150, netIncome: 110, equity: 620, assets: 1000 })],
      now: new Date("2026-06-01"),
    });

    const result = computeHealthScore(headlineOnly, defaultHealthScoreConfig());
    const liquidity = result.pillars.find((pillar) => pillar.key === "LIKVIDITET");

    // Every liquidity metric needs line items, so the whole pillar drops out
    // rather than dragging the score to zero.
    expect(liquidity?.score).toBeNull();
    expect(liquidity?.weightShare).toBe(0);
    expect(result.coverage).toBeLessThan(100);
    expect(result.score).toBeGreaterThan(50);
  });

  it("punishes missing data under the zero policy", () => {
    const headlineOnly = buildHealthFacts({
      company,
      statements: [statement({ fiscalYear: 2024, revenue: 1000, operatingProfit: 150, netIncome: 110, equity: 620, assets: 1000 })],
      now: new Date("2026-06-01"),
    });

    const renormalized = computeHealthScore(headlineOnly, defaultHealthScoreConfig());
    const zeroed = computeHealthScore(headlineOnly, {
      ...defaultHealthScoreConfig(),
      missingDataPolicy: "zero",
    });

    expect(zeroed.score).toBeLessThan(renormalized.score);
  });

  it("docks the total when coverage falls short, without dropping the dimensions", () => {
    const headlineOnly = buildHealthFacts({
      company,
      statements: [statement({ fiscalYear: 2024, revenue: 1000, operatingProfit: 150, netIncome: 110, equity: 620, assets: 1000 })],
      now: new Date("2026-06-01"),
    });

    const config = defaultHealthScoreConfig();
    const penalized = computeHealthScore(headlineOnly, config);
    const unpenalized = computeHealthScore(headlineOnly, {
      ...config,
      coveragePenalty: { ...config.coveragePenalty, enabled: false },
    });

    expect(penalized.coveragePenaltyPoints).toBeGreaterThan(0);
    expect(penalized.score).toBeLessThan(unpenalized.score);
    expect(penalized.rawScore).toBe(unpenalized.rawScore);
    // The radar keeps every axis; the dimensions did not disappear, the total
    // simply paid for them being unanswered.
    expect(penalized.pillars).toHaveLength(6);
  });

  it("docks nothing when coverage reaches the model's full-coverage mark", () => {
    const complete = buildHealthFacts({
      company,
      statements: [
        statement({ fiscalYear: 2023, revenue: 800, operatingProfit: 90, netIncome: 70, equity: 500, assets: 900 }),
        statement({
          fiscalYear: 2024,
          revenue: 1000,
          operatingProfit: 150,
          netIncome: 110,
          equity: 620,
          assets: 1000,
          financialValues: {
            current_assets: 500,
            current_liabilities: 220,
            inventory: 80,
            cash_and_cash_equivalents: 180,
            financial_expense: 20,
            payroll_expense: 350,
          },
        }),
      ],
      now: new Date("2026-06-01"),
    });

    const result = computeHealthScore(complete, defaultHealthScoreConfig());

    expect(result.coverage).toBeGreaterThanOrEqual(75);
    expect(result.coveragePenaltyPoints).toBe(0);
    expect(result.score).toBe(result.rawScore);
  });

  it("scales the deduction with the configured strength", () => {
    const sparse = buildHealthFacts({
      company: { ...company, employeeCount: null, foundedAt: null },
      statements: [statement({ fiscalYear: 2024, revenue: 1000, operatingProfit: 150 })],
      now: new Date("2026-06-01"),
    });

    const base = defaultHealthScoreConfig();
    const soft = computeHealthScore(sparse, {
      ...base,
      coveragePenalty: { ...base.coveragePenalty, strength: 20 },
    });
    const harsh = computeHealthScore(sparse, {
      ...base,
      coveragePenalty: { ...base.coveragePenalty, strength: 90 },
    });

    expect(harsh.coveragePenaltyPoints).toBeGreaterThan(soft.coveragePenaltyPoints);
    expect(harsh.score).toBeLessThan(soft.score);
  });

  it("keeps a company scored on a couple of flattering figures out of the top grade", () => {
    const sparse = buildHealthFacts({
      company: { ...company, employeeCount: null, foundedAt: null },
      statements: [statement({ fiscalYear: 2024, revenue: 1000, operatingProfit: 300 })],
      now: new Date("2026-06-01"),
    });

    const result = computeHealthScore(sparse, defaultHealthScoreConfig());

    // The two figures we do hold look excellent on their own …
    expect(result.rawScore).toBeGreaterThan(60);
    // … but the model will not hand out its best grade on that little evidence.
    expect(result.grade).not.toBe("A");
    expect(result.coveragePenaltyPoints).toBeGreaterThan(0);
  });

  it("applies the coverage penalty before the status cap, not after", () => {
    const sparse = buildHealthFacts({
      company: { ...company, employeeCount: null, foundedAt: null, status: "BANKRUPT" },
      statements: [statement({ fiscalYear: 2024, revenue: 1000, operatingProfit: 150 })],
      now: new Date("2026-06-01"),
    });

    const result = computeHealthScore(sparse, defaultHealthScoreConfig());

    // The cap is the floor either way; the penalty must not push the score back up.
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it("flags thin data below the configured coverage floor", () => {
    const sparse = buildHealthFacts({
      company: { ...company, employeeCount: null, foundedAt: null },
      statements: [statement({ fiscalYear: 2024, revenue: 1000 })],
      now: new Date("2026-06-01"),
    });

    const result = computeHealthScore(sparse, {
      ...defaultHealthScoreConfig(),
      minimumCoverage: 90,
    });

    expect(result.thinData).toBe(true);
  });

  it("caps and re-grades a bankrupt company regardless of its last accounts", () => {
    const bankrupt: HealthFacts = { ...solid, status: "BANKRUPT" };
    const result = computeHealthScore(bankrupt, defaultHealthScoreConfig());

    expect(result.rawScore).toBeGreaterThan(50);
    expect(result.score).toBeLessThanOrEqual(10);
    expect(result.grade).toBe("D");
    expect(result.riskLabel).toBe("Høy");
    expect(result.overrideApplied).toBe("BANKRUPT");
  });

  it("resolves the grade from the band the score falls into", () => {
    const config = defaultHealthScoreConfig();
    const bands = [
      { score: 95, grade: "A" },
      { score: 65, grade: "B" },
      { score: 45, grade: "C" },
      { score: 5, grade: "D" },
    ];

    for (const band of bands) {
      // A single-metric model with a flat curve pins the total to a known score,
      // which is what makes the band boundary assertable.
      const single = singleMetricConfig("equity_ratio", { statusOverrides: [] });
      const flat: HealthScoreConfig = {
        ...single,
        ratingBands: config.ratingBands,
        pillars: single.pillars.map((pillar) => ({
          ...pillar,
          metrics: pillar.metrics.map((metric) =>
            metric.key === "equity_ratio"
              ? {
                  ...metric,
                  curve: [
                    { value: -1, score: band.score },
                    { value: 1000, score: band.score },
                  ],
                }
              : metric,
          ),
        })),
      };

      expect(computeHealthScore(solid, flat).grade).toBe(band.grade);
    }
  });

  it("produces one pillar result per enabled pillar so the radar always has axes", () => {
    const result = computeHealthScore(solid, defaultHealthScoreConfig());
    expect(result.pillars).toHaveLength(6);
    expect(result.pillars.every((pillar) => pillar.metrics.length > 0)).toBe(true);
  });

  it("scores nothing rather than guessing when there are no statements at all", () => {
    const empty = buildHealthFacts({ company, statements: [] });
    const result = computeHealthScore(empty, defaultHealthScoreConfig());

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.coverage).toBeLessThan(50);
  });
});

describe("defaultHealthScoreConfig", () => {
  it("covers every metric in the catalog exactly once", () => {
    const config = defaultHealthScoreConfig();
    const configured = config.pillars.flatMap((pillar) => pillar.metrics.map((m) => m.key));

    expect(new Set(configured).size).toBe(configured.length);
    expect(configured.sort()).toEqual(healthMetricCatalog.map((m) => m.key).sort());
  });

  it("places every metric under its own pillar", () => {
    for (const pillar of defaultHealthScoreConfig().pillars) {
      const expected = healthMetricsForPillar(pillar.key).map((metric) => metric.key);
      expect(pillar.metrics.map((metric) => metric.key)).toEqual(expected);
    }
  });

  it("gives every curve at least two points", () => {
    for (const metric of healthMetricCatalog) {
      expect(metric.defaultCurve.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("scoreCompanyHealth", () => {
  it("builds facts and scores them in one call", () => {
    const result = scoreCompanyHealth(
      {
        company,
        statements: [
          statement({ fiscalYear: 2024, revenue: 1000, operatingProfit: 150, equity: 600, assets: 1000 }),
        ],
        now: new Date("2026-06-01"),
      },
      defaultHealthScoreConfig(),
    );

    expect(result.score).toBeGreaterThan(0);
    expect(result.grade).not.toBe("–");
  });
});
