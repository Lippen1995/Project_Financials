import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  safeAuth: vi.fn(),
};

const profileSearch = {
  searchCompaniesForProfile: vi.fn(),
};

vi.mock("@/lib/auth", () => ({
  safeAuth: auth.safeAuth,
}));

vi.mock("@/server/services/user-profile-service", () => ({
  searchCompaniesForProfile: profileSearch.searchCompaniesForProfile,
}));

describe("GET /api/profile/company-search", () => {
  beforeEach(() => {
    auth.safeAuth.mockReset();
    profileSearch.searchCompaniesForProfile.mockReset();
    auth.safeAuth.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("rejects an overlong query before searching", async () => {
    const { GET } = await import("@/app/api/profile/company-search/route");
    const request = new Request(
      `http://localhost/api/profile/company-search?q=${"a".repeat(201)}`,
    );

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(profileSearch.searchCompaniesForProfile).not.toHaveBeenCalled();
  });

  it("trims a valid query before searching", async () => {
    profileSearch.searchCompaniesForProfile.mockResolvedValue([]);
    const { GET } = await import("@/app/api/profile/company-search/route");
    const request = new Request(
      "http://localhost/api/profile/company-search?q=%20%20Fjord%20%20",
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(profileSearch.searchCompaniesForProfile).toHaveBeenCalledWith("Fjord");
  });
});
