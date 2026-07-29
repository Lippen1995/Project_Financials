import { describe, expect, it } from "vitest";

import {
  aggregatePlanAiEconomics,
  calculatePlanAiEconomics,
  calculateUsageCost,
  canReserveWithinAllowance,
  calculateMaxAffordableOutputTokens,
  parseAiEconomicsSettingsInput,
  parseAiPlanEconomicsInput,
} from "./domain";

describe("AI economics domain", () => {
  it("converts provider cost to NOK and applies the configured FX buffer", () => {
    const result = calculateUsageCost(
      {
        inputTokens: 1_000_000,
        cachedInputTokens: 500_000,
        outputTokens: 100_000,
      },
      {
        inputPricePerMillion: 1,
        cachedInputPricePerMillion: 0.1,
        outputPricePerMillion: 8,
        exchangeRateNok: 10,
        fxRiskBufferBps: 1_500,
      },
    );

    expect(result.providerCost).toBe(1.85);
    expect(result.estimatedCostNok).toBe(18.5);
    expect(result.budgetedCostNok).toBe(21.275);
  });

  it("allocates plan revenue using cost plus markup, capped at modeled revenue", () => {
    expect(calculatePlanAiEconomics({
      activeSubscribers: 10,
      monthlyPriceNok: 500,
      actualAiCostNok: 1_000,
      allocationMode: "COST_PLUS",
      costPlusMarkupBps: 2_500,
      fixedAiAllocationNokPerSubscriber: 0,
      revenueShareBps: 0,
    })).toEqual({
      modeledSubscriptionRevenueNok: 5_000,
      allocatedAiRevenueNok: 1_250,
      aiContributionNok: 250,
      realizedMarkupPercent: 25,
    });

    expect(calculatePlanAiEconomics({
      activeSubscribers: 1,
      monthlyPriceNok: 100,
      actualAiCostNok: 90,
      allocationMode: "COST_PLUS",
      costPlusMarkupBps: 2_500,
      fixedAiAllocationNokPerSubscriber: 0,
      revenueShareBps: 0,
    }).allocatedAiRevenueNok).toBe(100);
  });

  it("supports fixed-per-subscriber and revenue-share allocation", () => {
    expect(calculatePlanAiEconomics({
      activeSubscribers: 4,
      monthlyPriceNok: 300,
      actualAiCostNok: 200,
      allocationMode: "FIXED_PER_SUBSCRIBER",
      costPlusMarkupBps: 0,
      fixedAiAllocationNokPerSubscriber: 75,
      revenueShareBps: 0,
    }).allocatedAiRevenueNok).toBe(300);

    expect(calculatePlanAiEconomics({
      activeSubscribers: 4,
      monthlyPriceNok: 300,
      actualAiCostNok: 200,
      allocationMode: "REVENUE_SHARE",
      costPlusMarkupBps: 0,
      fixedAiAllocationNokPerSubscriber: 0,
      revenueShareBps: 2_000,
    }).allocatedAiRevenueNok).toBe(240);
  });

  it("aggregates total AI-related revenue and contribution across plans", () => {
    expect(aggregatePlanAiEconomics([
      {
        modeledSubscriptionRevenueNok: 5_000,
        allocatedAiRevenueNok: 1_250,
        aiContributionNok: 250,
        realizedMarkupPercent: 25,
      },
      null,
      {
        modeledSubscriptionRevenueNok: 1_200,
        allocatedAiRevenueNok: 240,
        aiContributionNok: 40,
        realizedMarkupPercent: 20,
      },
    ])).toEqual({
      modeledSubscriptionRevenueNok: 6_200,
      allocatedAiRevenueNok: 1_490,
      aiContributionNok: 290,
      realizedMarkupPercent: 24.17,
    });

    expect(aggregatePlanAiEconomics([])).toEqual({
      modeledSubscriptionRevenueNok: 0,
      allocatedAiRevenueNok: 0,
      aiContributionNok: 0,
      realizedMarkupPercent: null,
    });
  });

  it("reserves conservatively against a per-user plan cost allowance", () => {
    expect(canReserveWithinAllowance(75, 25, 100)).toBe(true);
    expect(canReserveWithinAllowance(75.01, 25, 100)).toBe(false);
    expect(canReserveWithinAllowance(500, 25, null)).toBe(true);
  });

  it("derives a conservative output ceiling for single-turn AI search", () => {
    expect(calculateMaxAffordableOutputTokens({
      requestCostLimitNok: 1,
      inputPricePerMillion: 1,
      outputPricePerMillion: 8,
      exchangeRateNok: 10,
      fxRiskBufferBps: 1_500,
      reservedInputTokens: 2_000,
      providerMaximumOutputTokens: 500,
    })).toBe(500);

    expect(calculateMaxAffordableOutputTokens({
      requestCostLimitNok: 0.02,
      inputPricePerMillion: 1,
      outputPricePerMillion: 8,
      exchangeRateNok: 10,
      fxRiskBufferBps: 1_500,
      reservedInputTokens: 2_000,
      providerMaximumOutputTokens: 500,
    })).toBe(0);
  });

  it("rejects incomplete or internally inconsistent admin configuration", () => {
    expect(() => parseAiEconomicsSettingsInput({
      runtimeEnabled: true,
      billingCurrency: "USD",
      exchangeRateNok: 0,
      fxRiskBufferBps: 1_500,
      inputPricePerMillion: 1,
      cachedInputPricePerMillion: 0.1,
      outputPricePerMillion: 8,
      globalMonthlyBudgetNok: 2_500,
      requestCostLimitNok: 10,
      dailyRequestLimit: 50,
      internalMonthlyTokenAllowance: 100_000,
    })).toThrow();

    expect(() => parseAiPlanEconomicsInput({
      planKey: "premium",
      displayName: "Premium",
      active: true,
      monthlyPriceNok: 499,
      includedAiUsageTokens: 1_000_000,
      includedAiCostNok: 100,
      allocationMode: "REVENUE_SHARE",
      costPlusMarkupBps: 0,
      fixedAiAllocationNokPerSubscriber: 0,
      revenueShareBps: 10_001,
    })).toThrow();
  });
});
