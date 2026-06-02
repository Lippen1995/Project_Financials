import { describe, expect, it } from "vitest";

import {
  classifyConstraintCause,
  computeEngineConsensus,
  consensusConfidenceDelta,
} from "@/integrations/brreg/annual-report-financials/engine-consensus";
import { CanonicalMetricKey } from "@/integrations/brreg/annual-report-financials/taxonomy";
import { CanonicalFactCandidate } from "@/integrations/brreg/annual-report-financials/types";

function fact(metricKey: CanonicalMetricKey, value: number): CanonicalFactCandidate {
  return {
    fiscalYear: 2024,
    statementType: "BALANCE_SHEET",
    statementScope: "COMPANY",
    metricKey,
    rawLabel: metricKey,
    normalizedLabel: metricKey,
    value,
    currency: "NOK",
    unitScale: 1,
    sourcePage: 2,
    sourceSection: "STATUTORY_BALANCE",
    sourceRowText: metricKey,
    noteReference: null,
    confidenceScore: 0.9,
    precedence: "STATUTORY_NOK",
    isDerived: false,
  };
}

function facts(
  entries: Array<[CanonicalMetricKey, number]>,
): Map<CanonicalMetricKey, CanonicalFactCandidate> {
  return new Map(entries.map(([key, value]) => [key, fact(key, value)]));
}

describe("computeEngineConsensus", () => {
  it("marks metrics both engines read the same as agreed", () => {
    const consensus = computeEngineConsensus(
      facts([
        ["total_assets", 92_155_000],
        ["net_income", 18_221_000],
      ]),
      facts([
        ["total_assets", 92_155_000],
        ["net_income", 18_221_000],
      ]),
    );

    expect(consensus.comparedCount).toBe(2);
    expect(consensus.agreedCount).toBe(2);
    expect(consensus.agreementScore).toBe(1);
    expect(consensus.disagreedMetricKeys).toEqual([]);
  });

  it("flags a metric the two engines read differently", () => {
    const consensus = computeEngineConsensus(
      facts([
        ["total_assets", 92_155_000],
        ["net_income", 18_221_000],
      ]),
      facts([
        ["total_assets", 92_155_000],
        ["net_income", 12_000_000],
      ]),
    );

    expect(consensus.disagreedMetricKeys).toEqual(["net_income"]);
    expect(
      consensus.metrics.find((metric) => metric.metricKey === "net_income")?.status,
    ).toBe("disagreed");
  });

  it("does not count a metric only one engine produced as compared", () => {
    const consensus = computeEngineConsensus(
      facts([["total_assets", 92_155_000]]),
      facts([]),
    );

    expect(consensus.comparedCount).toBe(0);
    expect(
      consensus.metrics.find((metric) => metric.metricKey === "total_assets")?.status,
    ).toBe("legacy-only");
  });
});

describe("classifyConstraintCause", () => {
  it("attributes a failed identity to the source when both engines agree on the operands", () => {
    const consensus = computeEngineConsensus(
      facts([
        ["total_assets", 92_155_000],
        ["total_equity_and_liabilities", 91_000_000],
      ]),
      facts([
        ["total_assets", 92_155_000],
        ["total_equity_and_liabilities", 91_000_000],
      ]),
    );

    expect(classifyConstraintCause("BS_TOTAL_BALANCES", consensus)).toBe("source");
  });

  it("attributes a failed identity to extraction when an operand was read differently", () => {
    const consensus = computeEngineConsensus(
      facts([
        ["total_assets", 92_155_000],
        ["total_equity_and_liabilities", 91_000_000],
      ]),
      facts([
        ["total_assets", 92_155_000],
        ["total_equity_and_liabilities", 70_000_000],
      ]),
    );

    expect(classifyConstraintCause("BS_TOTAL_BALANCES", consensus)).toBe("extraction");
  });

  it("returns null for rule codes that are not accounting identities", () => {
    const consensus = computeEngineConsensus(facts([]), facts([]));
    expect(classifyConstraintCause("LOW_CONFIDENCE_SCORE", consensus)).toBeNull();
  });
});

describe("consensusConfidenceDelta", () => {
  it("rewards near-total agreement", () => {
    const consensus = computeEngineConsensus(
      facts([
        ["total_assets", 1_000],
        ["net_income", 2_000],
        ["revenue", 3_000],
      ]),
      facts([
        ["total_assets", 1_000],
        ["net_income", 2_000],
        ["revenue", 3_000],
      ]),
    );

    expect(consensusConfidenceDelta(consensus)).toBeGreaterThan(0);
  });

  it("penalises disagreement", () => {
    const consensus = computeEngineConsensus(
      facts([
        ["total_assets", 1_000],
        ["net_income", 2_000],
        ["revenue", 3_000],
      ]),
      facts([
        ["total_assets", 1_000],
        ["net_income", 2_000],
        ["revenue", 9_999],
      ]),
    );

    expect(consensusConfidenceDelta(consensus)).toBeLessThan(0);
  });

  it("is neutral when there is nothing to compare", () => {
    expect(consensusConfidenceDelta(computeEngineConsensus(facts([]), facts([])))).toBe(0);
  });
});
