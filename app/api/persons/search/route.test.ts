import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { searchPersonsMock, getPersonRolesMock, getPersonShareholdingsMock } = vi.hoisted(() => ({
  searchPersonsMock: vi.fn(),
  getPersonRolesMock: vi.fn(),
  getPersonShareholdingsMock: vi.fn(),
}));

vi.mock("@/server/registry/role-search-service", () => ({
  searchPersons: searchPersonsMock,
  getPersonRoles: getPersonRolesMock,
  getPersonShareholdings: getPersonShareholdingsMock,
}));

import { GET } from "@/app/api/persons/search/route";

describe("GET /api/persons/search", () => {
  beforeEach(() => {
    searchPersonsMock.mockReset();
    searchPersonsMock.mockResolvedValue([]);
    getPersonRolesMock.mockReset();
    getPersonShareholdingsMock.mockReset();
  });

  it("returns roles without waiting for the slower shareholding lookup", async () => {
    getPersonRolesMock.mockResolvedValueOnce([{ companyOrgNumber: "000000000" }]);
    getPersonShareholdingsMock.mockRejectedValueOnce(new Error("slow lookup unavailable"));

    const response = await GET(
      new NextRequest(
        "http://localhost/api/persons/search?identityKey=PERSON%7C1964-01-01&section=roles",
      ),
    );

    await expect(response.json()).resolves.toEqual({
      data: { roles: [{ companyOrgNumber: "000000000" }] },
    });
    expect(getPersonShareholdingsMock).not.toHaveBeenCalled();
  });

  it("keeps role searches constrained to role mode", async () => {
    await GET(
      new NextRequest("http://localhost/api/persons/search?query=ROLE_QUERY&scope=roles"),
    );

    expect(searchPersonsMock).toHaveBeenCalledWith(
      "ROLE_QUERY",
      expect.objectContaining({ mode: "roles" }),
    );
  });

  it("rejects oversized queries before searching", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/persons/search?query=${"x".repeat(201)}`),
    );

    expect(response.status).toBe(400);
    expect(searchPersonsMock).not.toHaveBeenCalled();
  });
});
