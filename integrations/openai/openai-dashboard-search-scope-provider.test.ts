import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMock = {
  openAiApiKey: "",
  openAiSearchModel: "gpt-5-mini",
  aiSearchBillingEnabled: false,
};

vi.mock("@/lib/env", () => ({ default: envMock }));

const { OpenAiDashboardSearchScopeProvider } = await import(
  "@/integrations/openai/openai-dashboard-search-scope-provider"
);

const fetchMock = vi.fn();

function okResponse(scope: string) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ scope }) } }] }),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(okResponse("persons"));
  vi.stubGlobal("fetch", fetchMock);
  // Fully permissive baseline, so each test isolates one guard.
  envMock.openAiApiKey = "test-key";
  envMock.aiSearchBillingEnabled = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAiDashboardSearchScopeProvider", () => {
  it("classifies when a budget is supplied and paid AI is enabled", async () => {
    const provider = new OpenAiDashboardSearchScopeProvider();

    const scope = await provider.classify("hvem er ola nordmann", { maxOutputTokens: 32 });

    expect(scope).toBe("persons");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("makes no call without an explicit budget", async () => {
    const provider = new OpenAiDashboardSearchScopeProvider();

    expect(await provider.classify("hvem er ola nordmann", null)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("makes no call when the budget cannot afford a single token", async () => {
    const provider = new OpenAiDashboardSearchScopeProvider();

    expect(await provider.classify("q", { maxOutputTokens: 0 })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("makes no call when paid AI is switched off, even with a budget and a key", async () => {
    envMock.aiSearchBillingEnabled = false;
    const provider = new OpenAiDashboardSearchScopeProvider();

    expect(await provider.classify("q", { maxOutputTokens: 32 })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("makes no call without an API key", async () => {
    envMock.openAiApiKey = "";
    const provider = new OpenAiDashboardSearchScopeProvider();

    expect(await provider.classify("q", { maxOutputTokens: 32 })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("always caps output tokens, never sending an uncapped request", async () => {
    const provider = new OpenAiDashboardSearchScopeProvider();

    await provider.classify("q", { maxOutputTokens: 100_000 });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.max_completion_tokens).toBeGreaterThan(0);
    expect(body.max_completion_tokens).toBeLessThanOrEqual(64);
  });

  it("rejects a scope the model invents", async () => {
    fetchMock.mockResolvedValue(okResponse("wildcard"));
    const provider = new OpenAiDashboardSearchScopeProvider();

    expect(await provider.classify("q", { maxOutputTokens: 32 })).toBeNull();
  });
});
