import { redirect } from "next/navigation";

import { SearchHistoryDashboard } from "@/components/search/search-history-dashboard";
import { safeAuth } from "@/lib/auth";
import env from "@/lib/env";
import { getAiSearchSubscriptionContext } from "@/server/billing/subscription";
import { getSearchHistoryDashboard } from "@/server/services/search-history-service";
import { getAiRuntimeEconomicsConfig } from "@/server/services/admin-ai-economics-service";

function readPage(value: string | string[] | undefined) {
  if (typeof value !== "string") return 1;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function SearchHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await safeAuth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;
  const economics = await getAiRuntimeEconomicsConfig();
  const subscription = await getAiSearchSubscriptionContext(
    session.user.id,
    new Date(),
    economics,
  );
  const data = await getSearchHistoryDashboard(session.user.id, {
    page: readPage(params.page),
    premium:
      subscription.premium &&
      env.aiSearchBillingEnabled &&
      Boolean(economics?.runtimeEnabled),
    billingPeriod: subscription.billingPeriod,
    tokenLimit: subscription.tokenLimit,
  });

  if (data.page > data.pageCount) redirect(`/search-history?page=${data.pageCount}`);

  return <SearchHistoryDashboard data={data} />;
}
