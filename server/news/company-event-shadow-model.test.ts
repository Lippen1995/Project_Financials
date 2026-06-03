import { describe, expect, it } from "vitest";

import {
  buildCompanyEventShadowFeatureVector,
  scoreCompanyEventShadowModel,
} from "@/server/news/company-event-shadow-model";

describe("company event shadow model", () => {
  it("builds feature vectors from persisted scoring metadata", () => {
    const vector = buildCompanyEventShadowFeatureVector({
      investorValueScore: 82,
      confidenceScore: 0.88,
      noveltyScore: 0.76,
      exposureType: "direct",
      exposureScore: 0.94,
      exposureConfidence: 0.9,
      evidenceCount: 2,
      metadata: {
        scoreComponents: {
          entityConfidence: 0.93,
          materialityScore: 0.81,
          sourceCredibilityScore: 0.94,
          strategicImpactScore: 0.72,
          financialImpactScore: 0.68,
          riskImpactScore: 0.55,
          timelinessScore: 1,
          evidenceStrengthScore: 0.84,
          duplicatePenalty: 0,
          lowSignalPenalty: 0,
        },
      },
    });

    expect(vector.entityConfidence).toBeCloseTo(0.93);
    expect(vector.evidenceCount).toBeCloseTo(0.5);
    expect(vector.isDirectExposure).toBe(1);
  });

  it("keeps strong direct events above weaker noisy events", () => {
    const strong = scoreCompanyEventShadowModel(
      buildCompanyEventShadowFeatureVector({
        investorValueScore: 84,
        confidenceScore: 0.9,
        noveltyScore: 0.82,
        exposureType: "direct",
        exposureScore: 0.96,
        exposureConfidence: 0.92,
        evidenceCount: 2,
        metadata: {
          scoreComponents: {
            entityConfidence: 0.95,
            materialityScore: 0.82,
            sourceCredibilityScore: 0.94,
            strategicImpactScore: 0.74,
            financialImpactScore: 0.7,
            riskImpactScore: 0.65,
            timelinessScore: 1,
            evidenceStrengthScore: 0.86,
            duplicatePenalty: 0,
            lowSignalPenalty: 0,
          },
        },
      }),
    );

    const weak = scoreCompanyEventShadowModel(
      buildCompanyEventShadowFeatureVector({
        investorValueScore: 42,
        confidenceScore: 0.58,
        noveltyScore: 0.42,
        exposureType: "sector",
        exposureScore: 0.61,
        exposureConfidence: 0.6,
        evidenceCount: 1,
        metadata: {
          scoreComponents: {
            entityConfidence: 0.46,
            materialityScore: 0.34,
            sourceCredibilityScore: 0.58,
            strategicImpactScore: 0.24,
            financialImpactScore: 0.18,
            riskImpactScore: 0.22,
            timelinessScore: 0.42,
            evidenceStrengthScore: 0.38,
            duplicatePenalty: 0.08,
            lowSignalPenalty: 0.18,
          },
        },
      }),
    );

    expect(strong.probability).toBeGreaterThan(weak.probability);
    expect(["medium", "high"]).toContain(strong.bucket);
  });
});
