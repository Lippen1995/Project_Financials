import { describe, expect, it } from "vitest";

import { buildNjordVisualization } from "./visualization";

const chainProvenance = {
  sourceSystem: "BRREG",
  sourceEntityType: "derivedRetailChain",
  sourceId: "rema-1000",
  fetchedAt: "2026-07-20T08:00:00.000Z",
  normalizedAt: "2026-07-20T08:00:00.000Z",
};
const financialProvenance = {
  sourceSystem: "BRREG",
  sourceEntityType: "annualAccounts",
  sourceId: "statement-2024",
  fetchedAt: "2026-07-20T08:00:00.000Z",
  normalizedAt: "2026-07-20T08:00:00.000Z",
};

const chainFinancialsResult = {
  name: "get_chain_financials",
  output: {
    chain: {
      slug: "rema-1000",
      name: "REMA 1000",
      storeCount: 3,
      operatorCount: 3,
      confidence: 0.98,
      builtAt: "2026-07-20T08:00:00.000Z",
      provenance: chainProvenance,
    },
    operators: [
      {
        orgNumber: "111111111",
        name: "Butikkdrift Nord AS",
        storeCount: 1,
        provenance: { ...chainProvenance, sourceId: "rema-1000:111111111" },
        latestFinancials: {
          fiscalYear: 2024,
          currency: "NOK",
          revenue: 100_000_000,
          operatingProfit: 5_000_000,
          netIncome: 4_000_000,
          equity: 10_000_000,
          assets: 20_000_000,
          provenance: financialProvenance,
        },
      },
      {
        orgNumber: "222222222",
        name: "Butikkdrift Sør AS",
        storeCount: 1,
        provenance: { ...chainProvenance, sourceId: "rema-1000:222222222" },
        latestFinancials: {
          fiscalYear: 2023,
          currency: "NOK",
          revenue: 80_000_000,
          operatingProfit: 3_000_000,
          netIncome: -2_000_000,
          equity: 8_000_000,
          assets: 18_000_000,
          provenance: { ...financialProvenance, sourceId: "statement-2023" },
        },
      },
      {
        orgNumber: "333333333",
        name: "Butikkdrift Vest AS",
        storeCount: 1,
        provenance: { ...chainProvenance, sourceId: "rema-1000:333333333" },
        latestFinancials: null,
      },
    ],
    coverage: {
      operatorCount: 3,
      withLatestFinancials: 2,
    },
  },
};

describe("buildNjordVisualization", () => {
  it("renders every covered franchise operator in a revenue/net-margin scatterplot when explicitly requested", () => {
    const result = buildNjordVisualization(
      "Plott alle REMA1000-franchiseselskapene med nettomargin i y-aksen og omsetning i x-aksen",
      [chainFinancialsResult],
    );

    expect(result).toMatchObject({
      state: "rendered",
      kind: "scatter",
      title: "Lønnsomhet i REMA 1000",
      xAxis: { metric: "revenue", label: "Omsetning", unit: "NOK" },
      yAxis: { metric: "netMargin", label: "Nettomargin", unit: "percent" },
      coverage: {
        operatorCount: 3,
        withLatestFinancials: 2,
        plottedCount: 2,
      },
    });
    expect(result?.points).toEqual([
      expect.objectContaining({ orgNumber: "111111111", x: 100_000_000, y: 4 }),
      expect.objectContaining({ orgNumber: "222222222", x: 80_000_000, y: -2.5 }),
    ]);
  });

  it("suggests the same grounded plot without opening it for a profitability comparison", () => {
    const result = buildNjordVisualization(
      "Sammenlign lønnsomheten til REMA 1000-franchisene",
      [chainFinancialsResult],
    );

    expect(result).toMatchObject({
      state: "suggested",
      suggestionLabel: "Plott nettomargin mot omsetning",
      coverage: { plottedCount: 2 },
    });
  });

  it("honors an explicit request to reverse the financial axes", () => {
    const result = buildNjordVisualization(
      "Plott REMA 1000-butikkene med nettomargin i x-aksen og omsetning i y-aksen",
      [chainFinancialsResult],
    );

    expect(result).toMatchObject({
      state: "rendered",
      xAxis: { metric: "netMargin", unit: "percent" },
      yAxis: { metric: "revenue", unit: "NOK" },
    });
    expect(result?.points[0]).toMatchObject({ x: 4, y: 100_000_000 });
  });

  it("suggests a profitability plot for a natural chain-store question", () => {
    const result = buildNjordVisualization(
      "Hvilke REMA 1000-butikkene er mest lønnsomme?",
      [chainFinancialsResult],
    );

    expect(result).toMatchObject({ state: "suggested" });
  });
});
