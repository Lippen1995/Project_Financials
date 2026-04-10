import { NextRequest, NextResponse } from "next/server";

import { getPetroleumMarketSeriesTimeseries } from "@/server/services/petroleum-market-macro-service";

export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ data: [] });
  }

  const data = await getPetroleumMarketSeriesTimeseries(slug);
  return NextResponse.json({ data });
}
