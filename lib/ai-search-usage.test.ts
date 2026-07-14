import { describe, expect, it } from "vitest";

import {
  PREMIUM_AI_SEARCH_TOKEN_LIMIT,
  AI_SEARCH_RESERVATION_TOKENS,
  canStartAiSearch,
  calculateAiUsageTokens,
  createAiSearchUsageStatus,
  getSearchHistoryCutoff,
  getAiSearchBillingPeriod,
  getAiSearchResetPresentation,
  hasPremiumAiSearchAccess,
} from "@/lib/ai-search-usage";

describe("AI search usage", () => {
  it("resets monthly from the subscription start date", () => {
    expect(
      getAiSearchBillingPeriod(
        new Date("2026-07-14T10:00:00.000Z"),
        new Date("2026-08-13T12:00:00.000Z"),
      ),
    ).toEqual({
      periodStart: new Date("2026-07-14T10:00:00.000Z"),
      periodEnd: new Date("2026-08-14T10:00:00.000Z"),
      resetAt: new Date("2026-08-14T10:00:00.000Z"),
      daysUntilReset: 1,
    });
  });

  it("preserves a month-end anchor without drifting shorter months", () => {
    expect(
      getAiSearchBillingPeriod(
        new Date("2026-01-31T10:00:00.000Z"),
        new Date("2026-02-28T10:00:00.000Z"),
      ),
    ).toMatchObject({
      periodStart: new Date("2026-02-28T10:00:00.000Z"),
      periodEnd: new Date("2026-03-31T10:00:00.000Z"),
    });
  });

  it("switches from reset date to remaining days below ten days", () => {
    const resetAt = new Date("2026-08-14T10:00:00.000Z");
    expect(getAiSearchResetPresentation(
      { resetAt, daysUntilReset: 10 },
      new Date("2026-08-04T10:00:00.000Z"),
    )).toEqual({
      kind: "date",
      resetAt,
    });
    expect(getAiSearchResetPresentation(
      { resetAt, daysUntilReset: 10 },
      new Date("2026-08-04T11:00:00.000Z"),
    )).toEqual({
      kind: "days",
      days: 10,
    });
  });
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
      billingPeriod: null,
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
      billingPeriod: null,
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
