import { describe, expect, it, vi } from "vitest";

const { resolveDashboardSearchHrefMock } = vi.hoisted(() => ({
  resolveDashboardSearchHrefMock: vi.fn(),
}));

vi.mock("@/server/services/dashboard-search-routing-service", () => ({
  resolveDashboardSearchHref: resolveDashboardSearchHrefMock,
}));

import { GET } from "@/app/(app)/search/resolve/route";

describe("GET /search/resolve", () => {
  it("forwards a deliberate event id to resolved company searches", async () => {
    resolveDashboardSearchHrefMock.mockResolvedValue("/search?query=havvind&scope=companies");

    const response = await GET(
      new Request(
        "http://localhost/search/resolve?query=havvind&searchEventId=6baef7f8-dba2-44ba-8b56-08d23d170e88",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/search?query=havvind&scope=companies&searchEventId=6baef7f8-dba2-44ba-8b56-08d23d170e88",
    );
  });
});
