import { describe, expect, it } from "vitest";

import { buildScoreExplanation } from "@/server/news/company-event-score-explanation";

describe("company event score explanation", () => {
  it("includes top score components and penalties", () => {
    const explanation = buildScoreExplanation({
      eventType: "capital_raise",
      direction: "mixed",
      confidenceLevel: "high",
      sourceId: "newsweb",
      sourceType: "newsweb",
      components: {
        entityConfidence: 0.95,
        materialityScore: 0.86,
        sourceCredibilityScore: 0.92,
        financialImpactScore: 0.86,
        strategicImpactScore: 0.58,
        riskImpactScore: 0.54,
        noveltyScore: 0.82,
        timelinessScore: 1,
        userRelevanceScore: 0,
        evidenceStrengthScore: 0.93,
        lowSignalPenalty: 0.04,
        duplicatePenalty: 0.03,
        investorValueScore: 82,
      },
    });

    expect(explanation.topDrivers.length).toBe(4);
    expect(explanation.penalties).toEqual(["Lavsignal-straff: 4", "Duplikat-straff: 3"]);
    expect(explanation.formulaVersion).toBe("investor-value-v1");
  });
});
