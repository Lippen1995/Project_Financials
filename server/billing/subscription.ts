import { SubscriptionStatus } from "@prisma/client";
import Stripe from "stripe";

import env from "@/lib/env";
import { getAiSearchBillingPeriod, hasPremiumAiSearchAccess } from "@/lib/ai-search-usage";
import { prisma } from "@/lib/prisma";

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

export async function getAiSearchSubscriptionContext(userId: string, now = new Date()) {
  const subscription = await getUserSubscription(userId);
  const premium = hasPremiumAiSearchAccess(subscription?.status, subscription?.plan);
  const collaboration = getCollaborationEntitlements(subscription?.status, subscription?.plan);
  const billingAnchorAt = subscription?.billingAnchorAt ?? null;

  return {
    premium,
    canUseDueDiligence: collaboration.canUseDdRooms,
    billingPeriod: premium && billingAnchorAt
      ? getAiSearchBillingPeriod(billingAnchorAt, now)
      : null,
  };
}

export function getStripeClient() {
  if (!env.stripeSecretKey) {
    return null;
  }

  return new Stripe(env.stripeSecretKey);
}
