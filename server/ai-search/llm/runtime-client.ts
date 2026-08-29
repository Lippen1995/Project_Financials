import env from "@/lib/env";
import { OpenAiLlmClient } from "@/server/ai-search/llm/openai-client";
import type { MeteredLlmClient } from "@/server/ai-search/llm/types";
import type { NjordPricing } from "@/server/ai-search/runtime-policy";

export type NjordLlmRuntimeConfig = {
  provider: string;
  credential: string;
  model: string;
};

export type NjordLlmRuntimeBudget = {
  pricing?: NjordPricing;
  requestCostLimitNok?: number;
};

export function getNjordLlmRuntimeConfig(): NjordLlmRuntimeConfig {
  switch (env.njordProvider) {
    case "openai":
      return {
        provider: "openai",
        credential: env.openAiApiKey,
        model: env.openAiSearchModel,
      };
    default:
      return {
        provider: env.njordProvider,
        credential: "",
        model: "",
      };
  }
}

/**
 * The only runtime seam that maps provider configuration to a concrete adapter.
 * Product logic depends on MeteredLlmClient and provider-neutral provenance only.
 */
export function createNjordLlmClient(
  config: NjordLlmRuntimeConfig,
  budget: NjordLlmRuntimeBudget,
): MeteredLlmClient {
  if (!config.credential) {
    throw new Error("Njord provider credential is missing.");
  }

  switch (config.provider) {
    case "openai":
      return new OpenAiLlmClient({
        apiKey: config.credential,
        model: config.model,
        pricing: budget.pricing,
        requestCostLimitNok: budget.requestCostLimitNok,
      });
    default:
      throw new Error(`Unsupported Njord provider: ${config.provider}.`);
  }
}
