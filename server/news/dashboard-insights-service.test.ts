import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    sourceDocument: {
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
  id: string;
  sourceId: string;
  title: string;
  summary: string | null;
  canonicalUrl: string;
  publishedAt: Date | null;
  metadata: unknown;
  sourceName: string;
  sourceQualityScore: number;
}> = {}) {
  return {
    id: partial.id ?? "doc-1",
    sourceId: partial.sourceId ?? "newsweb",
    title: partial.title ?? "Market update",
    summary: partial.summary ?? null,
    canonicalUrl: partial.canonicalUrl ?? "https://news.example/item",
    originalUrl: null,
    bodyText: null,
    language: "nb",
    publishedAt: partial.publishedAt ?? new Date("2026-06-01T09:00:00Z"),
    fetchedAt: new Date("2026-06-01T09:01:00Z"),
    normalizedAt: new Date("2026-06-01T09:01:00Z"),
    metadata: partial.metadata ?? null,
    source: {
      id: partial.sourceId ?? "newsweb",
      name: partial.sourceName ?? "NewsWeb",
      qualityScore: partial.sourceQualityScore ?? 0.8,
      metadata: partial.metadata ?? null,
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    vi.clearAllMocks();
    clearDashboardInsightsCachesForTest();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "" })));
    prismaMock.company.findMany.mockResolvedValue([]);
    prismaMock.companyEventExposure.findMany.mockResolvedValue([]);
    prismaMock.sourceDocument.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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
        dataType: "company",
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
          eventType: "interest_rate_exposure",
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

  it("falls back to high-value events for prominent local companies when OBX and macro have no matches", async () => {
    prismaMock.workspace.findFirst.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "<html></html>" })));
    prismaMock.company.findMany.mockResolvedValue([]);
    prismaMock.companyEvent.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        event({
          id: "prominent-event",
          companyId: "equinor",
          companyName: "EQUINOR ASA",
          companySlug: "923609016-equinor-asa",
          title: "Equinor publishes operational update",
          investorValueScore: 70,
        }),
      ]);

    const insights = await getDashboardRelevantInsights("user-1", 8);

    expect(insights).toHaveLength(1);
    expect(insights[0]).toEqual(
      expect.objectContaining({
        id: "prominent-event",
        contextLabel: "EQUINOR ASA",
        href: "/companies/923609016-equinor-asa?tab=nyheter",
      }),
    );
    expect(prismaMock.companyEvent.findMany).toHaveBeenCalledTimes(2);
  });

  it("uses macro source documents when macro is not represented as company events", async () => {
    prismaMock.workspace.findFirst.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "<html></html>" })));
    prismaMock.company.findMany.mockResolvedValue([]);
    prismaMock.companyEvent.findMany.mockResolvedValue([]);
    prismaMock.sourceDocument.findMany.mockResolvedValue([
      sourceDocument({
        id: "macro-doc",
        sourceId: "google-news-semiconductors",
        sourceName: "Google News Semiconductors",
        sourceQualityScore: 0.7,
        metadata: { tier: "industry" },
        title: "Semiconductor stocks fall as investors question AI growth forecasts",
        summary: "Chip shares moved lower as investors reassessed AI demand expectations.",
        canonicalUrl: "https://news.example/semis-ai",
      }),
      sourceDocument({
        id: "noise-doc",
        sourceId: "google-news-ai-software",
        sourceName: "Google News AI and Software",
        sourceQualityScore: 0.68,
        metadata: { tier: "industry" },
        title: "What restorative justice teaches us in an age of artificial intelligence",
        summary: "A university essay about restorative justice.",
        canonicalUrl: "https://news.example/noise",
      }),
    ]);

    const insights = await getDashboardRelevantInsights("user-1", 8);

    expect(insights).toHaveLength(1);
    expect(insights[0]).toEqual(
      expect.objectContaining({
        id: "macro:macro-doc",
        title: "Semiconductor stocks fall as investors question AI growth forecasts",
        contextLabel: "Technology markets",
        href: "https://news.example/semis-ai",
        companyLabel: null,
        dataType: "industry",
      }),
    );
  });

  it("classifies SODIR as industry context and IEA as energy macro", async () => {
    prismaMock.workspace.findFirst.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "<html></html>" })));
    prismaMock.company.findMany.mockResolvedValue([]);
    prismaMock.companyEvent.findMany.mockResolvedValue([]);
    prismaMock.sourceDocument.findMany.mockResolvedValue([
      sourceDocument({
        id: "sodir-doc",
        sourceId: "sodir-exploration-results",
        sourceName: "Sokkeldirektoratet",
        sourceQualityScore: 0.9,
        metadata: { tier: "industry" },
        title: "New oil discovery in the North Sea",
        summary: "The discovery adds petroleum resources on the Norwegian continental shelf.",
      }),
      sourceDocument({
        id: "iea-doc",
        sourceId: "iea-news",
        sourceName: "IEA",
        sourceQualityScore: 0.94,
        metadata: { tier: "industry" },
        title: "Oil supply growth changes the global market outlook",
        summary: "Crude supply and demand expectations shift for energy markets.",
      }),
    ]);

    const insights = await getDashboardRelevantInsights("user-1", 8);

    expect(insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "macro:sodir-doc", dataType: "industry" }),
        expect.objectContaining({ id: "macro:iea-doc", dataType: "macro" }),
      ]),
    );
  });

  it("classifies broad stock-market moves as macro rather than industry news", async () => {
    prismaMock.workspace.findFirst.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "<html></html>" })));
    prismaMock.company.findMany.mockResolvedValue([]);
    prismaMock.companyEvent.findMany.mockResolvedValue([]);
    prismaMock.sourceDocument.findMany.mockResolvedValue([
      sourceDocument({
        id: "bbc-market-drop",
        sourceId: "bbc-business",
        sourceName: "BBC Business",
        sourceQualityScore: 0.8,
        metadata: { tier: "premium_media" },
        title: "US stocks slump as fears over Big Tech shake Wall Street",
        summary: "The Nasdaq saw its biggest daily fall since early 2025.",
      }),
    ]);

    const insights = await getDashboardRelevantInsights("user-1", 8);

    expect(insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "macro:bbc-market-drop",
          dataType: "macro",
        }),
      ]),
    );
  });

  it("fills the compact list with macro documents when company fallback only has highlighted items", async () => {
    prismaMock.workspace.findFirst.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "<html></html>" })));
    prismaMock.company.findMany.mockResolvedValue([]);
    prismaMock.companyEvent.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        event({
          id: "equinor-1",
          companyId: "equinor",
          companyName: "EQUINOR ASA",
          companySlug: "923609016-equinor-asa",
          title: "Equinor tunes up Bay du Nord hunt for installation vessels",
          investorValueScore: 75,
        }),
        event({
          id: "equinor-2",
          companyId: "equinor",
          companyName: "EQUINOR ASA",
          companySlug: "923609016-equinor-asa",
          title: "Former Equinor executive bolsters offshore management team",
          investorValueScore: 74,
        }),
      ]);
    prismaMock.sourceDocument.findMany.mockResolvedValue([
      sourceDocument({
        id: "macro-doc-1",
        sourceId: "google-news-ai-software",
        sourceName: "Google News AI and Software",
        metadata: { tier: "industry" },
        title: "Semiconductor stocks fall as investors question AI growth forecasts",
        summary: "Chip shares moved lower as investors reassessed AI demand expectations.",
      }),
      sourceDocument({
        id: "macro-doc-2",
        sourceId: "reuters-business",
        sourceName: "Reuters Business",
        metadata: { tier: "premium_media" },
        title: "Global markets drop as technology investors cut risk exposure",
        summary: "Equity markets weakened as investors reduced exposure to growth stocks.",
      }),
      sourceDocument({
        id: "macro-doc-3",
        sourceId: "bbc-business",
        sourceName: "BBC Business",
        metadata: { tier: "premium_media" },
        title: "Central bank rate outlook weighs on consumer and business investment",
        summary: "Markets reacted to interest rate expectations and slower investment growth.",
      }),
      sourceDocument({
        id: "macro-doc-4",
        sourceId: "guardian-business",
        sourceName: "The Guardian Business",
        metadata: { tier: "premium_media" },
        title: "AI capex concerns hit shares in major data center suppliers",
        summary: "Investors questioned whether artificial intelligence spending growth can continue.",
      }),
      sourceDocument({
        id: "macro-doc-5",
        sourceId: "scmp-business",
        sourceName: "SCMP Business",
        metadata: { tier: "premium_media" },
        title: "Chip supply demand reset raises concern across Asian technology markets",
        summary: "Semiconductor investors warned of weaker growth and falling market sentiment.",
      }),
      sourceDocument({
        id: "macro-doc-6",
        sourceId: "google-news-semiconductors",
        sourceName: "Google News Semiconductors",
        metadata: { tier: "industry" },
        title: "Nvidia and AMD shares tumble as Wall Street questions AI demand",
        summary: "Technology stocks fell as market expectations for AI growth cooled.",
      }),
    ]);

    const insights = await getDashboardRelevantInsights("user-1", 8);

    expect(insights).toHaveLength(8);
    expect(insights.slice(0, 2).map((item) => item.id)).toEqual(["equinor-1", "equinor-2"]);
    expect(insights.slice(2)).toHaveLength(6);
    expect(insights.slice(2).every((item) => item.id.startsWith("macro:"))).toBe(true);
  });
});
