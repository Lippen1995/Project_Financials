import { describe, expect, it } from "vitest";

import { buildOpenDataLoaderComparisonSummary } from "@/server/document-understanding/opendataloader-comparison";

describe("opendataloader-comparison", () => {
  it("marks material disagreement when publish decision, classifications, or facts diverge", () => {
    const summary = buildOpenDataLoaderComparisonSummary({
      primary: {
        engine: "LEGACY",
        mode: "legacy",
        classifications: [{ pageNumber: 2, type: "STATUTORY_INCOME", unitScale: 1 }],
        selectedFacts: [
          {
            metricKey: "revenue",
            value: 103_097_000,
            sourcePage: 2,
            sourceSection: "STATUTORY_INCOME",
            precedence: "STATUTORY_NOK",
          },
        ],
        blockingRuleCodes: [],
        shouldPublish: true,
        confidenceScore: 0.94,
        durationMs: 300,
      },
      shadow: {
        engine: "OPENDATALOADER",
        mode: "hybrid",
        classifications: [{ pageNumber: 2, type: "SUPPLEMENTARY_INCOME", unitScale: 1000 }],
        selectedFacts: [
          {
            metricKey: "revenue",
            value: 103_097,
            sourcePage: 2,
            sourceSection: "SUPPLEMENTARY_INCOME",
            precedence: "SUPPLEMENTARY_NOK_THOUSANDS",
          },
        ],
        blockingRuleCodes: ["SUSPICIOUS_UNIT_MISMATCH"],
        shouldPublish: false,
        confidenceScore: 0.41,
        durationMs: 800,
      },
    });

    expect(summary.publishDecisionMismatch).toBe(true);
    expect(summary.classificationDifferences).toHaveLength(1);
    expect(summary.factDifferences).toHaveLength(1);
    expect(summary.materialDisagreement).toBe(true);
  });
});
