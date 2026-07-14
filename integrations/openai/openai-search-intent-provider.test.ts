import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  default: { openAiApiKey: "test-key", openAiSearchModel: "gpt-5-mini" },
}));

import { OpenAiSearchIntentProvider } from "@/integrations/openai/openai-search-intent-provider";

describe("OpenAiSearchIntentProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the provider's real token usage as weighted quota tokens", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "chatcmpl-test-1",
        model: "gpt-5-mini-2025-08-07",
        choices: [{ message: { content: JSON.stringify({ rewrittenQuery: "havvind" }) } }],
        usage: {
          prompt_tokens: 1_400,
          completion_tokens: 100,
          prompt_tokens_details: { cached_tokens: 400 },
        },
      }),
    }));

    const result = await new OpenAiSearchIntentProvider().interpretQuery("havvind");

    expect(result.aiUsage).toEqual(expect.objectContaining({
      model: "gpt-5-mini-2025-08-07",
      sourceSystem: "OPENAI",
      sourceEntityType: "chat.completion",
      sourceId: "chatcmpl-test-1",
      inputTokens: 1_000,
      cachedInputTokens: 400,
      outputTokens: 100,
      usageTokens: 1_840,
    }));
  });
});
