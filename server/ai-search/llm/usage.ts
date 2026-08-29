import { calculateAiUsageTokens, type AiTokenUsage } from "@/lib/ai-search-usage";
import type { LlmRunResult } from "@/server/ai-search/llm/types";

export function toObservedAiUsage(
  usage: LlmRunResult["usage"],
  fallbackModel: string,
): AiTokenUsage | null {
  if (!usage?.sourceId || !usage.sourceSystem || !usage.sourceEntityType) {
    return null;
  }

  const inputTokens = Math.max(0, usage.inputTokens);
  const cachedInputTokens = Math.max(0, usage.cachedInputTokens ?? 0);
  const outputTokens = Math.max(0, usage.outputTokens);
  const fetchedAt = new Date();

  return {
    model: usage.model ?? fallbackModel,
    sourceSystem: usage.sourceSystem,
    sourceEntityType: usage.sourceEntityType,
    sourceId: usage.sourceId,
    fetchedAt,
    normalizedAt: new Date(),
    inputTokens,
    cachedInputTokens,
    outputTokens,
    usageTokens: calculateAiUsageTokens({
      inputTokens,
      cachedInputTokens,
      outputTokens,
    }),
  };
}
