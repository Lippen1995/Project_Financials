import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  upsertPlan: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/server/services/admin-ai-economics-service", () => ({
  upsertAiPlanEconomics: mocks.upsertPlan,
}));

import { POST } from "./route";

function request(payload: unknown) {
  return new NextRequest("http://localhost/api/admin/ai-economics/plans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/admin/ai-economics/plans", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      user: { id: "admin-1", appRole: "ADMIN" },
      error: null,
    });
    mocks.upsertPlan.mockResolvedValue({ planKey: "premium", version: 1 });
  });

  it("persists NOK price, usage allocation and cost-plus markup", async () => {
    const payload = {
      planKey: "premium",
      displayName: "Premium",
      active: true,
      monthlyPriceNok: 499,
      includedAiUsageTokens: 1_000_000,
      includedAiCostNok: 100,
      allocationMode: "COST_PLUS",
      costPlusMarkupBps: 2_500,
      fixedAiAllocationNokPerSubscriber: 0,
      revenueShareBps: 0,
    };

    const response = await POST(request(payload));

    expect(response.status).toBe(200);
    expect(mocks.upsertPlan).toHaveBeenCalledWith("admin-1", payload);
  });
});
