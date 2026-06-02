import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    newsSource: {
      upsert: vi.fn(),
    },
    sourceDocument: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    newsSignal: {
      create: vi.fn(),
    },
    companyEvent: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    companyEventEvidence: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    companyEventExposure: {
      upsert: vi.fn(),
    },
    companyEventFeedback: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import {
  attachEventEvidence,
  listCompanyEvents,
  listSourceDocumentsForCompany,
  upsertCompanyEvent,
  upsertNewsSource,
  upsertSourceDocument,
} from "@/server/news/company-event-repository";

describe("company event repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts news sources by stable source id", async () => {
    prismaMock.newsSource.upsert.mockResolvedValue({ id: "newsweb" });

    await upsertNewsSource({
      id: "newsweb",
      name: "NewsWeb",
      sourceType: "official-disclosure",
      qualityScore: 0.9,
    });

    expect(prismaMock.newsSource.upsert).toHaveBeenCalledWith({
      where: { id: "newsweb" },
      update: {
        name: "NewsWeb",
        sourceType: "official-disclosure",
        qualityScore: 0.9,
      },
      create: {
        id: "newsweb",
        name: "NewsWeb",
        sourceType: "official-disclosure",
        qualityScore: 0.9,
      },
    });
  });

  it("uses sourceId and externalId as the preferred document upsert key", async () => {
    prismaMock.sourceDocument.upsert.mockResolvedValue({ id: "doc-1" });

    await upsertSourceDocument({
      sourceId: "eia",
      externalId: "press588",
      canonicalUrl: "https://www.eia.gov/pressroom/releases/press588.php",
      title: "EIA publishes energy outlook",
      language: "en",
    });

    expect(prismaMock.sourceDocument.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceId_externalId: {
            sourceId: "eia",
            externalId: "press588",
          },
        },
      }),
    );
    expect(prismaMock.sourceDocument.findFirst).not.toHaveBeenCalled();
  });

  it("falls back to canonical url or fingerprint when a document has no external id", async () => {
    prismaMock.sourceDocument.findFirst.mockResolvedValue({ id: "existing-doc" });
    prismaMock.sourceDocument.update.mockResolvedValue({ id: "existing-doc" });

    await upsertSourceDocument({
      sourceId: "sodir",
      canonicalUrl: "https://www.sodir.no/aktuelt/nyheter/funn",
      title: "Olje- og gassfunn i Norskehavet",
      documentFingerprint: "fp-1",
    });

    expect(prismaMock.sourceDocument.findFirst).toHaveBeenCalledWith({
      where: {
        sourceId: "sodir",
        OR: [{ canonicalUrl: "https://www.sodir.no/aktuelt/nyheter/funn" }, { documentFingerprint: "fp-1" }],
      },
      select: { id: true },
    });
    expect(prismaMock.sourceDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "existing-doc" },
      }),
    );
  });

  it("upserts company events by company and event fingerprint", async () => {
    prismaMock.companyEvent.upsert.mockResolvedValue({ id: "event-1" });

    await upsertCompanyEvent({
      companyId: "company-1",
      eventFingerprint: "eqnr-share-buyback-2026-05-27",
      eventType: "capital_markets",
      title: "Share buy-back announced",
      investorValueScore: 0.72,
    });

    expect(prismaMock.companyEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId_eventFingerprint: {
            companyId: "company-1",
            eventFingerprint: "eqnr-share-buyback-2026-05-27",
          },
        },
      }),
    );
  });

  it("attaches event evidence idempotently per event and document", async () => {
    prismaMock.companyEventEvidence.upsert.mockResolvedValue({ id: "evidence-1" });

    await attachEventEvidence({
      eventId: "event-1",
      documentId: "doc-1",
      evidenceType: "direct",
      relevanceScore: 0.91,
      reasons: ["Direkte omtale"],
    });

    expect(prismaMock.companyEventEvidence.upsert).toHaveBeenCalledWith({
      where: {
        eventId_documentId: {
          eventId: "event-1",
          documentId: "doc-1",
        },
      },
      update: {
        evidenceType: "direct",
        relevanceScore: 0.91,
        reasons: ["Direkte omtale"],
      },
      create: {
        eventId: "event-1",
        documentId: "doc-1",
        evidenceType: "direct",
        relevanceScore: 0.91,
        reasons: ["Direkte omtale"],
      },
    });
  });

  it("lists company events by investor value and recency with optional evidence", async () => {
    prismaMock.companyEvent.findMany.mockResolvedValue([]);

    await listCompanyEvents("company-1", {
      limit: 25,
      minInvestorValueScore: 0.4,
      status: "ACTIVE",
      includeEvidence: true,
    });

    expect(prismaMock.companyEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: "company-1",
          status: "ACTIVE",
          investorValueScore: { gte: 0.4 },
        },
        orderBy: [{ investorValueScore: "desc" }, { lastSeen: "desc" }],
        take: 25,
      }),
    );
  });

  it("lists source documents linked through signals or event evidence", async () => {
    prismaMock.sourceDocument.findMany.mockResolvedValue([]);

    await listSourceDocumentsForCompany("company-1", { sourceId: "eia", limit: 500 });

    expect(prismaMock.sourceDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceId: "eia",
          OR: [
            { signals: { some: { companyId: "company-1" } } },
            { eventEvidence: { some: { event: { companyId: "company-1" } } } },
          ],
        },
        take: 200,
      }),
    );
  });
});
