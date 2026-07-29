import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/server/services/admin-ai-economics-service", () => ({
  updateAiEconomicsSettings: mocks.updateSettings,
}));

import { POST } from "./route";

const validPayload = {
  runtimeEnabled: true,
  billingCurrency: "USD",
  exchangeRateNok: 10.5,
  fxRiskBufferBps: 1_500,
  inputPricePerMillion: 1,
  cachedInputPricePerMillion: 0.1,
  outputPricePerMillion: 8,
  globalMonthlyBudgetNok: 2_500,
  requestCostLimitNok: 25,
  dailyRequestLimit: 50,
  internalMonthlyTokenAllowance: 1_000_000,
};

function request(payload: unknown) {
  return new NextRequest("http://localhost/api/admin/ai-economics/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/admin/ai-economics/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      user: { id: "admin-1", appRole: "ADMIN" },
      error: null,
    });
    mocks.updateSettings.mockResolvedValue({ version: 1 });
  });

  it("validates and persists an audited admin configuration", async () => {
    const response = await POST(request(validPayload));

    expect(response.status).toBe(200);
    expect(mocks.updateSettings).toHaveBeenCalledWith("admin-1", validPayload);
  });

  it("rejects unsafe limits before writing", async () => {
    const response = await POST(request({
      ...validPayload,
      requestCostLimitNok: 3_000,
    }));

    expect(response.status).toBe(400);
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it("requires a global admin", async () => {
    mocks.requireAdmin.mockResolvedValue({
      user: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await POST(request(validPayload));

    expect(response.status).toBe(403);
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });
});
