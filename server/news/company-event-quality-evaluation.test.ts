import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    sourceDocument: {
      findMany: vi.fn(),
    },
    companyEvent: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    companyEventFeedback: {
      findMany: vi.fn(),
    },
    companyEventExposure: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { evaluateCompanyEventIntelligence } from "@/server/news/company-event-quality-evaluation";

describe("company event quality evaluation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.companyEvent.findFirst.mockResolvedValue(null);
  });

  it("computes actionable event quality metrics", async () => {
    prismaMock.sourceDocument.findMany.mockResolvedValue([
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `doc-${index}`,
        sourceId: "noisy-source",
        source: {
          id: "noisy-source",
          sourceType: "rss",
          metadata: { tier: "general" },
        },
      })),
      {
        id: "doc-good",
        sourceId: "newsweb",
        source: {
          id: "newsweb",
          sourceType: "newsweb",
          metadata: { tier: "primary" },
        },
      },
    ]);
    prismaMock.companyEvent.findMany.mockResolvedValue([
      {
        id: "event-1",
        companyId: "company-1",
        eventType: "mna",
        title: "High score weak evidence",
        investorValueScore: 82,
        confidenceScore: 0.62,
        metadata: {
          scoreComponents: {
            entityConfidence: 0.42,
          },
        },
        company: {
          name: "Example ASA",
        },
        evidence: [
          {
            reasons: ["ambiguous_common_name"],
            relevanceScore: 0.5,
            document: {
              sourceId: "newsweb",
              source: {
                sourceType: "newsweb",
                metadata: { tier: "primary" },
              },
            },
          },
        ],
      },
      {
        id: "event-2",
        companyId: "company-1",
        eventType: "sector_news",
        title: "Low value event",
        investorValueScore: 20,
        confidenceScore: 0.5,
        metadata: {},
        company: {
          name: "Example ASA",
        },
        evidence: [],
      },
    ]);
    prismaMock.companyEventFeedback.findMany.mockResolvedValue([
      { action: "wrong_company", label: "NOT_RELEVANT" },
      { action: "relevant", label: "RELEVANT" },
    ]);
    prismaMock.companyEventExposure.findMany.mockResolvedValue([
      { exposureType: "direct" },
      { exposureType: "petroleum" },
    ]);

    const report = await evaluateCompanyEventIntelligence({ limit: 100 });

    expect(report.totals).toEqual({
      sourceDocuments: 13,
      companyEvents: 2,
      feedback: 2,
    });
    expect(report.scoreStats.averageInvestorValueScore).toBe(51);
    expect(report.eventsByType).toEqual({ mna: 1, sector_news: 1 });
    expect(report.eventsBySource).toEqual({ newsweb: 1 });
    expect(report.eventsBySourceTier).toEqual({ primary: 1 });
    expect(report.exposuresByType).toEqual({ direct: 1, petroleum: 1 });
    expect(report.feedbackByAction).toEqual({ wrong_company: 1, relevant: 1 });
    expect(report.falsePositiveCandidates.lowEntityConfidenceHighScore).toHaveLength(1);
    expect(report.falsePositiveCandidates.highScoreWeakEvidence).toHaveLength(1);
    expect(report.falsePositiveCandidates.commonNameMatches).toHaveLength(1);
    expect(report.staleNoisySourceCandidates).toEqual([
      {
        sourceId: "noisy-source",
        documentCount: 12,
        eventCount: 0,
        eventRate: 0,
      },
    ]);
    expect(report.curatedGoldSet.totalCases).toBeGreaterThan(0);
    expect(report.curatedGoldSet.matchedCases).toBe(0);
    expect(report.curatedGoldSet.passRate).toBeNull();
  });
});
