import { describe, expect, it } from "vitest";

import {
  PREMIUM_AI_SEARCH_TOKEN_LIMIT,
  AI_SEARCH_RESERVATION_TOKENS,
  canStartAiSearch,
  calculateAiUsageTokens,
  createAiSearchUsageStatus,
  getSearchHistoryCutoff,
  hasPremiumAiSearchAccess,
} from "@/lib/ai-search-usage";

describe("AI search usage", () => {
  it("converts model usage into weighted quota tokens", () => {
    expect(
      calculateAiUsageTokens({
        inputTokens: 1_000,
        cachedInputTokens: 400,
        outputTokens: 100,
      }),
    ).toBe(1_840);
  });

  it("requires enough remaining quota for one bounded AI request", () => {
    expect(canStartAiSearch(createAiSearchUsageStatus(true, PREMIUM_AI_SEARCH_TOKEN_LIMIT - AI_SEARCH_RESERVATION_TOKENS))).toBe(true);
    expect(canStartAiSearch(createAiSearchUsageStatus(true, PREMIUM_AI_SEARCH_TOKEN_LIMIT - AI_SEARCH_RESERVATION_TOKENS + 1))).toBe(false);
  });

  it("caps Premium usage and exposes only token values", () => {
    expect(createAiSearchUsageStatus(true, PREMIUM_AI_SEARCH_TOKEN_LIMIT + 10)).toEqual({
      enabled: true,
      tokenLimit: PREMIUM_AI_SEARCH_TOKEN_LIMIT,
      usedTokens: PREMIUM_AI_SEARCH_TOKEN_LIMIT + 10,
      remainingTokens: 0,
      usagePercent: 100,
      windowDays: 30,
    });
  });

  it("requires both the Premium package and an active billing status", () => {
    expect(hasPremiumAiSearchAccess("ACTIVE", "premium")).toBe(true);
    expect(hasPremiumAiSearchAccess("ACTIVE", "free")).toBe(false);
    expect(hasPremiumAiSearchAccess("PAST_DUE", "premium")).toBe(false);
  });

  it("gives non-Premium users no AI search quota", () => {
    expect(createAiSearchUsageStatus(false, 500)).toEqual({
      enabled: false,
      tokenLimit: 0,
      usedTokens: 0,
      remainingTokens: 0,
      usagePercent: 0,
      windowDays: 30,
    });
  });
});

describe("search history retention", () => {
  it("expires records exactly 30 days before the supplied time", () => {
    expect(getSearchHistoryCutoff(new Date("2026-07-14T12:00:00.000Z"))).toEqual(
      new Date("2026-06-14T12:00:00.000Z"),
    );
  });
});
