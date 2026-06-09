import { beforeEach, describe, expect, it, vi } from "vitest";

const { repositoryMock, prismaMock } = vi.hoisted(() => ({
  repositoryMock: {
    upsertCompanyEventExposure: vi.fn(),
  },
  prismaMock: {
    companyEvent: {
      findMany: vi.fn(),
    },
    company: {
      findMany: vi.fn(),
    },
    companyEventExposure: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/server/news/company-event-repository", () => repositoryMock);
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import {
  createDirectCompanyEventExposure,
  createReadAcrossExposuresForRecentEvents,
  persistReadAcrossExposures,
} from "@/server/news/company-event-read-across";

describe("company event read-across", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMock.upsertCompanyEventExposure.mockResolvedValue({ id: "exposure-1" });
    prismaMock.companyEventExposure.updateMany.mockResolvedValue({ count: 0 });
  });

  it("persists direct exposure with stable metadata", async () => {
    await createDirectCompanyEventExposure({
      eventId: "event-1",
      companyId: "eqnr",
      metadata: {
        documentId: "doc-1",
      },
    });

    expect(repositoryMock.upsertCompanyEventExposure).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        companyId: "eqnr",
        exposureType: "direct",
        rationale: expect.stringContaining("Direkte"),
        metadata: expect.objectContaining({
          engineVersion: "company-event-exposure-v2",
          documentId: "doc-1",
        }),
      }),
    );
  });

  it("persists conservative indirect exposures with explanations", async () => {
    const result = await persistReadAcrossExposures({
      event: {
        eventId: "event-1",
        sourceCompanyId: "eqnr",
        eventType: "production_update",
        title: "Sokkeldirektoratet: Oil and gas discovery in the Norwegian Sea",
        summary: "A petroleum discovery affects production outlook and licensing.",
        sourceId: "sodir-news",
        sourceType: "official",
        sourceSectorTags: ["oil_gas"],
        sourceCompanyIndustryCode: "06.100",
        sourceCompanyOrgNumber: "990888213",
      },
      companies: [
        {
          companyId: "akerbp",
          name: "Aker BP ASA",
          industryCode: "06.100",
          industryTitle: "Utvinning av raolje",
          exposureGraphEdges: [{
            relationType: "controls_company",
            weight: 1,
            confidenceScore: 0.99,
            rationale: "100 % direct ownership.",
            node: {
              nodeType: "company",
              key: "controlled_company:990888213",
              label: "Equinor Energy AS",
            },
          }],
        },
        {
          companyId: "eplehuset",
          name: "Eplehuset AS",
          industryCode: "47.410",
          industryTitle: "Butikkhandel med datamaskiner",
        },
      ],
      threshold: 0.6,
    });

    expect(result.exposuresCreated).toBeGreaterThan(0);
    expect(repositoryMock.upsertCompanyEventExposure).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "akerbp",
        exposureType: "ownership",
        rationale: expect.any(String),
        metadata: expect.objectContaining({
          engineVersion: "company-event-exposure-v2",
          exposureLevel: "group",
          feedPolicy: "standard",
          sourceCompanyId: "eqnr",
          reasons: expect.any(Array),
        }),
      }),
    );
    expect(repositoryMock.upsertCompanyEventExposure).not.toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "eplehuset",
      }),
    );
  });

  it("does not fan a company-specific update out to sector peers", async () => {
    prismaMock.companyEvent.findMany.mockResolvedValue([
      {
        id: "event-1",
        companyId: "eqnr",
        eventType: "production_update",
        title: "Oil and gas discovery in the Norwegian Sea",
        summary: "A petroleum discovery affects production outlook.",
        confidenceScore: 0.82,
        metadata: null,
        company: {
          id: "eqnr",
          orgNumber: "923609016",
          industryCode: { code: "06.100", title: "Utvinning av raolje" },
        },
        evidence: [
          {
            document: {
              source: {
                id: "sodir-news",
                sourceType: "official",
                qualityScore: 0.9,
                metadata: { sectorTags: ["oil_gas", "petroleum"] },
              },
            },
          },
        ],
      },
    ]);
    prismaMock.company.findMany.mockResolvedValue([
      {
        id: "eqnr",
        name: "Equinor ASA",
        industryCode: { code: "06.100", title: "Utvinning av raolje" },
        description: null,
        revenue: null,
        employeeCount: null,
        petroleumExposureSnapshot: null,
      },
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `peer-${index}`,
        name: `Petroleum Peer ${index}`,
        industryCode: { code: "06.100", title: "Utvinning av raolje" },
        description: null,
        revenue: null,
        employeeCount: null,
        petroleumExposureSnapshot: {
          operatorFieldCount: 1,
          licenceCount: 2,
          operatedProductionOe: null,
          attributableProductionOe: null,
          remainingReservesOe: null,
        },
      })),
    ]);

    const result = await createReadAcrossExposuresForRecentEvents({ limit: 1 });

    expect(result.exposuresCreated).toBe(1);
    expect(result.exposuresRemoved).toBe(0);
    expect(repositoryMock.upsertCompanyEventExposure).toHaveBeenCalledTimes(1);
    expect(prismaMock.companyEventExposure.updateMany).toHaveBeenCalledWith({
      where: {
        exposureType: { not: "direct" },
        active: true,
        event: {
          eventType: { notIn: expect.arrayContaining(["production_update", "regulatory_change"]) },
        },
      },
      data: { active: false },
    });
    expect(prismaMock.companyEventExposure.updateMany).toHaveBeenCalledWith({
      where: {
        eventId: "event-1",
        exposureType: { not: "direct" },
        active: true,
      },
      data: { active: false },
    });
    expect(prismaMock.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1000,
      }),
    );
  });
});
