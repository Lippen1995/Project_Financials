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
});
