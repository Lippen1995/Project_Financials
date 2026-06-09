import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
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

import { getCompanyEventTimeline } from "@/server/news/company-event-timeline-service";

function evidence(documentId: string) {
  return {
    documentId,
    relevanceScore: 0.9,
    confidenceScore: 0.88,
    reasons: ["company_mention"],
    document: {
      title: "Equinor ASA: Share buy-back",
      canonicalUrl: "https://newsweb.oslobors.no/message/1",
      publishedAt: new Date("2026-05-27T08:00:00Z"),
      source: {
        id: "newsweb",
        name: "NewsWeb",
      },
    },
  };
}

describe("company event timeline service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps direct and indirect event exposures into a stable timeline response", async () => {
    prismaMock.companyEvent.findMany.mockResolvedValue([
      {
        id: "event-direct",
        companyId: "eqnr",
        eventType: "buyback",
        title: "Equinor ASA: Share buy-back",
        summary: "Issuer announcement.",
        eventDate: new Date("2026-05-27T08:00:00Z"),
        lastSeen: new Date("2026-05-27T08:00:00Z"),
        status: "ACTIVE",
        investorValueScore: 64,
        confidenceScore: 0.9,
        noveltyScore: 0.4,
        severityScore: 0.3,
        engineVersion: "company-event-v1",
        company: {
          id: "eqnr",
          name: "Equinor ASA",
        },
        evidence: [evidence("doc-direct")],
      },
    ]);
    prismaMock.companyEventExposure.findMany.mockResolvedValue([
      {
        eventId: "event-read",
        companyId: "akerbp",
        exposureType: "petroleum",
        exposureScore: 0.74,
        confidenceScore: 0.76,
        rationale: "Petroleumsrelatert read-across.",
        metadata: {
          reasons: ["petroleum_event", "petroleum_company_exposure"],
        },
        event: {
          id: "event-read",
          companyId: "eqnr",
          eventType: "production_update",
          title: "Oil and gas discovery in the Norwegian Sea",
          summary: "Discovery affects production outlook.",
          eventDate: new Date("2026-05-28T08:00:00Z"),
          lastSeen: new Date("2026-05-28T08:00:00Z"),
          status: "ACTIVE",
          investorValueScore: 72,
          confidenceScore: 0.82,
          noveltyScore: 0.7,
          severityScore: 0.6,
          engineVersion: "company-event-v1",
          company: {
            id: "eqnr",
            name: "Equinor ASA",
          },
          evidence: [evidence("doc-read")],
        },
      },
    ]);

    const result = await getCompanyEventTimeline("akerbp", { limit: 10 });

    expect(result.meta).toEqual({
      limit: 10,
      minInvestorValueScore: 35,
      minExposureScore: 0.65,
    });
    expect(prismaMock.companyEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventType: { notIn: ["low_signal_mention"] },
          investorValueScore: { gte: 35 },
        }),
      }),
    );
    expect(prismaMock.companyEventExposure.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          exposureType: { not: "direct" },
          exposureScore: { gte: 0.65 },
          event: expect.objectContaining({
            eventType: { in: expect.arrayContaining(["production_update", "regulatory_change"]) },
            investorValueScore: { gte: 35 },
            OR: expect.arrayContaining([
              expect.objectContaining({ eventDate: expect.any(Object) }),
              expect.objectContaining({ eventDate: null }),
            ]),
          }),
        }),
      }),
    );
    expect(result.data).toHaveLength(2);
    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: "event-read",
          exposure: expect.objectContaining({
            type: "petroleum",
            sourceCompanyName: "Equinor ASA",
            reasons: ["petroleum_event", "petroleum_company_exposure"],
          }),
        }),
        expect.objectContaining({
          eventId: "event-direct",
          exposure: expect.objectContaining({
            type: "direct",
            reasons: ["direct_company_event"],
          }),
          evidence: [
            expect.objectContaining({
              documentId: "doc-direct",
              url: "https://newsweb.oslobors.no/message/1",
            }),
          ],
        }),
      ]),
    );
  });
});
