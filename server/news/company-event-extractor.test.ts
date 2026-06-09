import { beforeEach, describe, expect, it, vi } from "vitest";

const { repositoryMock } = vi.hoisted(() => ({
  repositoryMock: {
    upsertCompanyEvent: vi.fn(),
    attachEventEvidence: vi.fn(),
    upsertCompanyEventExposure: vi.fn(),
  },
}));

vi.mock("@/server/news/company-event-repository", () => repositoryMock);
vi.mock("@/server/news/company-event-user-relevance", () => ({
  buildCompanyEventUserRelevanceContext: vi.fn(async () => ({
    companyId: "eqnr",
    orgNumber: "923609016",
    industryCode: "06.100",
    industryPrefixes: ["06", "0610"],
    sectorTags: ["energy", "oil_gas", "offshore"],
    isPetroleumCompany: true,
    activeWatchCount: 2,
  })),
  computeCompanyEventUserRelevance: vi.fn(() => ({
    userRelevanceScore: 0.82,
    sectorFitScore: 0.78,
    watchlistIntensity: 0.4,
    sourceTopicScore: 0.9,
    sourceSectorMismatch: false,
    sourceSectorTags: ["energy", "oil_gas", "offshore"],
    companySectorTags: ["energy", "oil_gas", "offshore"],
  })),
}));

import { extractCompanyEventsFromDocument } from "@/server/news/company-event-extractor";

function buildDocument(partial: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    sourceId: "newsweb",
    externalId: "msg-1",
    canonicalUrl: "https://newsweb.oslobors.no/message/1",
    originalUrl: "https://newsweb.oslobors.no/message/1",
    title: "Equinor ASA: Share buy-back - second tranche for 2026",
    summary: "Issuer announcement.",
    bodyText: null,
    language: "en",
    publishedAt: new Date("2026-05-27T08:00:00Z"),
    fetchedAt: new Date("2026-05-27T08:01:00Z"),
    normalizedAt: new Date("2026-05-27T08:01:00Z"),
    contentHash: "hash",
    documentFingerprint: "fp",
    sourcePayload: null,
    metadata: null,
    createdAt: new Date("2026-05-27T08:01:00Z"),
    updatedAt: new Date("2026-05-27T08:01:00Z"),
    source: {
      id: "newsweb",
      name: "NewsWeb",
      sourceType: "newsweb",
      baseUrl: null,
      rssUrl: null,
      apiUrl: null,
      language: "en",
      country: "NO",
      qualityScore: 0.92,
      status: "ACTIVE",
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    signals: [
      {
        id: "signal-1",
        documentId: "doc-1",
        companyId: "eqnr",
        signalType: "company_mention",
        subtype: "headline",
        strength: 0.9,
        confidence: 0.91,
        valueScore: 0.91,
        direction: null,
        horizon: null,
        keywords: ["Equinor ASA"],
        evidence: { evidence: [] },
        detectorVersion: "company-entity-resolution-v1",
        createdAt: new Date(),
      },
    ],
    ...partial,
  } as any;
}

