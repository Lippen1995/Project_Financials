import { redirect } from "next/navigation";

import { SearchHistoryDashboard } from "@/components/search/search-history-dashboard";
import { hasPremiumAiSearchAccess } from "@/lib/ai-search-usage";
import { safeAuth } from "@/lib/auth";
import { getSearchHistoryDashboard } from "@/server/services/search-history-service";

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
  const data = await getSearchHistoryDashboard(session.user.id, {
    page: readPage(params.page),
    premium: hasPremiumAiSearchAccess(
      session.user.subscriptionStatus,
      session.user.subscriptionPlan,
    ),
  });

  if (data.page > data.pageCount) redirect(`/search-history?page=${data.pageCount}`);

  return <SearchHistoryDashboard data={data} />;
}
