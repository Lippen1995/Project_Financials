import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchNewswebLatestMessages,
  findBestNewswebIssuerMatch,
  type NewswebIssuer,
} from "@/integrations/news/newsweb-provider";

const issuers: NewswebIssuer[] = [
  {
    issuerId: 1309,
    issuerSign: "EQNR",
    name: "Equinor ASA",
    isActive: 1,
  },
  {
    issuerId: 9999,
    issuerSign: "EQNR_OLD",
    name: "Equinor ASA",
    isActive: 0,
  },
  {
    issuerId: 7777,
    issuerSign: "EPLH",
    name: "Eplehuset AS",
    isActive: 1,
  },
];

describe("newsweb-provider issuer matching", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("matches active NewsWeb issuer by exact normalized company name", () => {
    const issuer = findBestNewswebIssuerMatch("EQUINOR ASA", issuers);
    expect(issuer?.issuerId).toBe(1309);
  });

  it("does not fuzzy-match unrelated company names", () => {
    const issuer = findBestNewswebIssuerMatch("Equinor Energy AS", issuers);
    expect(issuer).toBeNull();
  });

  it("keeps unrelated issuer news separate", () => {
    const issuer = findBestNewswebIssuerMatch("Eplehuset AS", issuers);
    expect(issuer?.issuerSign).toBe("EPLH");
  });

  it("fetches and maps the latest market-wide NewsWeb messages", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ api_large: "https://api.example.test" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          data: {
            messages: [
              {
                messageId: 675569,
                title: "LINK Mobility acquires Italian company",
                category: [{ category_en: "INSIDE INFORMATION" }],
                issuerId: 12811,
                issuerSign: "LINK",
                issuerName: "Link Mobility Group Holding ASA",
                publishedTime: "2026-06-08T06:00:00.000Z",
              },
            ],
          },
        }), { status: 200 }),
      );

    const result = await fetchNewswebLatestMessages({ limit: 20 });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/v1/newsreader/list?"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        guid: "newsweb:675569",
        issuerId: 12811,
        issuerSign: "LINK",
        issuerName: "Link Mobility Group Holding ASA",
        category: "INSIDE INFORMATION",
      }),
    ]);
  });
});
