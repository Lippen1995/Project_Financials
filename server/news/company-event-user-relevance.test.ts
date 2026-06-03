import { describe, expect, it } from "vitest";

import { computeCompanyEventUserRelevance } from "@/server/news/company-event-user-relevance";

describe("company event user relevance", () => {
  it("boosts sector-aligned petroleum companies on energy sources", () => {
    const relevance = computeCompanyEventUserRelevance({
      context: {
        companyId: "eqnr",
        companyName: "EQUINOR ASA",
        orgNumber: "923609016",
        industryCode: "06.100",
        industryPrefixes: ["06", "0610"],
        sectorTags: ["energy", "oil_gas", "offshore", "petroleum"],
        isPetroleumCompany: true,
        activeWatchCount: 3,
      },
      source: {
        id: "google-news-upstream",
        sourceType: "search_rss",
        metadata: { tier: "industry", sectorTags: ["energy", "oil_gas", "offshore"] },
      },
      classification: {
        eventType: "board_change",
        eventTypeScore: 0.8,
        materialityScore: 0.5,
        financialImpactScore: 0.3,
        strategicImpactScore: 0.5,
        riskImpactScore: 0.2,
        direction: "mixed",
        impactHorizon: "immediate",
        confidenceLevel: "high",
        explanation: {},
      },
    });

    expect(relevance.userRelevanceScore).toBeGreaterThan(0.7);
    expect(relevance.sourceSectorMismatch).toBe(false);
  });

  it("caps obvious sector mismatches to a low relevance score", () => {
    const relevance = computeCompanyEventUserRelevance({
      context: {
        companyId: "eqnr-bil",
        companyName: "EQUINOR BIL OSLO",
        orgNumber: "981617517",
        industryCode: "93.120",
        industryPrefixes: ["93", "9312"],
        sectorTags: ["sports", "leisure"],
        isPetroleumCompany: false,
        activeWatchCount: 0,
      },
      source: {
        id: "google-news-upstream",
        sourceType: "search_rss",
        metadata: { tier: "industry", sectorTags: ["energy", "oil_gas", "offshore"] },
      },
      classification: {
        eventType: "board_change",
        eventTypeScore: 0.8,
        materialityScore: 0.5,
        financialImpactScore: 0.3,
        strategicImpactScore: 0.5,
        riskImpactScore: 0.2,
        direction: "mixed",
        impactHorizon: "immediate",
        confidenceLevel: "high",
        explanation: {},
      },
    });

    expect(relevance.sourceSectorMismatch).toBe(true);
    expect(relevance.userRelevanceScore).toBeLessThan(0.25);
  });
});
