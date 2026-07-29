import { z } from "zod";

export const AI_REVENUE_ALLOCATION_MODES = [
  "COST_PLUS",
  "FIXED_PER_SUBSCRIBER",
  "REVENUE_SHARE",
] as const;

export const AI_ECONOMICS_RUNTIME_LOCK_KEY = "ai-economics-runtime";

export type AiRevenueAllocationMode = (typeof AI_REVENUE_ALLOCATION_MODES)[number];

const finiteMoney = z.number().finite().min(0).max(1_000_000_000);
const positiveMoney = z.number().finite().positive().max(1_000_000_000);
const basisPoints = z.number().int().min(0).max(10_000);

export const aiEconomicsSettingsInputSchema = z
  .object({
    runtimeEnabled: z.boolean(),
    billingCurrency: z.string().trim().regex(/^[A-Z]{3}$/),
    exchangeRateNok: z.number().finite().positive().max(1_000_000),
    fxRiskBufferBps: basisPoints,
    inputPricePerMillion: finiteMoney,
    cachedInputPricePerMillion: finiteMoney,
    outputPricePerMillion: finiteMoney,
    globalMonthlyBudgetNok: positiveMoney,
    requestCostLimitNok: positiveMoney,
    dailyRequestLimit: z.number().int().min(1).max(100_000),
    internalMonthlyTokenAllowance: z.number().int().min(0).max(2_000_000_000),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.runtimeEnabled && input.inputPricePerMillion <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inputPricePerMillion"],
        message: "Inputprisen må være større enn null når AI er aktivert.",
      });
    }
    if (input.runtimeEnabled && input.outputPricePerMillion <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["outputPricePerMillion"],
        message: "Outputprisen må være større enn null når AI er aktivert.",
      });
    }
    if (input.requestCostLimitNok > input.globalMonthlyBudgetNok) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requestCostLimitNok"],
        message: "Kostnadsgrensen per kall kan ikke være høyere enn månedsbudsjettet.",
      });
    }
  });

export type AiEconomicsSettingsInput = z.infer<typeof aiEconomicsSettingsInputSchema>;

export const aiPlanEconomicsInputSchema = z
  .object({
    planKey: z.string().trim().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/),
    displayName: z.string().trim().min(1).max(100),
    active: z.boolean(),
    monthlyPriceNok: finiteMoney,
    includedAiUsageTokens: z.number().int().min(0).max(2_000_000_000),
    includedAiCostNok: finiteMoney,
    allocationMode: z.enum(AI_REVENUE_ALLOCATION_MODES),
    costPlusMarkupBps: basisPoints,
    fixedAiAllocationNokPerSubscriber: finiteMoney,
    revenueShareBps: basisPoints,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.includedAiCostNok > input.monthlyPriceNok && input.monthlyPriceNok > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["includedAiCostNok"],
        message: "AI-kostnadsrammen kan ikke være høyere enn abonnementsprisen.",
      });
    }
    if (
      input.allocationMode === "FIXED_PER_SUBSCRIBER" &&
      input.fixedAiAllocationNokPerSubscriber > input.monthlyPriceNok
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fixedAiAllocationNokPerSubscriber"],
        message: "Fast AI-allokering kan ikke være høyere enn abonnementsprisen.",
      });
    }
  });

export type AiPlanEconomicsInput = z.infer<typeof aiPlanEconomicsInputSchema>;

export function parseAiEconomicsSettingsInput(input: unknown) {
  return aiEconomicsSettingsInputSchema.parse(input);
}

export function parseAiPlanEconomicsInput(input: unknown) {
  return aiPlanEconomicsInputSchema.parse(input);
}

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function nonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function calculateUsageCost(
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
  },
  pricing: {
    inputPricePerMillion: number;
    cachedInputPricePerMillion: number;
    outputPricePerMillion: number;
    exchangeRateNok: number;
    fxRiskBufferBps: number;
  },
) {
  const providerCost = round(
    (
      nonNegative(usage.inputTokens) * nonNegative(pricing.inputPricePerMillion) +
      nonNegative(usage.cachedInputTokens) * nonNegative(pricing.cachedInputPricePerMillion) +
      nonNegative(usage.outputTokens) * nonNegative(pricing.outputPricePerMillion)
    ) / 1_000_000,
    6,
  );
  const estimatedCostNok = round(providerCost * nonNegative(pricing.exchangeRateNok));
  const budgetedCostNok = round(
    estimatedCostNok * (1 + nonNegative(pricing.fxRiskBufferBps) / 10_000),
  );

  return { providerCost, estimatedCostNok, budgetedCostNok };
}

export function calculatePlanAiEconomics(input: {
  activeSubscribers: number;
  monthlyPriceNok: number;
  actualAiCostNok: number;
  allocationMode: AiRevenueAllocationMode;
  costPlusMarkupBps: number;
  fixedAiAllocationNokPerSubscriber: number;
  revenueShareBps: number;
}) {
  const subscribers = Math.max(0, Math.trunc(input.activeSubscribers));
  const revenue = round(subscribers * nonNegative(input.monthlyPriceNok), 2);
  const cost = round(nonNegative(input.actualAiCostNok), 4);
  let requestedAllocation = 0;

  if (input.allocationMode === "COST_PLUS") {
    requestedAllocation = cost * (1 + nonNegative(input.costPlusMarkupBps) / 10_000);
  } else if (input.allocationMode === "FIXED_PER_SUBSCRIBER") {
    requestedAllocation =
      subscribers * nonNegative(input.fixedAiAllocationNokPerSubscriber);
  } else {
    requestedAllocation = revenue * (nonNegative(input.revenueShareBps) / 10_000);
  }

  const allocatedAiRevenueNok = round(Math.min(revenue, requestedAllocation), 2);
  const aiContributionNok = round(allocatedAiRevenueNok - cost, 2);
  const realizedMarkupPercent =
    cost > 0 ? round((aiContributionNok / cost) * 100, 1) : null;

  return {
    modeledSubscriptionRevenueNok: revenue,
    allocatedAiRevenueNok,
    aiContributionNok,
    realizedMarkupPercent,
  };
}

export function canReserveWithinAllowance(
  committedCostNok: number,
  reservationCostNok: number,
  allowanceNok: number | null,
) {
  if (allowanceNok == null) return true;
  return (
    nonNegative(committedCostNok) + nonNegative(reservationCostNok) <=
    nonNegative(allowanceNok)
  );
}

export function calculateMaxAffordableOutputTokens(input: {
  requestCostLimitNok: number;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  exchangeRateNok: number;
  fxRiskBufferBps: number;
  reservedInputTokens: number;
  providerMaximumOutputTokens: number;
}) {
  const riskMultiplier = 1 + nonNegative(input.fxRiskBufferBps) / 10_000;
  const baseBudgetNok = nonNegative(input.requestCostLimitNok) / riskMultiplier;
  const reservedInputCostNok =
    nonNegative(input.reservedInputTokens) *
    nonNegative(input.inputPricePerMillion) *
    nonNegative(input.exchangeRateNok) /
    1_000_000;
  const outputCostNokPerToken =
    nonNegative(input.outputPricePerMillion) *
    nonNegative(input.exchangeRateNok) /
    1_000_000;
  if (outputCostNokPerToken <= 0) return 0;
  return Math.max(
    0,
    Math.min(
      Math.trunc(nonNegative(input.providerMaximumOutputTokens)),
      Math.floor((baseBudgetNok - reservedInputCostNok) / outputCostNokPerToken),
    ),
  );
}
