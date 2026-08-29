import { describe, expect, it } from "vitest";

import {
  createNjordLlmClient,
  type NjordLlmRuntimeConfig,
} from "@/server/ai-search/llm/runtime-client";

const openAiConfig: NjordLlmRuntimeConfig = {
  provider: "openai",
  credential: "test-key",
  model: "gpt-5-mini",
};

describe("createNjordLlmClient", () => {
  it("keeps concrete provider wiring and provenance behind one runtime seam", () => {
    const client = createNjordLlmClient(openAiConfig, {});

    expect(client.model).toBe("gpt-5-mini");
    expect(client.provenance).toEqual({
      sourceSystem: "OPENAI",
      sourceEntityType: "chat.completion",
    });
    expect(client.getUsageSnapshot()).toEqual(expect.objectContaining({
      sourceSystem: "OPENAI",
      sourceEntityType: "chat.completion",
      sourceIds: [],
    }));
  });

  it("fails closed for a provider without a registered adapter", () => {
    expect(() => createNjordLlmClient({
      provider: "unregistered",
      credential: "secret",
      model: "model",
    }, {})).toThrow("Unsupported Njord provider");
  });
});
