import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchRegistryCompanies: vi.fn(),
  searchPersons: vi.fn(),
  searchRoleTypes: vi.fn(),
}));

vi.mock("@/server/registry/entity-search-service", () => ({
  searchRegistryCompanies: mocks.searchRegistryCompanies,
}));
vi.mock("@/server/registry/role-search-service", () => ({
  searchPersons: mocks.searchPersons,
  searchRoleTypes: mocks.searchRoleTypes,
}));

import { GET } from "@/app/api/search/suggestions/route";

describe("GET /api/search/suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchRegistryCompanies.mockResolvedValue([]);
    mocks.searchPersons.mockResolvedValue([]);
    mocks.searchRoleTypes.mockResolvedValue([]);
  });

  it("returns normalized company, person and role suggestions", async () => {
    mocks.searchRegistryCompanies.mockResolvedValueOnce([
      { orgNumber: "000000000", name: "COMPANY_RESULT", municipality: "MUNICIPALITY_RESULT" },
    ]);
    mocks.searchPersons.mockResolvedValueOnce([
      {
        identityKey: "PERSON_RESULT|1900-01-01",
        fullName: "PERSON_RESULT",
        roleCount: 3,
        companyCount: 2,
      },
    ]);
    mocks.searchRoleTypes.mockResolvedValueOnce([
      { roleType: "ROLE_RESULT", roleTypeLabel: "ROLE_LABEL_RESULT", assignmentCount: 12 },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/search/suggestions?query=leder"),
    );

    await expect(response.json()).resolves.toEqual({
      data: [
        {
          type: "company",
          id: "000000000",
          title: "COMPANY_RESULT",
          description: "Org.nr. 000000000 · MUNICIPALITY_RESULT",
          href: "/companies/000000000",
        },
        {
          type: "person",
          id: "PERSON_RESULT|1900-01-01",
          title: "PERSON_RESULT",
          description: "Person · 2 selskaper · 3 roller",
          href: "/people?query=PERSON_RESULT&scope=persons",
        },
        {
          type: "role",
          id: "ROLE_RESULT",
          title: "ROLE_LABEL_RESULT",
          description: "Rolle · 12 registreringer",
          href: "/people?query=ROLE_LABEL_RESULT&scope=roles#role-filter",
        },
      ],
      meta: { unavailableSources: [] },
    });
  });

  it("distinguishes unavailable sources from an empty result", async () => {
    mocks.searchRegistryCompanies.mockRejectedValueOnce(new Error("registry unavailable"));
    mocks.searchPersons.mockRejectedValueOnce(new Error("roles mirror unavailable"));
    mocks.searchRoleTypes.mockRejectedValueOnce(new Error("roles mirror unavailable"));

    const response = await GET(
      new NextRequest("http://localhost/api/search/suggestions?query=search"),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Søket er midlertidig utilgjengelig.",
    });
  });

  it("does not query registries for incomplete or oversized input", async () => {
    const shortResponse = await GET(
      new NextRequest("http://localhost/api/search/suggestions?query=a"),
    );
    const longResponse = await GET(
      new NextRequest(`http://localhost/api/search/suggestions?query=${"x".repeat(201)}`),
    );

    expect(shortResponse.status).toBe(200);
    await expect(shortResponse.json()).resolves.toEqual({
      data: [],
      meta: { unavailableSources: [] },
    });
    expect(longResponse.status).toBe(400);
    expect(mocks.searchRegistryCompanies).not.toHaveBeenCalled();
    expect(mocks.searchPersons).not.toHaveBeenCalled();
    expect(mocks.searchRoleTypes).not.toHaveBeenCalled();
  });
});
