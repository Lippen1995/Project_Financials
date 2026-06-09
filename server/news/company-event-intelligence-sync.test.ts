import { beforeEach, describe, expect, it, vi } from "vitest";

const { ingestionMock, entityResolutionMock, extractorMock, readAcrossMock, prismaMock } = vi.hoisted(() => ({
  ingestionMock: {
    syncNewsSources: vi.fn(),
  },
  entityResolutionMock: {
    resolveCompanyEntitiesForRecentDocuments: vi.fn(),
  },
  extractorMock: {
    extractCompanyEventsFromRecentDocuments: vi.fn(),
  },
  readAcrossMock: {
    createReadAcrossExposuresForRecentEvents: vi.fn(),
  },
  prismaMock: {
    sourceDocument: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    newsSignal: {
      deleteMany: vi.fn(),
    },
    companyEventEvidence: {
      deleteMany: vi.fn(),
    },
    companyEvent: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/server/news/company-event-ingestion-service", () => ingestionMock);
vi.mock("@/server/news/company-entity-resolution", () => entityResolutionMock);
vi.mock("@/server/news/company-event-extractor", () => extractorMock);
vi.mock("@/server/news/company-event-read-across", () => readAcrossMock);

import { syncCompanyEventIntelligence } from "@/server/news/company-event-intelligence-sync";

describe("company event intelligence sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not reprocess stale documents when ingestion produced no changes", async () => {
    ingestionMock.syncNewsSources.mockResolvedValue({
      sourcesProcessed: 1,
      sourcesFailed: 1,
      documentsFetched: 0,
      documentsCreated: 0,
      documentsUpdated: 0,
      documentsDuplicate: 0,
      errors: ["fetch failed"],
    });
    const onProgress = vi.fn();

    const result = await syncCompanyEventIntelligence({
      sourceIds: ["oslobors"],
      onProgress,
    });

    expect(entityResolutionMock.resolveCompanyEntitiesForRecentDocuments).not.toHaveBeenCalled();
    expect(extractorMock.extractCompanyEventsFromRecentDocuments).not.toHaveBeenCalled();
    expect(readAcrossMock.createReadAcrossExposuresForRecentEvents).not.toHaveBeenCalled();
    expect(prismaMock.sourceDocument.findMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      entityResolution: { documentsProcessed: 0, signalsCreated: 0 },
      extraction: { documentsProcessed: 0, eventsUpserted: 0, evidenceAttached: 0 },
      readAcross: { eventsProcessed: 0, companiesEvaluated: 0, exposuresCreated: 0, exposuresRemoved: 0 },
    });
    expect(onProgress).toHaveBeenCalledWith("ingestion", {
      documentsFetched: 0,
      documentsCreated: 0,
      documentsUpdated: 0,
      sourcesFailed: 1,
    });
  });

  it("removes event evidence that no longer matches resolved company signals", async () => {
    ingestionMock.syncNewsSources.mockResolvedValue({
      sourcesProcessed: 1,
      sourcesFailed: 0,
      documentsFetched: 1,
      documentsCreated: 0,
      documentsUpdated: 1,
      documentsDuplicate: 0,
      errors: [],
    });
    prismaMock.sourceDocument.findMany
      .mockResolvedValueOnce([{ id: "doc-1" }])
      .mockResolvedValueOnce([
        {
          id: "doc-1",
          title: "Issuer announces dividend",
          summary: null,
          bodyText: null,
          sourcePayload: null,
          source: {
            id: "oslobors",
            sourceType: "newsweb",
            qualityScore: 0.95,
            metadata: {},
          },
          signals: [{ companyId: "issuer-company" }],
          eventEvidence: [
            {
              id: "evidence-correct",
              eventId: "event-correct",
              event: { companyId: "issuer-company", eventType: "dividend" },
            },
            {
              id: "evidence-wrong",
              eventId: "event-wrong",
              event: { companyId: "subsidiary-company", eventType: "dividend" },
            },
          ],
        },
      ]);
    prismaMock.newsSignal.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.companyEventEvidence.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.companyEvent.findMany.mockResolvedValue([{ id: "event-wrong" }]);
    prismaMock.companyEvent.updateMany.mockResolvedValue({ count: 1 });
    entityResolutionMock.resolveCompanyEntitiesForRecentDocuments.mockResolvedValue({
      documentsProcessed: 1,
      signalsCreated: 1,
    });
    extractorMock.extractCompanyEventsFromRecentDocuments.mockResolvedValue({
      documentsProcessed: 1,
      eventsUpserted: 1,
      evidenceAttached: 1,
    });
    readAcrossMock.createReadAcrossExposuresForRecentEvents.mockResolvedValue({
      eventsProcessed: 1,
      companiesEvaluated: 10,
      exposuresCreated: 1,
    });

    const result = await syncCompanyEventIntelligence({
      sourceIds: ["oslobors"],
      limit: 500,
    });

    expect(entityResolutionMock.resolveCompanyEntitiesForRecentDocuments).toHaveBeenCalledWith({
      limit: 500,
      sourceIds: ["oslobors"],
    });
    expect(prismaMock.sourceDocument.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          sourceId: { in: ["oslobors"] },
          OR: [
            {
              signals: {
                some: {
                  signalType: "company_mention",
                  companyId: { not: null },
                },
              },
            },
            { eventEvidence: { some: {} } },
          ],
        },
      }),
    );
    expect(prismaMock.companyEventEvidence.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["evidence-wrong"] } },
    });
    expect(prismaMock.companyEvent.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["event-wrong"] } },
      data: { status: "INACTIVE" },
    });
    expect(result.reconciliation).toEqual({
      evidenceRemoved: 1,
      eventsDeactivated: 1,
    });
  });

  it("can reprocess the full selected source history", async () => {
    ingestionMock.syncNewsSources.mockResolvedValue({
      sourcesProcessed: 1,
      sourcesFailed: 0,
      documentsFetched: 0,
      documentsCreated: 0,
      documentsUpdated: 0,
      documentsDuplicate: 0,
      errors: [],
    });
    prismaMock.sourceDocument.count.mockResolvedValue(3200);
    prismaMock.sourceDocument.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    entityResolutionMock.resolveCompanyEntitiesForRecentDocuments.mockResolvedValue({
      documentsProcessed: 3200,
      signalsCreated: 0,
    });
    extractorMock.extractCompanyEventsFromRecentDocuments.mockResolvedValue({
      documentsProcessed: 3200,
      eventsUpserted: 0,
      evidenceAttached: 0,
    });
    readAcrossMock.createReadAcrossExposuresForRecentEvents.mockResolvedValue({
      eventsProcessed: 0,
      companiesEvaluated: 0,
      exposuresCreated: 0,
    });

    await syncCompanyEventIntelligence({
      sourceIds: ["oslobors"],
      fullReprocess: true,
    });

    expect(prismaMock.sourceDocument.count).toHaveBeenCalledWith({
      where: { sourceId: { in: ["oslobors"] } },
    });
    expect(entityResolutionMock.resolveCompanyEntitiesForRecentDocuments).toHaveBeenCalledWith({
      limit: 3200,
      sourceIds: ["oslobors"],
    });
    expect(extractorMock.extractCompanyEventsFromRecentDocuments).toHaveBeenCalledWith({
      limit: 3200,
      sourceIds: ["oslobors"],
    });
  });
});
