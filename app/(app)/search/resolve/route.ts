import { NextResponse } from "next/server";

import {
  buildDashboardSearchHref,
  isDashboardSearchScope,
} from "@/lib/dashboard-search";
import { resolveDashboardSearchHref } from "@/server/services/dashboard-search-routing-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("query") ?? "").trim();
  if (!query || query.length > 200) {
    return NextResponse.redirect(new URL("/dashboard", url));
  }
  const rawScope = url.searchParams.get("scope");
  const scope = isDashboardSearchScope(rawScope) ? rawScope : "all";
  const aiEnabled = url.searchParams.get("ai") === "1";
  const searchEventId = url.searchParams.get("searchEventId");

  const href =
    scope === "all"
      ? await resolveDashboardSearchHref({ query, aiEnabled })
      : buildDashboardSearchHref(query, scope, aiEnabled);

  const destination = new URL(href, url);
  if (
    destination.pathname === "/search" &&
    searchEventId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(searchEventId)
  ) {
    destination.searchParams.set("searchEventId", searchEventId);
  }

  return NextResponse.redirect(destination);
}
