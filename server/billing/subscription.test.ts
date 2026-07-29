import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, userFindUnique, planFindUnique } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  userFindUnique: vi.fn(),
  planFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: { findUnique },
    user: { findUnique: userFindUnique },
    aiSubscriptionPlanEconomics: { findUnique: planFindUnique },
  },
}));

import { getAiSearchSubscriptionContext } from "@/server/billing/subscription";

const economics = {
  id: "global",
  runtimeEnabled: true,
  billingCurrency: "USD",
  exchangeRateNok: 10,
  fxRiskBufferBps: 1_500,
  inputPricePerMillion: 1,
  cachedInputPricePerMillion: 0.1,
  outputPricePerMillion: 8,
  globalMonthlyBudgetNok: 2_500,
  requestCostLimitNok: 25,
  dailyRequestLimit: 50,
  internalMonthlyTokenAllowance: 500_000,
  version: 1,
  updatedAt: "2026-07-29T09:00:00.000Z",
};

describe("AI search subscription context", () => {
  beforeEach(() => {
    findUnique.mockReset();
    userFindUnique.mockReset();
    planFindUnique.mockReset();
  });

  it("anchors the monthly quota to when Premium started", async () => {
    findUnique.mockResolvedValue({
      plan: "premium",
      status: "ACTIVE",
      billingAnchorAt: new Date("2026-07-14T10:00:00.000Z"),
      updatedAt: new Date("2026-07-20T10:00:00.000Z"),
    });
    userFindUnique.mockResolvedValue({ appRole: "USER" });
    planFindUnique.mockResolvedValue({
      active: true,
      includedAiUsageTokens: 1_000_000,
      includedAiCostNok: 100,
    });

    await expect(
      getAiSearchSubscriptionContext(
        "user-1",
        new Date("2026-08-13T12:00:00.000Z"),
        economics,
      ),
    ).resolves.toMatchObject({
      premium: true,
      canUseDueDiligence: true,
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
    userFindUnique.mockResolvedValue({ appRole: "USER" });
    planFindUnique.mockResolvedValue({
      active: true,
      includedAiUsageTokens: 1_000_000,
      includedAiCostNok: 100,
    });

    await expect(
      getAiSearchSubscriptionContext("user-1", new Date(), economics),
    ).resolves.toMatchObject({
      premium: true,
      canUseDueDiligence: true,
      billingPeriod: null,
    });
  });

  it("gives admins a separate calendar-month testing allowance", async () => {
    findUnique.mockResolvedValue(null);
    userFindUnique.mockResolvedValue({ appRole: "ADMIN" });

    const result = await getAiSearchSubscriptionContext(
      "admin-1",
      new Date("2026-07-29T10:00:00.000Z"),
      economics,
    );

    expect(result).toMatchObject({
      premium: true,
      tokenLimit: 500_000,
      appRole: "ADMIN",
      usageCategory: "INTERNAL_ADMIN",
      billingPeriod: {
        periodStart: new Date("2026-07-01T00:00:00.000Z"),
        periodEnd: new Date("2026-08-01T00:00:00.000Z"),
      },
    });
  });
});
