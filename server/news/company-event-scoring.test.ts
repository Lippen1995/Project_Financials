import { describe, expect, it } from "vitest";

import {
  computeDuplicatePenalty,
  computeEvidenceStrengthScore,
  computeInvestorValueScore,
  computeLowSignalPenalty,
  computeSourceCredibilityScore,
  computeTimelinessScore,
  scoreCompanyEvent,
} from "@/server/news/company-event-scoring";

const classification = {
  eventType: "capital_raise" as const,
  eventTypeScore: 0.9,
  materialityScore: 0.86,
  financialImpactScore: 0.86,
  strategicImpactScore: 0.58,
  riskImpactScore: 0.54,
  direction: "mixed" as const,
  impactHorizon: "immediate" as const,
  confidenceLevel: "high" as const,
  explanation: {},
};

describe("company event scoring", () => {
  it("implements the explicit investor value formula", () => {
    const result = computeInvestorValueScore({
      entityConfidence: 1,
      materialityScore: 1,
      sourceCredibilityScore: 1,
      financialImpactScore: 1,
      strategicImpactScore: 1,
      riskImpactScore: 1,
      noveltyScore: 1,
      timelinessScore: 1,
      userRelevanceScore: 1,
      evidenceStrengthScore: 1,
      lowSignalPenalty: 0.1,
      duplicatePenalty: 0.05,
    });

    expect(result.investorValueScore).toBeCloseTo(85);
  });

  it("clamps score to the 0-100 range", () => {
    expect(
      computeInvestorValueScore({
        entityConfidence: 5,
        materialityScore: 5,
        sourceCredibilityScore: 5,
        financialImpactScore: 5,
        strategicImpactScore: 5,
        riskImpactScore: 5,
        noveltyScore: 5,
        timelinessScore: 5,
        userRelevanceScore: 5,
        evidenceStrengthScore: 5,
      }).investorValueScore,
    ).toBe(100);
  });

  it("orders source credibility by source quality and source type", () => {
    expect(computeSourceCredibilityScore({ id: "newsweb", sourceType: "newsweb" })).toBeGreaterThan(
      computeSourceCredibilityScore({ id: "unknown", sourceType: "rss" }),
    );
    expect(computeSourceCredibilityScore({ id: "eia-press", sourceType: "rss" })).toBeGreaterThan(0.8);
  });

  it("scores timeliness from event age", () => {
    const now = new Date("2026-06-02T12:00:00Z");
    expect(computeTimelinessScore(new Date("2026-06-02T08:00:00Z"), now)).toBe(1);
    expect(computeTimelinessScore(new Date("2025-01-01T08:00:00Z"), now)).toBeLessThan(0.3);
  });

  it("adds evidence strength for multiple supporting documents", () => {
    const one = computeEvidenceStrengthScore({ entityConfidence: 0.7, eventTypeScore: 0.7, evidenceCount: 1 });
    const many = computeEvidenceStrengthScore({ entityConfidence: 0.7, eventTypeScore: 0.7, evidenceCount: 4 });
    expect(many).toBeGreaterThan(one);
  });

  it("penalizes low signal and duplicates", () => {
    expect(computeLowSignalPenalty({ entityConfidence: 0.5, eventType: "low_signal_mention", mentionContext: "body" })).toBeGreaterThan(0.2);
    expect(computeDuplicatePenalty({ duplicateCount: 5 })).toBeGreaterThan(computeDuplicatePenalty({ duplicateCount: 1 }));
  });

  it("applies extra penalty when search-based sector sources mismatch the company context", () => {
    const matched = scoreCompanyEvent({
      companyId: "company-1",
      eventDate: new Date("2026-06-02T08:00:00Z"),
      source: {
        id: "google-news-upstream",
        sourceType: "search_rss",
        metadata: { tier: "industry" },
      },
      classification: { ...classification, eventType: "board_change", materialityScore: 0.52, financialImpactScore: 0.3 },
      entityConfidence: 0.9,
      userRelevanceScore: 0.78,
      sourceSectorMismatch: false,
      now: new Date("2026-06-02T12:00:00Z"),
    });
    const mismatched = scoreCompanyEvent({
      companyId: "company-2",
      eventDate: new Date("2026-06-02T08:00:00Z"),
      source: {
        id: "google-news-upstream",
        sourceType: "search_rss",
        metadata: { tier: "industry" },
      },
      classification: { ...classification, eventType: "board_change", materialityScore: 0.52, financialImpactScore: 0.3 },
      entityConfidence: 0.9,
      userRelevanceScore: 0.12,
      sourceSectorMismatch: true,
      now: new Date("2026-06-02T12:00:00Z"),
    });

    expect(matched.investorValueScore).toBeGreaterThan(mismatched.investorValueScore + 20);
  });

  it("makes high-value primary filings outrank generic low-signal mentions", () => {
    const high = scoreCompanyEvent({
      companyId: "company-1",
      eventDate: new Date("2026-06-02T08:00:00Z"),
      source: { id: "newsweb", sourceType: "newsweb" },
      classification,
      entityConfidence: 0.96,
      now: new Date("2026-06-02T12:00:00Z"),
    });
    const low = scoreCompanyEvent({
      companyId: "company-1",
      eventDate: new Date("2026-06-02T08:00:00Z"),
      source: { id: "unknown", sourceType: "rss" },
      classification: { ...classification, eventType: "low_signal_mention", materialityScore: 0.18, financialImpactScore: 0.08 },
      entityConfidence: 0.56,
      mentionContext: "body",
      now: new Date("2026-06-02T12:00:00Z"),
    });

    expect(high.investorValueScore).toBeGreaterThan(low.investorValueScore + 30);
  });
});
