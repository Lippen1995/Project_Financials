import { NextRequest, NextResponse } from "next/server";

import env from "@/lib/env";
import { syncAndScoreNewsFeeds } from "@/server/services/news-aggregator-service";

function isAuthorized(request: NextRequest) {
  if (!env.newsSyncSecret) return false;
  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${env.newsSyncSecret}`) return true;
  return request.headers.get("x-news-sync-secret") === env.newsSyncSecret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncAndScoreNewsFeeds("scheduled");
    const { newArticleIds: _, ...publicResult } = result;
    return NextResponse.json({ data: publicResult });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "News sync failed" },
      { status: 500 },
    );
  }
}

export const GET = POST;
