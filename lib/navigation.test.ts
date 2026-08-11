import { describe, expect, it } from "vitest";

import {
  buildGlobalNavItems,
  buildGlobalNavMenuCategories,
  isGlobalNavItemActive,
} from "@/lib/navigation";

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

describe("buildGlobalNavMenuCategories", () => {
  it("keeps search outside the menu and groups the product destinations", () => {
    const categories = buildGlobalNavMenuCategories(
      buildGlobalNavItems({ appRole: "ADMIN" }),
    );

    expect(categories).toEqual([
      {
        id: "explore",
        label: "Utforsk",
        items: [
          { href: "/company-map", label: "Selskapskart", icon: "map" },
          { href: "/people", label: "Personer", icon: "person_search" },
          { href: "/watchlist", label: "Overvåkning", icon: "star" },
          { href: "/market/distress", label: "Distress", icon: "warning" },
        ],
      },
      {
        id: "analysis",
        label: "Analyse",
        items: [
          { href: "/analyses", label: "Analyse", icon: "analytics" },
          { href: "/market/oil-gas", label: "Olje og gass", icon: "oil_barrel" },
        ],
      },
    ]);
  });
});
