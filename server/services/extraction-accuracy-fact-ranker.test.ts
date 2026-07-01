import { describe, expect, it } from "vitest";

import {
  rankCanonicalAccuracyFacts,
  type RankableAccuracyFact,
} from "@/server/services/extraction-accuracy-fact-ranker";

function fact(input: {
  metricKey: string;
  value: string;
  rawLabel: string;
}): RankableAccuracyFact {
  return {
    metricKey: input.metricKey,
    statementScope: "CONSOLIDATED",
    fiscalYear: 2024,
    value: input.value,
    rawLabel: input.rawLabel,
  };
}

describe("rankCanonicalAccuracyFacts", () => {
  it("prefers non-sum rows for canonical line metrics", () => {
    const ranked = rankCanonicalAccuracyFacts([
      fact({ metricKey: "tangible_assets", value: "21936514000", rawLabel: "Varige driftsmidler 6" }),
      fact({ metricKey: "tangible_assets", value: "22894947000", rawLabel: "Sum varige driftsmidler" }),
    ]);

    expect(ranked).toEqual([
      fact({ metricKey: "tangible_assets", value: "21936514000", rawLabel: "Varige driftsmidler 6" }),
    ]);
  });

  it("prefers sum rows for canonical subtotal metrics", () => {
    const ranked = rankCanonicalAccuracyFacts([
      fact({ metricKey: "long_term_liabilities", value: "2750000000", rawLabel: "Obligasjonslån B" }),
      fact({ metricKey: "long_term_liabilities", value: "4086198000", rawLabel: "Sum langsiktig gjeld" }),
    ]);

    expect(ranked).toEqual([
      fact({ metricKey: "long_term_liabilities", value: "4086198000", rawLabel: "Sum langsiktig gjeld" }),
    ]);
  });

  it("keeps multiple non-sum candidates because some canonical metrics repeat legitimately", () => {
    const ranked = rankCanonicalAccuracyFacts([
      fact({ metricKey: "financial_income", value: "1000", rawLabel: "Renteinntekter" }),
      fact({ metricKey: "financial_income", value: "2000", rawLabel: "Annen finansinntekt" }),
    ]);

    expect(ranked).toHaveLength(2);
  });

  it("does not rank as-reported rows", () => {
    const ranked = rankCanonicalAccuracyFacts([
      fact({ metricKey: "as_reported_sum_varige_driftsmidler", value: "22894947000", rawLabel: "Sum varige driftsmidler" }),
      fact({ metricKey: "as_reported_varige_driftsmidler_6", value: "21936514000", rawLabel: "Varige driftsmidler 6" }),
    ]);

    expect(ranked).toHaveLength(2);
  });
});
