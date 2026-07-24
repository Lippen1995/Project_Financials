import { describe, expect, it } from "vitest";

import { consumeRateLimit, getClientAddress } from "@/lib/rate-limit";

describe("consumeRateLimit", () => {
  it("blocks requests above the limit and resets after the window", () => {
    const identity = `test-${crypto.randomUUID()}`;
    const policy = { limit: 2, windowMs: 1_000 };

    expect(consumeRateLimit("unit", identity, policy, 10_000).allowed).toBe(true);
    expect(consumeRateLimit("unit", identity, policy, 10_100).allowed).toBe(true);

    const blocked = consumeRateLimit("unit", identity, policy, 10_200);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBe(1);

    expect(consumeRateLimit("unit", identity, policy, 11_001).allowed).toBe(true);
  });
});
describe("getClientAddress", () => {
  it("uses the first forwarded address", () => {
    expect(
      getClientAddress(new Headers({ "x-forwarded-for": "203.0.113.8, 10.0.0.1" })),
    ).toBe("203.0.113.8");
  });
});
