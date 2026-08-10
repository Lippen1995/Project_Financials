import { describe, expect, it } from "vitest";

import { defaultMetricDefinitions } from "@/server/financials/canonical-taxonomy";
import {
  FI_SIM_CONCEPTS_THE_ENGINE_CANNOT_REACH,
  FI_SIM_MAPPING_ORACLE,
} from "../catalog/catalog-mapping-oracle.test-data";
import { FI_SIM_CONCEPTS } from "../catalog/concepts";
import {
  decideSimulatedLineMapping,
  liabilitySectionForPresentationRole,
  overlayDefinitions,
  summariseMappingCoverage,
} from "./simulated-line-mapping";

function decideFor(
  conceptKey: string,
  options: {
    overlay?: Parameters<typeof overlayDefinitions>[0];
    intentionallyUnmapped?: string[];
  } = {},
) {
  const concept = FI_SIM_CONCEPTS.find((entry) => entry.conceptKey === conceptKey);
  if (!concept) throw new Error(`Unknown concept ${conceptKey}`);
  const overlay = options.overlay ?? [];
  return decideSimulatedLineMapping(
    {
      id: `line-${conceptKey}`,
      conceptKey,
      sourceLabel: concept.sourceLabel,
      presentationRole: concept.presentationRole,
      statementType: concept.statementFamily,
    },
    {
      definitions: [...defaultMetricDefinitions, ...overlayDefinitions(overlay)],
      overlayMetricKeys: new Set(overlay.map((entry) => entry.metricKey)),
      intentionallyUnmapped: new Set(options.intentionallyUnmapped ?? []),
    },
  );
}

describe("FI-SIM mapping oracle", () => {
  it("covers every concept in the catalog", () => {
    const missing = FI_SIM_CONCEPTS.filter(
      (concept) => !(concept.conceptKey in FI_SIM_MAPPING_ORACLE),
    ).map((concept) => concept.conceptKey);

    expect(missing).toEqual([]);
  });

  it("never maps a concept to a metric the oracle did not expect", () => {
    // The strong invariant. A concept the engine cannot reach is a gap a reviewer fills; a concept
    // the engine reaches *wrongly* is a number filed under the wrong name, which no reviewer
    // catches by looking at a demo. This is the check that would have caught "Øvrige
    // driftsinntekter" being mapped as turnover.
    const wrong = FI_SIM_CONCEPTS.flatMap((concept) => {
      const decision = decideFor(concept.conceptKey);
      if (decision.metricKey === null) return [];
      const expected = FI_SIM_MAPPING_ORACLE[concept.conceptKey];
      return decision.metricKey === expected
        ? []
        : [`${concept.conceptKey}: engine says ${decision.metricKey}, oracle says ${expected}`];
    });

    expect(wrong).toEqual([]);
  });

  it("leaves a concept unmapped whenever the canonical taxonomy has no key for it", () => {
    // Not a gap: there is no canonical key for a non-current asset subtotal or a residual line, so
    // the only correct answer is nothing. Forcing them into a neighbouring key would be worse
    // than leaving them alone.
    const forced = FI_SIM_CONCEPTS.filter(
      (concept) =>
        FI_SIM_MAPPING_ORACLE[concept.conceptKey] === null &&
        decideFor(concept.conceptKey).metricKey !== null,
    ).map((concept) => concept.conceptKey);

    expect(forced).toEqual([]);
  });

  it("reaches exactly the concepts the oracle records it reaching", () => {
    // Coverage may move in either direction, but only on purpose. Silently losing a mapping is a
    // regression; silently gaining one usually means an alias got broad enough to start stealing
    // labels from a neighbouring key.
    const gaps = FI_SIM_CONCEPTS.filter(
      (concept) =>
        FI_SIM_MAPPING_ORACLE[concept.conceptKey] !== null &&
        decideFor(concept.conceptKey).metricKey === null,
    )
      .map((concept) => concept.conceptKey)
      .sort();

    expect(gaps).toEqual([...FI_SIM_CONCEPTS_THE_ENGINE_CANNOT_REACH].sort());
  });

  it("maps the figures a reader looks at first", () => {
    for (const [conceptKey, expected] of [
      ["OperatingIncomeTotal", "total_operating_income"],
      ["OperatingResult", "operating_profit"],
      ["ProfitForPeriod", "net_income"],
      ["AssetsTotal", "total_assets"],
      ["EquityTotal", "total_equity"],
      ["LiabilitiesTotal", "total_liabilities"],
    ] as const) {
      expect(decideFor(conceptKey).metricKey).toBe(expected);
    }
  });
});

describe("simulated line mapping", () => {
  it("keeps a concept unmapped when the manifest says so", () => {
    const decision = decideFor("OperatingResult", {
      intentionallyUnmapped: ["OperatingResult"],
    });

    expect(decision).toMatchObject({
      metricKey: null,
      mappingMethod: "INTENTIONALLY_UNMAPPED",
    });
  });

  it("lets a dataset-scoped alias reach a concept the catalog cannot", () => {
    // The demo's whole point: a reviewer adds an alias, and the line that was unmapped maps.
    expect(decideFor("ServiceRevenue").metricKey).toBeNull();

    const decision = decideFor("ServiceRevenue", {
      overlay: [
        {
          alias: "tjenesteomsetning",
          metricKey: "revenue",
          statementFamily: "INCOME_STATEMENT",
          liabilitySection: null,
        },
      ],
    });

    expect(decision).toMatchObject({
      metricKey: "revenue",
      mappingMethod: "SIMULATED_ALIAS_OVERLAY",
    });
  });

  it("tells the two maturity-split debt keys apart by presentation role", () => {
    expect(liabilitySectionForPresentationRole("LongTermLiabilities")).toBe("LONG_TERM");
    expect(liabilitySectionForPresentationRole("LongTermLiabilitiesTotal")).toBe("LONG_TERM");
    expect(liabilitySectionForPresentationRole("CurrentLiabilities")).toBe("CURRENT");
    expect(liabilitySectionForPresentationRole("CurrentAssets")).toBeNull();

    const overlay = [
      {
        alias: "gjeld til kredittinstitusjoner",
        metricKey: "long_term_debt_credit_institutions",
        statementFamily: "BALANCE_SHEET" as const,
        liabilitySection: "LONG_TERM" as const,
      },
    ];
    expect(decideFor("LongTermBankBorrowings", { overlay }).metricKey).toBeNull();
  });

  it("summarises coverage per concept so a reviewer sees what is left to do", () => {
    const coverage = summariseMappingCoverage(
      [
        { lineId: "a", conceptKey: "AssetsTotal", metricKey: "total_assets", mappingMethod: "CANONICAL_LABEL_MATCH" },
        { lineId: "b", conceptKey: "AssetsTotal", metricKey: "total_assets", mappingMethod: "CANONICAL_LABEL_MATCH" },
        { lineId: "c", conceptKey: "ServiceRevenue", metricKey: null, mappingMethod: "NO_MATCH" },
      ],
      new Map([["AssetsTotal", "Sum eiendeler"], ["ServiceRevenue", "Tjenesteomsetning"]]),
    );

    expect(coverage).toMatchObject({ lines: 3, mapped: 2, unmapped: 1 });
    expect(coverage.byConcept).toEqual([
      { conceptKey: "AssetsTotal", sourceLabel: "Sum eiendeler", metricKey: "total_assets", method: "CANONICAL_LABEL_MATCH", lines: 2 },
      { conceptKey: "ServiceRevenue", sourceLabel: "Tjenesteomsetning", metricKey: null, method: "NO_MATCH", lines: 1 },
    ]);
  });
});
