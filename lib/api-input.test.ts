import { describe, expect, it } from "vitest";

import {
  parseRouteIds,
  queryDateTimeSchema,
  queryYearSchema,
  tryParseCompanyReference,
  tryParseRouteIds,
} from "@/lib/api-input";

describe("parseRouteIds", () => {
  it("returns trimmed opaque identifiers for the requested route parameters", () => {
    expect(
      parseRouteIds(
        { workspaceId: " workspace-1 ", memberUserId: "user_2" },
        ["workspaceId", "memberUserId"] as const,
      ),
    ).toEqual({
      workspaceId: "workspace-1",
      memberUserId: "user_2",
    });
  });

  it("rejects identifiers containing path or control characters", () => {
    expect(() => parseRouteIds({ findingId: "../finding" }, ["findingId"] as const)).toThrow();
    expect(() =>
      parseRouteIds({ findingId: "finding\nheader" }, ["findingId"] as const),
    ).toThrow();
  });

  it("supports controlled client-error handling without throwing", () => {
    expect(tryParseRouteIds({ userId: "../user" }, ["userId"] as const)).toBeNull();
  });
});

describe("tryParseCompanyReference", () => {
  it("returns a trimmed company slug", () => {
    expect(tryParseCompanyReference(" fjord-innsikt-as ")).toBe("fjord-innsikt-as");
  });

  it("normalizes valid organization numbers and rejects invalid numeric references", () => {
    expect(tryParseCompanyReference("928 846 466")).toBe("928846466");
    expect(tryParseCompanyReference("928846467")).toBeNull();
  });
});

describe("queryYearSchema", () => {
  it("accepts an absent or four-digit year and rejects partial numeric input", () => {
    expect(queryYearSchema.safeParse(null).data).toBeUndefined();
    expect(queryYearSchema.safeParse("2024").data).toBe(2024);
    expect(queryYearSchema.safeParse("2024suffix").success).toBe(false);
  });
});

describe("queryDateTimeSchema", () => {
  it("parses an optional ISO timestamp and rejects invalid dates", () => {
    expect(queryDateTimeSchema.safeParse(null).data).toBeUndefined();
    expect(queryDateTimeSchema.safeParse("2024-07-01T10:30:00Z").data).toEqual(
      new Date("2024-07-01T10:30:00Z"),
    );
    expect(queryDateTimeSchema.safeParse("not-a-date").success).toBe(false);
  });
});
