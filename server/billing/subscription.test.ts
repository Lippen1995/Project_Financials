import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { subscription: { findUnique } },
}));

import { getAiSearchSubscriptionContext } from "@/server/billing/subscription";

describe("AI search subscription context", () => {
  beforeEach(() => findUnique.mockReset());

  it("anchors the monthly quota to when Premium started", async () => {
    findUnique.mockResolvedValue({
      plan: "premium",
      status: "ACTIVE",
      billingAnchorAt: new Date("2026-07-14T10:00:00.000Z"),
      updatedAt: new Date("2026-07-20T10:00:00.000Z"),
    });

    await expect(
      getAiSearchSubscriptionContext(
        "user-1",
        new Date("2026-08-13T12:00:00.000Z"),
      ),
    ).resolves.toMatchObject({
      premium: true,
      billingPeriod: {
        periodStart: new Date("2026-07-14T10:00:00.000Z"),
        resetAt: new Date("2026-08-14T10:00:00.000Z"),
      },
    });
  });

  it("does not invent a reset date when the billing anchor is unavailable", async () => {
    findUnique.mockResolvedValue({
      plan: "premium",
      status: "ACTIVE",
      billingAnchorAt: null,
      updatedAt: new Date("2026-07-14T10:00:00.000Z"),
    });

    await expect(getAiSearchSubscriptionContext("user-1")).resolves.toEqual({
      premium: true,
      billingPeriod: null,
    });
  });
});
