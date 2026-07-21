import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeAuth: vi.fn(),
  runAgent: vi.fn(),
  buildCompanySearchRows: vi.fn(),
  buildNjordVisualization: vi.fn(),
  getSubscription: vi.fn(),
  reserveUsage: vi.fn(),
  finalizeUsage: vi.fn(),
  releaseUsage: vi.fn(),
  getUsageStatus: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ safeAuth: mocks.safeAuth }));
vi.mock("@/lib/env", () => ({
  default: {
    aiSearchBillingEnabled: true,
    openAiApiKey: "test-key",
    openAiSearchModel: "test-model",
  },
}));
vi.mock("@/server/ai-search/agent/agent-loop", () => ({ runAgent: mocks.runAgent }));
vi.mock("@/server/ai-search/agent/company-rows", () => ({
  buildCompanySearchRows: mocks.buildCompanySearchRows,
}));
vi.mock("@/server/ai-search/agent/target-reasoning", () => ({
  buildTargetReasoningPrompt: () => "system prompt",
}));
vi.mock("@/server/ai-search/agent/visualization", () => ({
  buildNjordVisualization: mocks.buildNjordVisualization,
}));
vi.mock("@/server/ai-search/llm/heuristic-client", () => ({
  HeuristicLlmClient: class HeuristicLlmClient {},
}));
vi.mock("@/server/ai-search/llm/openai-client", () => ({
  OpenAiLlmClient: class OpenAiLlmClient {
    constructor(readonly options: unknown) {}
  },
}));
vi.mock("@/server/ai-search/tools", () => ({ retrievalTools: [] }));
vi.mock("@/server/billing/subscription", () => ({
  getAiSearchSubscriptionContext: mocks.getSubscription,
}));
vi.mock("@/server/services/search-history-service", () => ({
  reserveAiSearchUsage: mocks.reserveUsage,
  finalizeAiSearchUsage: mocks.finalizeUsage,
  releaseAiSearchUsage: mocks.releaseUsage,
  getAiSearchUsageStatus: mocks.getUsageStatus,
}));

import { POST } from "./route";

const billingPeriod = {
  periodStart: new Date("2026-07-01T00:00:00.000Z"),
  periodEnd: new Date("2026-08-01T00:00:00.000Z"),
  resetAt: new Date("2026-08-01T00:00:00.000Z"),
  daysUntilReset: 11,
};

function request() {
  return new NextRequest("http://localhost/api/ai-search", {
    method: "POST",
    body: JSON.stringify({ query: "Hva gjelder etter IFRS 16?" }),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/ai-search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.safeAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getSubscription.mockResolvedValue({ premium: true, billingPeriod });
    mocks.reserveUsage.mockResolvedValue("reservation-1");
    mocks.buildCompanySearchRows.mockResolvedValue([]);
    mocks.buildNjordVisualization.mockReturnValue(null);
    mocks.getUsageStatus.mockResolvedValue({
      enabled: true,
      tokenLimit: 10_000,
      usedTokens: 1_000,
      remainingTokens: 9_000,
      usagePercent: 10,
      billingPeriod,
    });
  });

  it("uses the real LLM path and records aggregate provider usage", async () => {
    mocks.runAgent.mockResolvedValue({
      answer: "Svar med kilde.",
      toolResults: [],
      groundedOrgNumbers: [],
      invocations: [],
      stopReason: "final",
      usage: {
        inputTokens: 1_000,
        cachedInputTokens: 200,
        outputTokens: 100,
        model: "provider-model",
        sourceIds: ["resp-1", "resp-2"],
      },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect((await response.json()).mode).toBe("llm-tools-offline-knowledge");
    expect(mocks.reserveUsage).toHaveBeenCalledWith("user-1", billingPeriod);
    expect(mocks.finalizeUsage).toHaveBeenCalledWith(
      "user-1",
      "reservation-1",
      expect.objectContaining({
        model: "provider-model",
        sourceId: "resp-1,resp-2",
        inputTokens: 1_000,
        cachedInputTokens: 200,
        outputTokens: 100,
        usageTokens: 1_820,
      }),
    );
    expect(mocks.releaseUsage).not.toHaveBeenCalled();
  });

  it("releases the token reservation when the model call fails", async () => {
    mocks.runAgent.mockRejectedValue(new Error("provider unavailable"));

    await expect(POST(request())).rejects.toThrow("provider unavailable");

    expect(mocks.releaseUsage).toHaveBeenCalledWith("user-1", "reservation-1");
    expect(mocks.finalizeUsage).not.toHaveBeenCalled();
  });
});
