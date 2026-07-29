import { AppRole, SubscriptionStatus } from "@prisma/client";
import Stripe from "stripe";

import env from "@/lib/env";
import {
  getAiSearchBillingPeriod,
  getCalendarMonthBillingPeriod,
} from "@/lib/ai-search-usage";
import { prisma } from "@/lib/prisma";
import type { getAiRuntimeEconomicsConfig } from "@/server/services/admin-ai-economics-service";

export function isPremium(status?: string | null, plan?: string | null) {
  return status === SubscriptionStatus.ACTIVE || plan === "premium";
}

export function getCollaborationEntitlements(status?: string | null, plan?: string | null) {
  const premium = isPremium(status, plan);

  return {
    canUseTeamWorkspaces: premium,
    canUseDdRooms: premium,
    canUseWorkspaceWatches: premium,
    canUseWorkspaceMonitors: premium,
    canUseWorkspaceInbox: premium,
  };
}

export async function getUserSubscription(userId: string) {
  return prisma.subscription.findUnique({
    where: { userId },
  });
}

type RuntimeEconomicsConfig = NonNullable<
  Awaited<ReturnType<typeof getAiRuntimeEconomicsConfig>>
>;

export async function getAiSearchSubscriptionContext(
  userId: string,
  now = new Date(),
  economics?: RuntimeEconomicsConfig | null,
) {
  const subscription = await getUserSubscription(userId);
  const collaboration = getCollaborationEntitlements(subscription?.status, subscription?.plan);
  const billingAnchorAt = subscription?.billingAnchorAt ?? null;
  if (!economics) {
    return {
      premium: false,
      canUseDueDiligence: collaboration.canUseDdRooms,
      billingPeriod: null,
      tokenLimit: 0,
      userMonthlyCostLimitNok: null,
      appRole: AppRole.USER,
      subscriptionPlan: subscription?.plan ?? null,
      subscriptionStatus: subscription?.status ?? null,
      subscriptionUpdatedAt: subscription?.updatedAt ?? null,
      planEconomicsVersion: null,
      usageCategory: "CUSTOMER" as const,
    };
  }

  const [user, planConfig] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { appRole: true },
    }),
    subscription?.plan
      ? prisma.aiSubscriptionPlanEconomics.findUnique({
          where: { planKey: subscription.plan },
        })
      : null,
  ]);
  const appRole = user?.appRole ?? AppRole.USER;
  const internal = appRole === AppRole.ADMIN || appRole === AppRole.FINANCIAL_REVIEWER;
  const customerEnabled =
    subscription?.status === SubscriptionStatus.ACTIVE &&
    Boolean(planConfig?.active) &&
    (planConfig?.includedAiUsageTokens ?? 0) > 0 &&
    Number(planConfig?.includedAiCostNok ?? 0) > 0;
  const internalEnabled =
    internal && economics.runtimeEnabled && economics.internalMonthlyTokenAllowance > 0;
  const premium = internalEnabled || customerEnabled;

  return {
    premium,
    canUseDueDiligence: collaboration.canUseDdRooms,
    billingPeriod: internalEnabled
      ? getCalendarMonthBillingPeriod(now)
      : premium && billingAnchorAt
        ? getAiSearchBillingPeriod(billingAnchorAt, now)
        : null,
    tokenLimit: internalEnabled
      ? economics.internalMonthlyTokenAllowance
      : planConfig?.includedAiUsageTokens ?? 0,
    userMonthlyCostLimitNok: internalEnabled
      ? null
      : Number(planConfig?.includedAiCostNok ?? 0),
    appRole,
    subscriptionPlan: subscription?.plan ?? null,
    subscriptionStatus: subscription?.status ?? null,
    subscriptionUpdatedAt: subscription?.updatedAt ?? null,
    planEconomicsVersion: internalEnabled ? null : planConfig?.version ?? null,
    usageCategory: internalEnabled
      ? appRole === AppRole.ADMIN
        ? "INTERNAL_ADMIN" as const
        : "INTERNAL_REVIEWER" as const
      : "CUSTOMER" as const,
  };
}

export function getStripeClient() {
  if (!env.stripeSecretKey) {
    return null;
  }

  return new Stripe(env.stripeSecretKey);
}
