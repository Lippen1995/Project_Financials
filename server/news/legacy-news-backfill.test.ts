import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, repositoryMock } = vi.hoisted(() => ({
  prismaMock: {
    newsArticle: {
      findMany: vi.fn(),
    },
    newsSignal: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
  repositoryMock: {
    upsertNewsSource: vi.fn(),
    upsertSourceDocument: vi.fn(),
    upsertCompanyEvent: vi.fn(),
    attachEventEvidence: vi.fn(),
    upsertCompanyEventExposure: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));
vi.mock("@/server/news/company-event-repository", () => repositoryMock);

import { backfillLegacyNewsArticlesToCompanyEvents } from "@/server/news/legacy-news-backfill";

function article() {
  return {
    id: "article-1",
    guid: "guid-1",
    title: "Equinor ASA announces share buy-back",
    summary: "Issuer announcement from NewsWeb.",
    url: "https://newsweb.oslobors.no/message/1",
    publishedAt: new Date("2026-05-27T08:00:00Z"),
    source: "newsweb",
    category: "ACQUISITION OR DISPOSAL OF AN ISSUER'S OWN SHARES",
    createdAt: new Date("2026-05-27T08:01:00Z"),
    extraction: null,
    companies: [
      {
        newsArticleId: "article-1",
        companyId: "eqnr",
        matchScore: 0.91,
        company: {
          id: "eqnr",
          name: "Equinor ASA",
        },
      },
    ],
    relevanceScores: [],
  };
}

describe("legacy news backfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMock.upsertSourceDocument.mockResolvedValue({ id: "doc-1" });
    repositoryMock.upsertCompanyEvent.mockResolvedValue({ id: "event-1" });
    repositoryMock.attachEventEvidence.mockResolvedValue({ id: "evidence-1" });
    repositoryMock.upsertCompanyEventExposure.mockResolvedValue({ id: "exposure-1" });
    prismaMock.newsSignal.findFirst.mockResolvedValue(null);
    prismaMock.newsSignal.create.mockResolvedValue({ id: "signal-1" });
  });

  it("handles an empty legacy news table", async () => {
    prismaMock.newsArticle.findMany.mockResolvedValue([]);

    const result = await backfillLegacyNewsArticlesToCompanyEvents();

    expect(result).toEqual({
      articlesScanned: 0,
      sourceDocumentsUpserted: 0,
      signalsCreated: 0,
      signalsExisting: 0,
      eventsUpserted: 0,
      evidenceAttached: 0,
      exposuresUpserted: 0,
    });
  });

  it("converts a legacy news article into source document, event, evidence and exposure", async () => {
    prismaMock.newsArticle.findMany.mockResolvedValue([article()]);

    const result = await backfillLegacyNewsArticlesToCompanyEvents({ limit: 10 });

    expect(result).toEqual({
      articlesScanned: 1,
      sourceDocumentsUpserted: 1,
      signalsCreated: 1,
      signalsExisting: 0,
      eventsUpserted: 1,
      evidenceAttached: 1,
      exposuresUpserted: 1,
    });
    expect(repositoryMock.upsertNewsSource).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "newsweb",
        sourceType: "newsweb",
      }),
    );
    expect(repositoryMock.upsertSourceDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "newsweb",
        externalId: "guid-1",
        canonicalUrl: "https://newsweb.oslobors.no/message/1",
      }),
    );
    expect(repositoryMock.upsertCompanyEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "eqnr",
        eventType: "buyback",
        investorValueScore: expect.any(Number),
        metadata: expect.objectContaining({
          migratedFrom: "NewsArticle",
          legacyNewsArticleId: "article-1",
        }),
      }),
    );
    expect(repositoryMock.upsertCompanyEventExposure).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        companyId: "eqnr",
        exposureType: "direct",
      }),
    );
  });

  it("is idempotent for legacy signals", async () => {
    prismaMock.newsArticle.findMany.mockResolvedValue([article()]);
    prismaMock.newsSignal.findFirst.mockResolvedValue({ id: "existing-signal" });

    const result = await backfillLegacyNewsArticlesToCompanyEvents({ limit: 10 });

    expect(result.signalsCreated).toBe(0);
    expect(result.signalsExisting).toBe(1);
    expect(prismaMock.newsSignal.create).not.toHaveBeenCalled();
  });
});
