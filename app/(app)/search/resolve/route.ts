import { NextResponse } from "next/server";

import { safeAuth } from "@/lib/auth";
import env from "@/lib/env";
import { canStartAiSearch } from "@/lib/ai-search-usage";
import {
  buildDashboardSearchHref,
  isDashboardSearchScope,
} from "@/lib/dashboard-search";
import { resolveDashboardSearchHref } from "@/server/services/dashboard-search-routing-service";
import { getAiSearchSubscriptionContext } from "@/server/billing/subscription";
import { getAiSearchUsageStatus } from "@/server/services/search-history-service";
import { getAiRuntimeEconomicsConfig } from "@/server/services/admin-ai-economics-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("query") ?? "").trim();
  if (!query || query.length > 200) {
    return NextResponse.redirect(new URL("/dashboard", url));
  }
  const rawScope = url.searchParams.get("scope");
  const scope = isDashboardSearchScope(rawScope) ? rawScope : "all";
  const aiRequested = url.searchParams.get("ai") === "1";
  const session = aiRequested ? await safeAuth() : null;
  const economics = session?.user?.id ? await getAiRuntimeEconomicsConfig() : null;
  const subscription = session?.user?.id
    ? await getAiSearchSubscriptionContext(session.user.id, new Date(), economics)
    : null;
  const usage = session?.user?.id && subscription
    ? await getAiSearchUsageStatus(
        session.user.id,
        subscription.premium,
        subscription.billingPeriod,
        subscription.tokenLimit,
      )
    : null;
  const aiEnabled = Boolean(
    aiRequested &&
      env.aiSearchBillingEnabled &&
      economics?.runtimeEnabled &&
      usage &&
      canStartAiSearch(usage),
  );
  const searchEventId = url.searchParams.get("searchEventId");

  const href =
    scope === "all"
      // Resolve scope locally so the only billable AI call is recorded by the search page.
      ? await resolveDashboardSearchHref({ query, aiEnabled: false })
      : buildDashboardSearchHref(query, scope, aiEnabled);

  const destination = new URL(href, url);
  if (aiEnabled) destination.searchParams.set("ai", "1");
  if (
    destination.pathname === "/search" &&
    searchEventId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(searchEventId)
  ) {
    destination.searchParams.set("searchEventId", searchEventId);
  }

  return NextResponse.redirect(destination);
}
