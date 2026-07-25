import { describe, expect, it } from "vitest";

import { parseRouteIds, tryParseRouteIds } from "@/lib/api-input";

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
