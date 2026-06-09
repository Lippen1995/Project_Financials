import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    company: {
      findMany: vi.fn(),
    },
    newsIssuerIdentity: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { NewswebSourceAdapter } from "@/server/news/source-adapters/newsweb-source-adapter";
import type { NewsSourceDefinition } from "@/server/news/news-source-registry";

const source: NewsSourceDefinition = {
  id: "oslobors",
  name: "Oslo Bors",
  type: "newsweb",
  tier: "regulatory",
  country: "NO",
  language: "no",
  url: "https://newsweb.oslobors.no/rss",
  enabled: true,
  defaultCredibilityScore: 0.9,
  fetchConfig: {
    newswebMessageLimit: 7,
    includeNewswebBody: true,
  },
};

function article(messageId: number, category: string | null = "Issuer disclosure") {
  return {
    guid: `newsweb:${messageId}`,
    title: "Mandatory notification of trade by primary insider",
    summary: "Primary insider purchased shares.",
    url: `https://newsweb.oslobors.no/message/${messageId}`,
    publishedAt: new Date("2026-06-01T08:00:00Z"),
    source: "newsweb" as const,
    category,
    issuerId: 123,
    issuerSign: "EQNR",
    issuerName: "Equinor ASA",
  };
}

describe("newsweb source adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.newsIssuerIdentity.findMany.mockResolvedValue([]);
    prismaMock.newsIssuerIdentity.updateMany.mockResolvedValue({ count: 1 });
  });

  it("uses explicit company scopes without loading default watches", async () => {
    const fetcher = vi.fn(async () => [article(1001)]);

    const result = await new NewswebSourceAdapter(fetcher).fetch(source, {
      companyScopes: [{ companyId: "company-1", orgNumber: "923609016", name: "Equinor ASA" }],
    });

    expect(prismaMock.company.findMany).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledWith("Equinor ASA", {
      limit: 7,
      includeBody: true,
    });
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toMatchObject({
      sourceId: "oslobors",
      externalId: "newsweb:1001",
      title: "Mandatory notification of trade by primary insider",
      rawPayload: expect.objectContaining({
        category: "Issuer disclosure",
        categories: ["Issuer disclosure"],
        companyId: "company-1",
        orgNumber: "923609016",
        companyName: "Equinor ASA",
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
    const fetcher = vi.fn(async (companyName: string) => [article(companyName === "Equinor ASA" ? 1001 : 1002)]);

    const latestFetcher = vi.fn(async () => [article(1003)]);
    const result = await new NewswebSourceAdapter(
      fetcher,
      { sourceType: "rss", fetch: vi.fn() },
      vi.fn(),
      latestFetcher,
    ).fetch(source, { limit: 2 });

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
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(1, "Equinor ASA", {
      limit: 7,
      includeBody: true,
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, "Aker BP ASA", {
      limit: 7,
      includeBody: true,
    });
    expect(latestFetcher).toHaveBeenCalledWith({ limit: 50, includeBody: true });
    expect(result.documents.map((document) => document.externalId)).toEqual([
      "newsweb:1003",
      "newsweb:1001",
      "newsweb:1002",
    ]);
  });

  it("uses prominent active companies when there are no watched companies", async () => {
    prismaMock.company.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "company-1",
          orgNumber: "923609016",
          name: "Equinor ASA",
        },
      ]);
    const fetcher = vi.fn(async () => [article(1001)]);

    const result = await new NewswebSourceAdapter(
      fetcher,
      { sourceType: "rss", fetch: vi.fn() },
      vi.fn(),
      vi.fn(async () => []),
    ).fetch(source, { limit: 5 });

    expect(prismaMock.company.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        take: 5,
        where: expect.objectContaining({
          status: "ACTIVE",
          OR: expect.arrayContaining([
            { employeeCount: { gte: 250 } },
            { revenue: { gte: 100_000_000 } },
          ]),
        }),
      }),
    );
    expect(fetcher).toHaveBeenCalledWith("Equinor ASA", {
      limit: 7,
      includeBody: true,
    });
    expect(result.documents.map((document) => document.externalId)).toEqual(["newsweb:1001"]);
  });

  it("fills default coverage with least-recently fetched registered issuers", async () => {
    prismaMock.company.findMany.mockResolvedValue([]);
    prismaMock.newsIssuerIdentity.findMany.mockResolvedValue([
      {
        sourceIssuerId: "1309",
        issuerSign: "EQNR",
        issuerName: "Equinor ASA",
        company: {
          id: "company-1",
          orgNumber: "923609016",
          name: "EQUINOR ASA",
        },
      },
    ]);
    const fetcher = vi.fn();
    const issuerFetcher = vi.fn(async () => [article(1001)]);

    const result = await new NewswebSourceAdapter(
      fetcher,
      { sourceType: "rss", fetch: vi.fn() },
      issuerFetcher,
      vi.fn(async () => []),
    ).fetch(source, { limit: 5 });

    expect(fetcher).not.toHaveBeenCalled();
    expect(prismaMock.newsIssuerIdentity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { lastMessagesFetchedAt: { sort: "asc", nulls: "first" } },
          { updatedAt: "asc" },
        ],
      }),
    );
    expect(issuerFetcher).toHaveBeenCalledWith(1309, {
      limit: 7,
      includeBody: true,
    });
    expect(prismaMock.newsIssuerIdentity.updateMany).toHaveBeenCalledWith({
      where: {
        sourceSystem: "NEWSWEB",
        sourceIssuerId: "1309",
      },
      data: {
        lastMessagesFetchedAt: expect.any(Date),
      },
    });
    expect(result.documents[0]?.rawPayload).toEqual(
      expect.objectContaining({
        companyId: "company-1",
        orgNumber: "923609016",
        issuerSign: "EQNR",
      }),
    );
  });

  it("uses RSS fallback when there are no default watched companies", async () => {
    prismaMock.company.findMany.mockResolvedValue([]);
    const fetcher = vi.fn();
    const rssFallback = {
      sourceType: "rss",
      fetch: vi.fn(async () => ({
        sourceId: "oslobors",
        documents: [
          {
            sourceId: "oslobors",
            externalId: "rss-item",
            url: "https://newsweb.oslobors.no/message/9999",
            title: "Global NewsWeb RSS item",
          },
        ],
        errors: [],
        fetchedAt: new Date("2026-06-01T00:00:00Z"),
      })),
    };

    const result = await new NewswebSourceAdapter(
      fetcher,
      rssFallback,
      vi.fn(),
      vi.fn(async () => {
        throw new Error("latest unavailable");
      }),
    ).fetch(source, { limit: 2 });

    expect(fetcher).not.toHaveBeenCalled();
    expect(rssFallback.fetch).toHaveBeenCalledWith(source, { limit: 2 });
    expect(result.documents.map((document) => document.externalId)).toEqual(["rss-item"]);
    expect(result.errors).toEqual(["NewsWeb latest feed failed: latest unavailable"]);
  });
});
