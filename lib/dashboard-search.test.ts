import { describe, expect, it } from "vitest";

import { buildDashboardSearchHref, isDashboardSearchScope } from "@/lib/dashboard-search";

describe("dashboard search URLs", () => {
  it("keeps company AI searches inside the company result page", () => {
    expect(buildDashboardSearchHref("COMPANY_QUERY", "companies", true)).toBe(
      "/search?query=COMPANY_QUERY&scope=companies&ai=1",
    );
  });

  it("routes people and roles to the people page", () => {
    expect(buildDashboardSearchHref("PERSON_QUERY", "persons", false)).toBe(
      "/people?query=PERSON_QUERY&scope=persons",
    );
    expect(buildDashboardSearchHref("ROLE_QUERY", "roles", true)).toBe(
      "/people?query=ROLE_QUERY&scope=roles&ai=1#role-filter",
    );
  });

  it("keeps role queries intact for provider-backed role matching", () => {
    expect(buildDashboardSearchHref("styreleder", "roles", false)).toBe(
      "/people?query=styreleder&scope=roles#role-filter",
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
