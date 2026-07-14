import { NextRequest, NextResponse } from "next/server";

import env from "@/lib/env";
import { SEARCH_HISTORY_RETENTION_DAYS } from "@/lib/ai-search-usage";
import { deleteExpiredSearchHistory } from "@/server/services/search-history-service";

export async function GET(request: NextRequest) {
  if (!env.cronSecret || request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deleted = await deleteExpiredSearchHistory();
  return NextResponse.json({
    deleted,
    retentionDays: SEARCH_HISTORY_RETENTION_DAYS,
  });
}
