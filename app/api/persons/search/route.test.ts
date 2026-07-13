import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPersonRoles: vi.fn(),
  getPersonShareholdings: vi.fn(),
  searchPersons: vi.fn(),
}));

vi.mock("@/server/registry/role-search-service", () => mocks);

import { GET } from "@/app/api/persons/search/route";

describe("GET /api/persons/search", () => {
  it("returns roles without waiting for the slower shareholding lookup", async () => {
    mocks.getPersonRoles.mockResolvedValueOnce([{ companyOrgNumber: "000000000" }]);
    mocks.getPersonShareholdings.mockRejectedValueOnce(new Error("slow lookup unavailable"));

    const response = await GET(
      new Request(
        "http://localhost/api/persons/search?identityKey=PERSON%7C1964-01-01&section=roles",
      ) as never,
    );

    await expect(response.json()).resolves.toEqual({
      data: { roles: [{ companyOrgNumber: "000000000" }] },
    });
    expect(mocks.getPersonShareholdings).not.toHaveBeenCalled();
  });
});
