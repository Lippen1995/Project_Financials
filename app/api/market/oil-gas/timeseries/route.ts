import { NextRequest, NextResponse } from "next/server";

import { queryPetroleumTimeseriesSchema } from "@/lib/petroleum-market";
import { getPetroleumMarketTimeseries } from "@/server/services/petroleum-market-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = queryPetroleumTimeseriesSchema.safeParse(searchParams);
  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid petroleum timeseries filters" },
      { status: 400 },
    );
  }
  const data = await getPetroleumMarketTimeseries({
    ...query.data,
  });

  return NextResponse.json({ data });
}
