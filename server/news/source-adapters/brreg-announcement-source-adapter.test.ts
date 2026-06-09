import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    company: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { BrregAnnouncementSourceAdapter } from "@/server/news/source-adapters/brreg-announcement-source-adapter";
import type { NewsSourceDefinition } from "@/server/news/news-source-registry";

const source: NewsSourceDefinition = {
  id: "brreg-announcements",
  name: "Brreg kunngjoringer",
  type: "brreg",
  tier: "primary",
  country: "NO",
  language: "no",
  enabled: true,
  defaultCredibilityScore: 0.95,
};

function provider() {
  return {
    getAnnouncements: vi.fn(async (orgNumber: string) => ({
      announcements: [
        {
          id: `kid-${orgNumber}`,
          title: "Kunngjoring om kapitalendring",
          detailUrl: `https://example.test/${orgNumber}`,
          publishedAt: new Date("2026-06-01T00:00:00Z"),
          rawPayload: { kind: "capital" },
        },
      ],
    })),
  };
}

describe("brreg announcement source adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses explicit company scopes without loading default watches", async () => {
    const providerMock = provider();
    const result = await new BrregAnnouncementSourceAdapter(providerMock as any).fetch(source, {
      companyScopes: [{ companyId: "company-1", orgNumber: "923609016", name: "Equinor ASA" }],
    });

    expect(prismaMock.company.findMany).not.toHaveBeenCalled();
    expect(providerMock.getAnnouncements).toHaveBeenCalledWith("923609016");
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toMatchObject({
      sourceId: "brreg-announcements",
      externalId: "kid-923609016",
      title: "Kunngjoring om kapitalendring",
      rawPayload: expect.objectContaining({
        companyId: "company-1",
        orgNumber: "923609016",
      }),
    });
  });

  it("falls back to active watched companies when no explicit scopes are provided", async () => {
    prismaMock.company.findMany.mockResolvedValue([
      {
        id: "company-1",
        orgNumber: "923609016",
        name: "Equinor ASA",
      },
      {
        id: "company-2",
        orgNumber: "919160675",
        name: "Aker BP ASA",
      },
    ]);
    const providerMock = provider();

    const result = await new BrregAnnouncementSourceAdapter(providerMock as any).fetch(source, { limit: 2 });

    expect(prismaMock.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
        where: expect.objectContaining({
          workspaceWatches: {
            some: {
              status: "ACTIVE",
              watchAnnouncements: true,
            },
          },
        }),
      }),
    );
    expect(providerMock.getAnnouncements).toHaveBeenCalledTimes(2);
    expect(providerMock.getAnnouncements).toHaveBeenNthCalledWith(1, "923609016");
    expect(providerMock.getAnnouncements).toHaveBeenNthCalledWith(2, "919160675");
    expect(result.documents.map((document) => document.externalId)).toEqual(["kid-923609016", "kid-919160675"]);
  });
});
