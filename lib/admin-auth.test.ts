import { describe, expect, it } from "vitest";

import { canAccessAdmin } from "@/lib/admin-access";

describe("canAccessAdmin", () => {
  it("returns true for ADMIN", () => {
    expect(canAccessAdmin({ appRole: "ADMIN" })).toBe(true);
  });

  it("returns true for FINANCIAL_REVIEWER", () => {
    expect(canAccessAdmin({ user: { appRole: "FINANCIAL_REVIEWER" } })).toBe(true);
  });

  it("returns false for USER", () => {
    expect(canAccessAdmin({ appRole: "USER" })).toBe(false);
  });

  it("returns false when appRole is missing", () => {
    expect(canAccessAdmin({})).toBe(false);
  });
});
