import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAiLlmClient } from "./openai-client";

describe("OpenAiLlmClient", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends strict tool definitions and normalizes tool calls", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "chatcmpl-1",
          model: "gpt-5-mini",
          usage: {
            prompt_tokens: 20,
            completion_tokens: 8,
            prompt_tokens_details: { cached_tokens: 5 },
          },
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: "call-1",
                function: { name: "search_norwegian_law", arguments: "{\"query\":\"utbytte\"}" },
              }],
            },
          }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = new OpenAiLlmClient({ apiKey: "test-key", model: "gpt-5-mini" });
    const result = await client.run({
      messages: [{ role: "user", content: "Hva sier aksjeloven om utbytte?" }],
      tools: [{
        name: "search_norwegian_law",
        description: "Search local law.",
        strict: true,
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
          additionalProperties: false,
        },
      }],
    });

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.tools[0].function.strict).toBe(true);
    expect(result.toolCalls).toEqual([
      { id: "call-1", name: "search_norwegian_law", arguments: "{\"query\":\"utbytte\"}" },
    ]);
    expect(result.usage).toMatchObject({
      inputTokens: 15,
      cachedInputTokens: 5,
      outputTokens: 8,
      model: "gpt-5-mini",
      sourceId: "chatcmpl-1",
    });
  });

  it("reduces provider output tokens to keep a request inside the configured cost budget", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "chatcmpl-budget",
          model: "gpt-5-mini",
          usage: { prompt_tokens: 20, completion_tokens: 8 },
          choices: [{ message: { content: "Svar." } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = new OpenAiLlmClient({
      apiKey: "test-key",
      model: "gpt-5-mini",
      pricing: {
        inputNokPerMillion: 10,
        cachedInputNokPerMillion: 1,
        outputNokPerMillion: 80,
      },
      requestCostLimitNok: 0.1,
    });

    await client.run({
      messages: [{ role: "user", content: "Kort svar." }],
      tools: [],
    });

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.max_completion_tokens).toBeGreaterThan(0);
    expect(request.max_completion_tokens).toBeLessThan(1_800);
  });

  it("retains charged usage when a provider response cannot be used", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "chatcmpl-invalid",
          model: "gpt-5-mini",
          usage: {
            prompt_tokens: 30,
            completion_tokens: 6,
            prompt_tokens_details: { cached_tokens: 10 },
          },
          choices: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = new OpenAiLlmClient({ apiKey: "test-key", model: "gpt-5-mini" });

    await expect(client.run({
      messages: [{ role: "user", content: "Svar." }],
      tools: [],
    })).rejects.toThrow("contained no message");

    expect(client.getUsageSnapshot()).toEqual({
      inputTokens: 20,
      cachedInputTokens: 10,
      outputTokens: 6,
      model: "gpt-5-mini",
      sourceIds: ["chatcmpl-invalid"],
    });
  });
});
