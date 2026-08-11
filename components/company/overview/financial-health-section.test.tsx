import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FinancialHealthSection } from "@/components/company/overview/financial-health-section";
import { HealthRadar } from "@/components/health/health-radar";
import {
  buildHealthFacts,
  computeHealthScore,
  defaultHealthScoreConfig,
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

const company = {
  status: "ACTIVE" as const,
  employeeCount: 24,
  foundedAt: new Date("2014-03-01"),
  lastSubmittedAnnualReportYear: 2024,
};

function resultFor(status: "ACTIVE" | "BANKRUPT" = "ACTIVE") {
  const facts = buildHealthFacts({
    company: { ...company, status },
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

  return computeHealthScore(facts, defaultHealthScoreConfig());
}

describe("HealthRadar", () => {
  it("draws one labelled vertex per dimension", () => {
    const result = resultFor();
    const markup = renderToStaticMarkup(
      <HealthRadar
        axes={result.pillars.map((pillar) => ({
          key: pillar.key,
          label: pillar.label,
          score: pillar.score,
          weightShare: pillar.weightShare,
        }))}
      />,
    );

    for (const pillar of result.pillars) {
      expect(markup).toContain(pillar.label);
    }
    expect(markup).toContain("<svg");
  });

  it("explains itself rather than drawing a degenerate shape under three axes", () => {
    const markup = renderToStaticMarkup(
      <HealthRadar
        axes={[
          { key: "A", label: "Lønnsomhet", score: 50, weightShare: 100 },
        ]}
      />,
    );

    expect(markup).toContain("minst tre påslåtte dimensjoner");
    expect(markup).not.toContain("<svg");
  });

  it("puts the per-dimension scores in the accessible label", () => {
    const markup = renderToStaticMarkup(
      <HealthRadar
        axes={[
          { key: "A", label: "Lønnsomhet", score: 72, weightShare: 30 },
          { key: "B", label: "Soliditet", score: null, weightShare: 0 },
          { key: "C", label: "Likviditet", score: 40, weightShare: 30 },
        ]}
      />,
    );

    expect(markup).toContain("Lønnsomhet: 72");
    expect(markup).toContain("Soliditet: ikke tilgjengelig");
  });
});

describe("FinancialHealthSection", () => {
  it("shows the score, grade and the model that produced them", () => {
    const result = resultFor();
    const markup = renderToStaticMarkup(
      <FinancialHealthSection
        result={result}
        modelName="Eiendomsmodell"
        matchedNacePrefix="68.20"
      />,
    );

    expect(markup).toContain(String(result.score));
    expect(markup).toContain(`Karakter ${result.grade}`);
    expect(markup).toContain("Eiendomsmodell");
    expect(markup).toContain("bransjeregel NACE 68.20");
  });

  it("says the model applies broadly when no industry rule matched", () => {
    const markup = renderToStaticMarkup(
      <FinancialHealthSection
        result={resultFor()}
        modelName="Standardmodell"
        matchedNacePrefix={null}
      />,
    );

    expect(markup).toContain("gjelder alle bransjer uten egen regel");
    expect(markup).not.toContain("NACE");
  });

  it("names every dimension and its metrics", () => {
    const result = resultFor();
    const markup = renderToStaticMarkup(
      <FinancialHealthSection result={result} modelName="Standardmodell" matchedNacePrefix={null} />,
    );

    for (const pillar of result.pillars) {
      expect(markup).toContain(pillar.label);
      for (const metric of pillar.metrics) {
        expect(markup).toContain(metric.label);
      }
    }
  });

  it("tells the reader when a register status overrode the numbers", () => {
    const markup = renderToStaticMarkup(
      <FinancialHealthSection
        result={resultFor("BANKRUPT")}
        modelName="Standardmodell"
        matchedNacePrefix={null}
      />,
    );

    expect(markup).toContain("konkurs");
    expect(markup).toContain("Scoren er derfor satt");
  });

  it("does not claim a health score is a credit rating", () => {
    const markup = renderToStaticMarkup(
      <FinancialHealthSection
        result={resultFor()}
        modelName="Standardmodell"
        matchedNacePrefix={null}
      />,
    );

    expect(markup).toContain("ikke en kredittvurdering");
  });
});
