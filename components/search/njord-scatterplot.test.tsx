import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { NjordVisualization } from "@/lib/njord-visualization";
import { NjordScatterplot } from "./njord-scatterplot";

const visualization: NjordVisualization = {
  state: "rendered",
  kind: "scatter",
  title: "Lønnsomhet i REMA 1000",
  description: "Hvert punkt er et operatørselskap.",
  suggestionLabel: null,
  chain: {
    slug: "rema-1000",
    name: "REMA 1000",
    confidence: 0.98,
    builtAt: "2026-07-20T08:00:00.000Z",
    provenance: {
      sourceSystem: "BRREG",
      sourceEntityType: "derivedRetailChain",
      sourceId: "rema-1000",
      fetchedAt: "2026-07-20T08:00:00.000Z",
      normalizedAt: "2026-07-20T08:00:00.000Z",
    },
  },
  xAxis: { metric: "revenue", label: "Omsetning", unit: "NOK" },
  yAxis: { metric: "netMargin", label: "Nettomargin", unit: "percent" },
  points: [
    {
      orgNumber: "111111111",
      name: "Butikkdrift Nord AS",
      x: 100_000_000,
      y: 4,
      fiscalYear: 2024,
      currency: "NOK",
      storeCount: 1,
      provenance: {
        chainOperator: {
          sourceSystem: "BRREG",
          sourceEntityType: "derivedRetailChainOperator",
          sourceId: "rema-1000:111111111",
          fetchedAt: "2026-07-20T08:00:00.000Z",
          normalizedAt: "2026-07-20T08:00:00.000Z",
        },
        financialStatement: {
          sourceSystem: "BRREG",
          sourceEntityType: "annualAccounts",
          sourceId: "statement-2024",
          fetchedAt: "2026-07-20T08:00:00.000Z",
          normalizedAt: "2026-07-20T08:00:00.000Z",
        },
      },
    },
  ],
  coverage: { operatorCount: 2, withLatestFinancials: 1, plottedCount: 1 },
  sourceNote: "Kjedetilhørighet er utledet fra Brønnøysundregistrenes underenheter.",
};

describe("NjordScatterplot", () => {
  it("renders an explicit plot with accessible axis and coverage context", () => {
    const html = renderToStaticMarkup(<NjordScatterplot visualization={visualization} />);

    expect(html).toContain("Lønnsomhet i REMA 1000");
    expect(html).toContain("Omsetning");
    expect(html).toContain("Nettomargin");
    expect(html).toContain("1 av 2 operatørselskaper");
    expect(html).toContain("<svg");
  });

  it("keeps a suggested plot collapsed until the user asks to see it", () => {
    const html = renderToStaticMarkup(
      <NjordScatterplot
        visualization={{
          ...visualization,
          state: "suggested",
          suggestionLabel: "Plott nettomargin mot omsetning",
        }}
      />,
    );

    expect(html).toContain("Plott nettomargin mot omsetning");
    expect(html).not.toContain("<svg");
  });
});
