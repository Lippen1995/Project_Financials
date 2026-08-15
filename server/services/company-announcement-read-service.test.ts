import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  company: { findUnique: vi.fn() },
  companyAnnouncementFetchState: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  sourceDocument: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  getStoredCompanyAnnouncementDetail,
  getStoredCompanyAnnouncements,
} from "@/server/services/company-announcement-read-service";

describe("company announcement read service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.company.findUnique.mockResolvedValue({ id: "company-1" });
    prismaMock.companyAnnouncementFetchState.findUnique.mockResolvedValue(null);
    prismaMock.companyAnnouncementFetchState.create.mockResolvedValue({});
    prismaMock.sourceDocument.findMany.mockResolvedValue([]);
  });

  it("queues an uncovered company and returns an honest pending state without network access", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("network access is forbidden on request paths"),
    );

    const result = await getStoredCompanyAnnouncements("912345678");

    expect(result).toEqual({
      announcements: [],
      availability: expect.objectContaining({
        available: false,
        status: "PENDING",
        sourceSystem: "BRREG",
      }),
      allAnnouncementsUrl: null,
    });
    expect(prismaMock.companyAnnouncementFetchState.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: "company-1",
        status: "PENDING",
        sourceId: "912345678",
      }),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("serves normalized announcements from the local document store", async () => {
    prismaMock.companyAnnouncementFetchState.findUnique.mockResolvedValue({
      status: "AVAILABLE",
      unavailableReason: null,
      allAnnouncementsUrl: "https://w2.brreg.no/kunngjoring/hent_alle.jsp?orgnr=912345678",
      sourceEntityType: "announcementList",
      sourceId: "912345678",
      fetchedAt: new Date("2026-08-15T08:00:00.000Z"),
      normalizedAt: new Date("2026-08-15T08:00:01.000Z"),
      nextCheckAt: new Date("2026-08-15T09:00:00.000Z"),
    });
    prismaMock.sourceDocument.findMany.mockResolvedValue([
      {
        externalId: "announcement-1",
        title: "Endring av foretaksnavn",
        canonicalUrl: "https://w2.brreg.no/kunngjoring/hent_en.jsp?kid=announcement-1",
        publishedAt: new Date("2026-08-14T00:00:00.000Z"),
        fetchedAt: new Date("2026-08-15T08:00:00.000Z"),
        normalizedAt: new Date("2026-08-15T08:00:01.000Z"),
        sourcePayload: { orgNumber: "912345678" },
      },
    ]);

    const result = await getStoredCompanyAnnouncements("912345678");

    expect(result.availability).toEqual(expect.objectContaining({
      available: true,
      status: "AVAILABLE",
    }));
    expect(result.announcements).toEqual([
      expect.objectContaining({
        id: "announcement-1",
        orgNumber: "912345678",
        title: "Endring av foretaksnavn",
        year: 2026,
        sourceSystem: "BRREG",
      }),
    ]);
  });

  it("serves announcement detail from the local document store", async () => {
    prismaMock.sourceDocument.findFirst.mockResolvedValue({
      externalId: "announcement-1",
      title: "Endring av foretaksnavn",
      canonicalUrl: "https://w2.brreg.no/kunngjoring/hent_en.jsp?kid=announcement-1",
      publishedAt: new Date("2026-08-14T00:00:00.000Z"),
      fetchedAt: new Date("2026-08-15T08:00:00.000Z"),
      normalizedAt: new Date("2026-08-15T08:00:01.000Z"),
      sourcePayload: {
        orgNumber: "912345678",
        sourceLabel: "Foretaksregisteret 14.08.2026",
        contentHtml: "<p>Offisiell kunngjøring.</p>",
      },
    });

    const result = await getStoredCompanyAnnouncementDetail(
      "912345678",
      "announcement-1",
    );

    expect(result).toEqual(expect.objectContaining({
      id: "announcement-1",
      orgNumber: "912345678",
      sourceLabel: "Foretaksregisteret 14.08.2026",
      contentHtml: "<p>Offisiell kunngjøring.</p>",
      sourceSystem: "BRREG",
    }));
  });
});
