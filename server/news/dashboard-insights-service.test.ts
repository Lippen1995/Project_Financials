import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    workspace: {
      findFirst: vi.fn(),
    },
    company: {
      findMany: vi.fn(),
    },
    companyEvent: {
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

import {
  clearDashboardInsightsCachesForTest,
  getDashboardRelevantInsights,
} from "@/server/news/dashboard-insights-service";

function sourceDocument(partial: Partial<{
  title: string;
  canonicalUrl: string;
  publishedAt: Date | null;
  metadata: unknown;
  sourceName: string;
}> = {}) {
  return {
    title: partial.title ?? "Market update",
    canonicalUrl: partial.canonicalUrl ?? "https://news.example/item",
    originalUrl: null,
    summary: null,
    bodyText: null,
    language: "nb",
    publishedAt: partial.publishedAt ?? new Date("2026-06-01T09:00:00Z"),
    fetchedAt: new Date("2026-06-01T09:01:00Z"),
    normalizedAt: new Date("2026-06-01T09:01:00Z"),
    metadata: partial.metadata ?? null,
    source: {
      id: "newsweb",
      name: partial.sourceName ?? "NewsWeb",
    },
  };
}

function event(partial: Partial<{
  id: string;
  companyId: string;
  companyName: string;
  companySlug: string;
  title: string;
  summary: string | null;
  investorValueScore: number;
  confidenceScore: number;
  eventType: string;
  lastSeen: Date;
}> = {}) {
  return {
    id: partial.id ?? "event-1",
    companyId: partial.companyId ?? "company-1",
    eventType: partial.eventType ?? "contract",
    title: partial.title ?? "Company wins major contract",
    summary: partial.summary ?? "Issuer announcement.",
    eventDate: new Date("2026-06-01T09:00:00Z"),
    lastSeen: partial.lastSeen ?? new Date("2026-06-01T09:00:00Z"),
    investorValueScore: partial.investorValueScore ?? 70,
    confidenceScore: partial.confidenceScore ?? 0.9,
    company: {
      id: partial.companyId ?? "company-1",
      slug: partial.companySlug ?? "company-one",
      name: partial.companyName ?? "Company One ASA",
      industryCode: { title: "Energi" },
    },
    evidence: [
      {
        documentId: `${partial.id ?? "event-1"}-doc`,
        relevanceScore: 0.9,
        confidenceScore: 0.9,
        reasons: [],
        document: sourceDocument({ title: partial.title }),
      },
    ],
  };
}

describe("dashboard insights service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearDashboardInsightsCachesForTest();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "" })));
    prismaMock.company.findMany.mockResolvedValue([]);
    prismaMock.companyEventExposure.findMany.mockResolvedValue([]);
  });

  it("returns presentation-ready insights from the personal workspace universe", async () => {
    prismaMock.workspace.findFirst.mockResolvedValue({
      id: "workspace-1",
      watches: [
        {
          companyId: "watch-company",
          createdAt: new Date("2026-05-20T09:00:00Z"),
          updatedAt: new Date("2026-05-20T09:00:00Z"),
        },
      ],
      ddRooms: [
        {
          primaryCompanyId: "dd-company",
          lastActivityAt: new Date("2026-06-01T09:00:00Z"),
        },
      ],
    });

    prismaMock.companyEvent.findMany
      .mockResolvedValueOnce([
        event({
          id: "dd-event",
          companyId: "dd-company",
          companyName: "DD Target ASA",
          companySlug: "dd-target",
          title: "DD target receives regulatory approval",
          investorValueScore: 68,
        }),
        event({
          id: "watch-event",
          companyId: "watch-company",
          companyName: "Watched Company ASA",
          companySlug: "watched-company",
          title: "Watched company signs supply agreement",
          investorValueScore: 71,
        }),
      ])
      .mockResolvedValueOnce([]);

    const insights = await getDashboardRelevantInsights("user-1", 8);

    expect(insights).toHaveLength(2);
    expect(insights[0]).toEqual(
      expect.objectContaining({
        id: "dd-event",
        title: "DD target receives regulatory approval",
        contextLabel: "DD Target ASA",
        href: "/companies/dd-target?tab=nyheter",
      }),
    );
    expect(insights[0]).not.toHaveProperty("score");
    expect(insights[0]).not.toHaveProperty("companyPriority");
  });

  it("uses OBX and macro fallback without exposing fallback metadata in the UI shape", async () => {
    prismaMock.workspace.findFirst.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () => "<table><tr><td>DNB BANK</td><td>NO0010161896</td><td>XOSL</td></tr></table>",
      })),
    );
    prismaMock.company.findMany.mockResolvedValue([{ id: "dnb", name: "DNB Bank ASA" }]);
    prismaMock.companyEvent.findMany
      .mockResolvedValueOnce([
        event({
          id: "obx-event",
          companyId: "dnb",
          companyName: "DNB Bank ASA",
          companySlug: "dnb-bank",
          title: "DNB publishes market update",
          investorValueScore: 76,
        }),
      ])
      .mockResolvedValueOnce([
        event({
          id: "macro-event",
          companyId: "macro-company",
          companyName: "Market Source AS",
          companySlug: "market-source",
          title: "Interest rate signal affects credit markets",
          eventType: "interest_rate",
          investorValueScore: 74,
        }),
      ]);

    const insights = await getDashboardRelevantInsights("user-1", 8);

    expect(insights.map((item) => item.id)).toEqual(["obx-event", "macro-event"]);
    expect(insights[0]).toEqual(
      expect.not.objectContaining({
        fallbackType: expect.anything(),
      }),
    );
    expect(insights[0].contextLabel).toBe("DNB Bank ASA");
  });
});
