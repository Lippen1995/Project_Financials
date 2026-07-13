import { NextResponse } from "next/server";

import {
  buildDashboardSearchHref,
  isDashboardSearchScope,
} from "@/lib/dashboard-search";
import { resolveDashboardSearchHref } from "@/server/services/dashboard-search-routing-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("query") ?? "").trim();
  const rawScope = url.searchParams.get("scope");
  const scope = isDashboardSearchScope(rawScope) ? rawScope : "all";
  const aiEnabled = url.searchParams.get("ai") === "1";

  const href =
    scope === "all"
      ? await resolveDashboardSearchHref({ query, aiEnabled })
      : buildDashboardSearchHref(query, scope, aiEnabled);

  return NextResponse.redirect(new URL(href, url));
}