describe("company event extractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMock.upsertCompanyEvent.mockResolvedValue({ id: "event-1" });
    repositoryMock.attachEventEvidence.mockResolvedValue({ id: "evidence-1" });
    repositoryMock.upsertCompanyEventExposure.mockResolvedValue({ id: "exposure-1" });
  });

  it("turns company mention signals into company events and evidence", async () => {
    const result = await extractCompanyEventsFromDocument(buildDocument());

    expect(result).toEqual({ eventsUpserted: 1, evidenceAttached: 1 });
    expect(repositoryMock.upsertCompanyEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "eqnr",
        eventType: "buyback",
        title: "Equinor ASA: Share buy-back - second tranche for 2026",
        investorValueScore: expect.any(Number),
        metadata: expect.objectContaining({
          classification: expect.objectContaining({ eventType: "buyback" }),
          userRelevance: expect.objectContaining({
            userRelevanceScore: 0.82,
          }),
        }),
      }),
    );
    expect(repositoryMock.attachEventEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        documentId: "doc-1",
        evidenceType: "company_mention",
        featureSnapshot: expect.objectContaining({
          userRelevance: expect.objectContaining({
            userRelevanceScore: 0.82,
          }),
        }),
      }),
    );
    expect(repositoryMock.upsertCompanyEventExposure).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        companyId: "eqnr",
        exposureType: "direct",
        exposureScore: 0.91,
      }),
    );
  });

  it("attaches multiple source documents to the same stable event fingerprint", async () => {
    await extractCompanyEventsFromDocument(buildDocument({ id: "doc-1", externalId: null }));
    await extractCompanyEventsFromDocument(
      buildDocument({
        id: "doc-2",
        externalId: null,
        title: "Equinor ASA announces share buyback second tranche 2026",
        canonicalUrl: "https://example.com/followup",
      }),
    );

    const first = repositoryMock.upsertCompanyEvent.mock.calls[0][0].eventFingerprint;
    const second = repositoryMock.upsertCompanyEvent.mock.calls[1][0].eventFingerprint;
    expect(first).toBe(second);
    expect(repositoryMock.attachEventEvidence).toHaveBeenCalledTimes(2);
    expect(repositoryMock.upsertCompanyEventExposure).toHaveBeenCalledTimes(2);
  });

  it("ignores weak company mention signals", async () => {
    const result = await extractCompanyEventsFromDocument(
      buildDocument({
        signals: [
          {
            id: "signal-weak",
            documentId: "doc-1",
            companyId: "eqnr",
            signalType: "company_mention",
            subtype: "body",
            strength: 0.3,
            confidence: 0.32,
            valueScore: 0.32,
            direction: null,
            horizon: null,
            keywords: [],
            evidence: null,
            detectorVersion: "company-entity-resolution-v1",
            createdAt: new Date(),
          },
        ],
      }),
    );

    expect(result).toEqual({ eventsUpserted: 0, evidenceAttached: 0 });
    expect(repositoryMock.upsertCompanyEvent).not.toHaveBeenCalled();
    expect(repositoryMock.upsertCompanyEventExposure).not.toHaveBeenCalled();
  });

  it("does not promote low-signal company mentions into investor events", async () => {
    const result = await extractCompanyEventsFromDocument(
      buildDocument({
        title: "Equinor ASA mentioned in local business roundup",
        summary: "The article lists several companies in passing.",
      }),
    );

    expect(result).toEqual({ eventsUpserted: 0, evidenceAttached: 0 });
    expect(repositoryMock.upsertCompanyEvent).not.toHaveBeenCalled();
    expect(repositoryMock.attachEventEvidence).not.toHaveBeenCalled();
    expect(repositoryMock.upsertCompanyEventExposure).not.toHaveBeenCalled();
  });

  it("does not assign company-specific events to body-only mentioned companies", async () => {
    const result = await extractCompanyEventsFromDocument(
      buildDocument({
        bodyText: "Aker BP ASA was mentioned as a sector peer in the background section.",
        signals: [
          {
            id: "signal-issuer",
            documentId: "doc-1",
            companyId: "eqnr",
            signalType: "company_mention",
            subtype: "headline",
            strength: 0.9,
            confidence: 0.91,
            valueScore: 0.91,
            direction: null,
            horizon: null,
            keywords: ["Equinor ASA"],
            evidence: { evidence: [] },
            detectorVersion: "company-entity-resolution-v1",
            createdAt: new Date(),
          },
          {
            id: "signal-body-peer",
            documentId: "doc-1",
            companyId: "akerbp",
            signalType: "company_mention",
            subtype: "body",
            strength: 0.88,
            confidence: 0.88,
            valueScore: 0.88,
            direction: null,
            horizon: null,
            keywords: ["Aker BP ASA"],
            evidence: { evidence: [] },
            detectorVersion: "company-entity-resolution-v1",
            createdAt: new Date(),
          },
        ],
      }),
    );

    expect(result).toEqual({ eventsUpserted: 1, evidenceAttached: 1 });
    expect(repositoryMock.upsertCompanyEvent).toHaveBeenCalledTimes(1);
    expect(repositoryMock.upsertCompanyEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "eqnr",
        eventType: "buyback",
      }),
    );
    expect(repositoryMock.upsertCompanyEventExposure).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "eqnr",
      }),
    );
  });

  it("does not promote short acronym-only matches from open RSS sources", async () => {
    const result = await extractCompanyEventsFromDocument(
      buildDocument({
        sourceId: "reuters-business",
        title: "HPE shares soar after strong quarterly demand",
        summary: "HPE reported stronger infrastructure sales.",
        source: {
          ...buildDocument().source,
          id: "reuters-business",
          sourceType: "rss",
        },
        signals: [
          {
            ...buildDocument().signals[0],
            companyId: "hans-petter-engineering",
            confidence: 0.78,
            evidence: {
              evidence: [
                { kind: "alias_title", value: "HPE", score: 0.6, location: "title" },
                { kind: "alias_summary", value: "HPE", score: 0.5, location: "summary" },
              ],
            },
          },
        ],
      }),
    );

    expect(result).toEqual({ eventsUpserted: 0, evidenceAttached: 0 });
    expect(repositoryMock.upsertCompanyEvent).not.toHaveBeenCalled();
  });
});
