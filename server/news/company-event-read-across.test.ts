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
  },
}));

vi.mock("@/server/news/company-event-repository", () => repositoryMock);
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import {
  createDirectCompanyEventExposure,
  persistReadAcrossExposures,
} from "@/server/news/company-event-read-across";

describe("company event read-across", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMock.upsertCompanyEventExposure.mockResolvedValue({ id: "exposure-1" });
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
          engineVersion: "company-event-exposure-v1",
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
      },
      companies: [
        {
          companyId: "akerbp",
          name: "Aker BP ASA",
          industryCode: "06.100",
          industryTitle: "Utvinning av raolje",
          hasPetroleumExposure: true,
          petroleumExposure: {
            operatorFieldCount: 3,
            licenceCount: 10,
          },
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
        exposureType: expect.stringMatching(/petroleum|sector|commodity|regulatory/),
        rationale: expect.any(String),
        metadata: expect.objectContaining({
          engineVersion: "company-event-exposure-v1",
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
});
