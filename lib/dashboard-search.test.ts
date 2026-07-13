import { describe, expect, it } from "vitest";

import { buildDashboardSearchHref, isDashboardSearchScope } from "@/lib/dashboard-search";

describe("dashboard search URLs", () => {
  it("keeps company AI searches inside the company result page", () => {
    expect(buildDashboardSearchHref("Equinor", "companies", true)).toBe(
      "/search?query=Equinor&scope=companies&ai=1",
    );
  });

  it("routes people and roles to the people page", () => {
    expect(buildDashboardSearchHref("Ola Nordmann", "persons", false)).toBe(
      "/people?query=Ola+Nordmann&scope=persons",
    );
    expect(buildDashboardSearchHref("Ola Nordmann", "roles", true)).toBe(
      "/people?query=Ola+Nordmann&scope=roles&ai=1#role-filter",
    );
  });

  it("turns a known role title into a real Brreg role filter", () => {
    expect(buildDashboardSearchHref("styreleder", "roles", false)).toBe(
      "/people?query=&scope=roles&roleType=LEDE#role-filter",
    );
    expect(buildDashboardSearchHref("daglig leder Kari", "roles", false)).toBe(
      "/people?query=Kari&scope=roles&roleType=DAGL#role-filter",
    );
  });

  it("uses the official company status filter for bankruptcy searches", () => {
    expect(buildDashboardSearchHref("bygg", "bankruptcies", false)).toBe(
      "/search?query=bygg&scope=bankruptcies&status=BANKRUPT",
    );
  });

  it("rejects unknown scopes", () => {
    expect(isDashboardSearchScope("persons")).toBe(true);
    expect(isDashboardSearchScope("news")).toBe(false);
  });
});
