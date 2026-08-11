import { describe, expect, it } from "vitest";

import { buildGlobalNavItems, isGlobalNavItemActive } from "@/lib/navigation";

describe("buildGlobalNavItems", () => {
  it("shows Admin nav for ADMIN users", () => {
    expect(
      buildGlobalNavItems({ appRole: "ADMIN" }).some((item) => item.href === "/admin"),
    ).toBe(true);
  });

  it("shows Admin nav for FINANCIAL_REVIEWER users", () => {
    expect(
      buildGlobalNavItems({ appRole: "FINANCIAL_REVIEWER" }).some(
        (item) => item.href === "/admin",
      ),
    ).toBe(true);
  });

  it("hides Admin nav for USER users", () => {
    expect(
      buildGlobalNavItems({ appRole: "USER" }).some((item) => item.href === "/admin"),
    ).toBe(false);
  });

  it("hides Admin nav for unauthenticated users", () => {
    expect(buildGlobalNavItems(null).some((item) => item.href === "/admin")).toBe(false);
  });

  it("exposes resumable analyses and keeps detail routes active", () => {
    const analyses = buildGlobalNavItems(null).find((item) => item.href === "/analyses");

    expect(analyses).toMatchObject({ label: "Analyser", icon: "analytics" });
    expect(isGlobalNavItemActive(analyses!, "/analyses/analysis-1")).toBe(true);
  });

  it("exposes the account-free company map and marks it active", () => {
    const companyMap = buildGlobalNavItems(null).find(
      (item) => item.href === "/company-map",
    );

    expect(companyMap).toMatchObject({ label: "Selskapskart", icon: "map" });
    expect(isGlobalNavItemActive(companyMap!, "/company-map")).toBe(true);
  });
});
