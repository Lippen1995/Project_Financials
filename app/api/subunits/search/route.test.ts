import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const subunitSearch = {
  searchRegistrySubunits: vi.fn(),
};

vi.mock("@/server/registry/subunit-search-service", () => ({
  searchRegistrySubunits: subunitSearch.searchRegistrySubunits,
}));

describe("GET /api/subunits/search", () => {
  beforeEach(() => {
    subunitSearch.searchRegistrySubunits.mockReset();
  });

  it("rejects an overlong query before searching", async () => {
    const { GET } = await import("@/app/api/subunits/search/route");
    const request = new NextRequest(
      `http://localhost/api/subunits/search?query=${"a".repeat(201)}`,
    );

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(subunitSearch.searchRegistrySubunits).not.toHaveBeenCalled();
  });

  it("rejects limits outside the supported integer range", async () => {
    const { GET } = await import("@/app/api/subunits/search/route");
    const request = new NextRequest(
      "http://localhost/api/subunits/search?query=butikk&limit=-1",
    );

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(subunitSearch.searchRegistrySubunits).not.toHaveBeenCalled();
  });

  it("rejects unsupported boolean values", async () => {
    const { GET } = await import("@/app/api/subunits/search/route");
    const request = new NextRequest(
      "http://localhost/api/subunits/search?query=butikk&activeOnly=yes",
    );

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(subunitSearch.searchRegistrySubunits).not.toHaveBeenCalled();
  });

  it("rejects malformed NACE prefixes", async () => {
    const { GET } = await import("@/app/api/subunits/search/route");
    const request = new NextRequest(
      "http://localhost/api/subunits/search?query=butikk&nace=47%25",
    );

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(subunitSearch.searchRegistrySubunits).not.toHaveBeenCalled();
  });

  it("normalizes and forwards supported search parameters", async () => {
    subunitSearch.searchRegistrySubunits.mockResolvedValue([]);
    const { GET } = await import("@/app/api/subunits/search/route");
    const request = new NextRequest(
      "http://localhost/api/subunits/search?query=%20butikk%20&nace=%2047.11%20&limit=25&activeOnly=true",
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(subunitSearch.searchRegistrySubunits).toHaveBeenCalledWith("butikk", {
      nacePrefix: "47.11",
      activeOnly: true,
      limit: 25,
    });
  });

  it("accepts a full five-digit NACE code as a search prefix", async () => {
    subunitSearch.searchRegistrySubunits.mockResolvedValue([]);
    const { GET } = await import("@/app/api/subunits/search/route");
    const request = new NextRequest(
      "http://localhost/api/subunits/search?query=butikk&nace=47.710",
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(subunitSearch.searchRegistrySubunits).toHaveBeenCalledWith("butikk", {
      nacePrefix: "47.710",
      activeOnly: false,
      limit: undefined,
    });
  });
});
