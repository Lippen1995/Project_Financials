import { SubscriptionStatus } from "@prisma/client";
import Stripe from "stripe";

import env from "@/lib/env";
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

export function getStripeClient() {
  if (!env.stripeSecretKey) {
    return null;
  }

  return new Stripe(env.stripeSecretKey);
}
