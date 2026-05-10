import { describe, expect, it } from "vitest";

import { buildGlobalNavItems } from "@/lib/navigation";

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
});
