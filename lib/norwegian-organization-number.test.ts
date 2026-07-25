import { describe, expect, it } from "vitest";

import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";

describe("norwegianOrganizationNumberSchema", () => {
  it("rejects a nine-digit value with an invalid MOD11 control digit", () => {
    expect(norwegianOrganizationNumberSchema.safeParse("928846467").success).toBe(false);
  });

  it("normalizes whitespace in a valid organization number", () => {
    expect(norwegianOrganizationNumberSchema.parse("928 846 466")).toBe("928846466");
  });
});
