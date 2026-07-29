export const SEARCH_HISTORY_RETENTION_DAYS = 30;

// Premium's initial product quota, calibrated to the approved budget and exposed only as tokens.
export const PREMIUM_AI_SEARCH_TOKEN_LIMIT = 41_000_000;
export const AI_SEARCH_RESERVATION_TOKENS = 10_000;

export type AiSearchBillingPeriod = {
  periodStart: Date;
  periodEnd: Date;
  resetAt: Date;
  daysUntilReset: number;
};

function addAnchoredUtcMonths(anchor: Date, months: number) {
  const targetMonthStart = new Date(Date.UTC(
    anchor.getUTCFullYear(),
    anchor.getUTCMonth() + months,
    1,
    anchor.getUTCHours(),
    anchor.getUTCMinutes(),
    anchor.getUTCSeconds(),
    anchor.getUTCMilliseconds(),
  ));
  const lastDay = new Date(Date.UTC(
    targetMonthStart.getUTCFullYear(),
    targetMonthStart.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  targetMonthStart.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
  return targetMonthStart;
}

export function getAiSearchBillingPeriod(
  subscriptionStartedAt: Date,
  now = new Date(),
): AiSearchBillingPeriod {
  const anchor = new Date(subscriptionStartedAt);
  if (now < anchor) {
    const periodEnd = addAnchoredUtcMonths(anchor, 1);
    return {
      periodStart: anchor,
      periodEnd,
      resetAt: periodEnd,
      daysUntilReset: Math.max(1, Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000)),
    };
  }

  let monthOffset =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    now.getUTCMonth() - anchor.getUTCMonth();
  let periodStart = addAnchoredUtcMonths(anchor, monthOffset);
  if (periodStart > now) {
    monthOffset -= 1;
    periodStart = addAnchoredUtcMonths(anchor, monthOffset);
  }
  const periodEnd = addAnchoredUtcMonths(anchor, monthOffset + 1);

  return {
    periodStart,
    periodEnd,
    resetAt: periodEnd,
    daysUntilReset: Math.max(1, Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000)),
  };
}

export function getAiSearchResetPresentation(
  period: Pick<AiSearchBillingPeriod, "resetAt" | "daysUntilReset">,
  now = new Date(),
) {
  return period.resetAt.getTime() - now.getTime() < 10 * 86_400_000
    ? { kind: "days" as const, days: period.daysUntilReset }
    : { kind: "date" as const, resetAt: period.resetAt };
}

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
  estimatedCostNok?: number;
  providerCurrency?: string;
  providerCostAmount?: number;
  exchangeRateNok?: number;
  fxRiskBufferBps?: number;
  budgetedCostNok?: number;
  durationMs?: number;
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
  billingPeriod: AiSearchBillingPeriod | null;
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
  billingPeriod: AiSearchBillingPeriod | null = null,
  tokenLimit = PREMIUM_AI_SEARCH_TOKEN_LIMIT,
): AiSearchUsageStatus {
  if (!premium) {
    return {
      enabled: false,
      tokenLimit: 0,
      usedTokens: 0,
      remainingTokens: 0,
      usagePercent: 0,
      billingPeriod: null,
    };
  }

  const usedTokens = wholeNonNegative(recordedUsageTokens);
  const normalizedTokenLimit = wholeNonNegative(tokenLimit);
  return {
    enabled: true,
    tokenLimit: normalizedTokenLimit,
    usedTokens,
    remainingTokens: Math.max(0, normalizedTokenLimit - usedTokens),
    usagePercent: Math.min(
      100,
      normalizedTokenLimit > 0
        ? Math.round((usedTokens / normalizedTokenLimit) * 100)
        : 100,
    ),
    billingPeriod,
  };
}

export function getCalendarMonthBillingPeriod(now = new Date()): AiSearchBillingPeriod {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    periodStart,
    periodEnd,
    resetAt: periodEnd,
    daysUntilReset: Math.max(
      1,
      Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000),
    ),
  };
}

export function getSearchHistoryCutoff(now = new Date()) {
  return new Date(now.getTime() - SEARCH_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1_000);
}
