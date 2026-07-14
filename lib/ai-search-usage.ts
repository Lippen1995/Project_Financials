export const SEARCH_HISTORY_RETENTION_DAYS = 30;

// Premium's initial product quota, calibrated to the approved budget and exposed only as tokens.
export const PREMIUM_AI_SEARCH_TOKEN_LIMIT = 41_000_000;
export const AI_SEARCH_RESERVATION_TOKENS = 10_000;

export type AiTokenUsage = {
  model: string;
  sourceSystem: "OPENAI";
  sourceEntityType: "chat.completion";
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  usageTokens: number;
};

export function hasPremiumAiSearchAccess(status?: string | null, plan?: string | null) {
  return status === "ACTIVE" && plan === "premium";
}

export function canStartAiSearch(status: AiSearchUsageStatus) {
  return status.enabled && status.remainingTokens >= AI_SEARCH_RESERVATION_TOKENS;
}

export type AiSearchUsageStatus = {
  enabled: boolean;
  tokenLimit: number;
  usedTokens: number;
  remainingTokens: number;
  usagePercent: number;
  windowDays: number;
};

function wholeNonNegative(value: number) {
  return Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0));
}

/**
 * GPT-5 mini quota units expressed as input-token equivalents:
 * uncached input = 1, cached input = 0.1, output = 8.
 */
export function calculateAiUsageTokens(input: {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}) {
  const inputTokens = wholeNonNegative(input.inputTokens);
  const cachedInputTokens = wholeNonNegative(input.cachedInputTokens);
  const outputTokens = wholeNonNegative(input.outputTokens);
  return Math.ceil(inputTokens + cachedInputTokens * 0.1 + outputTokens * 8);
}

export function createAiSearchUsageStatus(
  premium: boolean,
  recordedUsageTokens: number,
): AiSearchUsageStatus {
  if (!premium) {
    return {
      enabled: false,
      tokenLimit: 0,
      usedTokens: 0,
      remainingTokens: 0,
      usagePercent: 0,
      windowDays: SEARCH_HISTORY_RETENTION_DAYS,
    };
  }

  const usedTokens = wholeNonNegative(recordedUsageTokens);
  return {
    enabled: true,
    tokenLimit: PREMIUM_AI_SEARCH_TOKEN_LIMIT,
    usedTokens,
    remainingTokens: Math.max(0, PREMIUM_AI_SEARCH_TOKEN_LIMIT - usedTokens),
    usagePercent: Math.min(
      100,
      Math.round((usedTokens / PREMIUM_AI_SEARCH_TOKEN_LIMIT) * 100),
    ),
    windowDays: SEARCH_HISTORY_RETENTION_DAYS,
  };
}

export function getSearchHistoryCutoff(now = new Date()) {
  return new Date(now.getTime() - SEARCH_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1_000);
}
